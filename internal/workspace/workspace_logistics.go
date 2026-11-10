package workspace

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/ajz007/shaadi-planner-pro/internal/httpx"
)

const (
	roomSection     = "Accommodation"
	followupSection = "RSVP Follow-up"
)

type logisticsRecord struct {
	ID       string `json:"id"`
	Section  string `json:"section"`
	Revision int    `json:"revision"`
	importRow
}

func logisticsSection(slug string) string {
	switch slug {
	case "accommodation":
		return roomSection
	case "rsvp-follow-up":
		return followupSection
	}
	return ""
}

func listLogistics(ctx context.Context, db workspaceRowsQueryer, wedding, actor, section string) ([]logisticsRecord, error) {
	return queryWorkspace(ctx, db, func(rows *sql.Rows, record *logisticsRecord) error {
		var payload []byte
		if err := rows.Scan(&record.ID, &record.Section, &record.Revision, &payload); err != nil {
			return err
		}
		return json.Unmarshal(payload, &record.importRow)
	}, `SELECT l.id, l.section_name, l.revision, l.payload FROM wedding_logistics_records l
	JOIN wedding_memberships m ON m.wedding_id = l.wedding_id
	WHERE l.wedding_id = $1 AND m.account_id = $2 AND m.role IN ('owner', 'co-organizer')
	AND ($3 = '' OR l.section_name = $3)
	ORDER BY NULLIF((l.payload->>'number')::int, 0) NULLS LAST, l.id`, wedding, actor, section)
}

func logisticsValues(record logisticsRecord, guests map[string]liveGuest, phones map[string]string) []string {
	size := 9
	if record.Section == roomSection {
		size = 16
	}
	values := make([]string, size)
	copy(values, record.Values)
	for index, id := range record.Guests {
		if guest, ok := guests[id]; ok {
			values[index] = guest.WorkbookID + " | " + guest.Name
		}
	}
	if record.Section == followupSection {
		if guest, ok := guests[record.Guests[0]]; ok {
			values[1], values[2], values[3] = guest.Household, phones[guest.WorkbookID], guest.RSVP
		}
		return values
	}
	if guest, ok := guests[record.Guests[3]]; ok {
		values[7], values[8] = guest.Household, guest.Side
	}
	count := len(record.Guests)
	values[9], values[14] = strconv.Itoa(count), "Complete"
	if record.Guests[3] == "" {
		values[14] = "Needs primary guest"
	} else if capacity := map[string]int{"single": 1, "double": 2, "triple": 3, "quad": 4}[strings.ToLower(values[2])]; capacity > 0 && count > capacity {
		values[14] = "Over room capacity"
	}
	return values
}

func (a *workspaceHTTP) logistics(w http.ResponseWriter, r *http.Request, actor string) {
	wedding, section := r.PathValue("wedding"), logisticsSection(r.PathValue("section"))
	if !workspaceUUID.MatchString(wedding) || section == "" {
		workspaceFailure(w, errWorkspaceNotFound)
		return
	}
	ctx := r.Context()
	if err := a.store.requireOrganizer(ctx, wedding, actor); err != nil {
		workspaceFailure(w, err)
		return
	}
	records, err := listLogistics(ctx, a.store.db, wedding, actor, section)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	guests, err := listLiveGuests(ctx, a.store.db, wedding, actor)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	byGuest := make(map[string]liveGuest)
	for _, guest := range guests {
		byGuest[guest.WorkbookID] = guest
	}
	phones := make(map[string]string)
	if section == followupSection {
		rows, err := a.store.db.QueryContext(ctx, `SELECT row->'values'->>0, row->'values'->>6
		FROM wedding_imported_sections i JOIN wedding_memberships m ON m.wedding_id = i.wedding_id
		CROSS JOIN LATERAL jsonb_array_elements(NULLIF(i.payload->'rows', 'null'::jsonb)) AS entry(row)
		WHERE i.wedding_id = $1 AND i.section_name = 'Guest List' AND m.account_id = $2
		AND m.role IN ('owner', 'co-organizer')`, wedding, actor)
		if err != nil {
			workspaceFailure(w, err)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var id, phone string
			if err := rows.Scan(&id, &phone); err != nil {
				workspaceFailure(w, err)
				return
			}
			phones[id] = phone
		}
		if err := rows.Err(); err != nil {
			workspaceFailure(w, err)
			return
		}
	}
	for i := range records {
		records[i].Values = logisticsValues(records[i], byGuest, phones)
	}
	httpx.Reply(w, http.StatusOK, records)
}

func (s *workspaceStore) requireOrganizer(ctx context.Context, wedding, actor string) error {
	var allowed bool
	err := s.db.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM wedding_memberships
		WHERE wedding_id = $1 AND account_id = $2 AND role IN ('owner', 'co-organizer'))`, wedding, actor).Scan(&allowed)
	if err == nil && !allowed {
		return errWorkspaceNotFound
	}
	return err
}

type logisticsInput struct {
	Values     map[int]string `json:"values"`
	GuestLinks map[int]string `json:"guestLinks"`
	Revision   int            `json:"revision"`
	Remove     bool           `json:"remove"`
}

func (input logisticsInput) row(section string) (importRow, bool) {
	size, firstGuest, lastGuest := 9, 0, 0
	editable := []int{4, 5, 6, 7, 8}
	dates := []int{4, 6}
	if section == roomSection {
		size, firstGuest, lastGuest = 16, 3, 6
		editable = []int{0, 1, 2, 10, 11, 12, 13, 15}
		dates = []int{10, 11}
	}
	row := importRow{Values: make([]string, size), Guests: input.GuestLinks}
	for _, index := range editable {
		value := strings.TrimSpace(input.Values[index])
		if utf8.RuneCountInString(value) > 500 {
			return row, false
		}
		row.Values[index] = value
	}
	for _, index := range dates {
		if value := row.Values[index]; value != "" {
			if _, err := time.Parse(time.DateOnly, value); err != nil {
				return row, false
			}
		}
	}
	seen := make(map[string]bool)
	for index, guest := range row.Guests {
		if index < firstGuest || index > lastGuest || guest == "" || seen[guest] {
			return row, false
		}
		seen[guest] = true
	}
	if section == roomSection {
		return row, row.Values[0] != "" && row.Values[1] != "" &&
			(row.Values[10] == "" || row.Values[11] == "" || row.Values[10] <= row.Values[11]) &&
			(len(row.Guests) == 0 || row.Guests[3] != "")
	}
	return row, row.Guests[0] != ""
}

func (a *workspaceHTTP) saveLogistics(w http.ResponseWriter, r *http.Request, actor string) {
	wedding, section, id := r.PathValue("wedding"), logisticsSection(r.PathValue("section")), r.PathValue("record")
	if !workspaceUUID.MatchString(wedding) || section == "" || (id != "new" && !workspaceUUID.MatchString(id)) {
		workspaceFailure(w, errWorkspaceNotFound)
		return
	}
	ctx := r.Context()
	if err := a.store.requireOrganizer(ctx, wedding, actor); err != nil {
		workspaceFailure(w, err)
		return
	}
	var input logisticsInput
	if !httpx.ReadJSON(w, r, &input) {
		return
	}
	if id != "new" && input.Revision < 1 || id == "new" && input.Remove {
		workspaceFailure(w, errWorkspaceInput)
		return
	}
	if input.Remove {
		err := scanWorkspace(a.store.db.QueryRowContext(ctx, `DELETE FROM wedding_logistics_records l
			WHERE l.wedding_id = $1 AND l.section_name = $2 AND l.id = $3 AND l.revision = $4
			AND EXISTS (SELECT 1 FROM wedding_memberships WHERE wedding_id = $1 AND account_id = $5
			AND role IN ('owner', 'co-organizer')) RETURNING id`, wedding, section, id, input.Revision, actor), &id)
		finishLogisticsSave(w, id, false, err)
		return
	}
	row, valid := input.row(section)
	if !valid {
		httpx.Fail(w, http.StatusUnprocessableEntity, "Check the required fields, dates and guest selections. Select each guest only once per room.")
		return
	}
	guests, err := listLiveGuests(ctx, a.store.db, wedding, actor)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	known := make(map[string]bool)
	for _, guest := range guests {
		known[guest.WorkbookID] = true
	}
	for _, guest := range row.Guests {
		if !known[guest] {
			httpx.Fail(w, http.StatusUnprocessableEntity, "Choose guests from this wedding’s Guest List.")
			return
		}
	}
	payload, err := json.Marshal(row)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	create := id == "new"
	if create {
		err = scanWorkspace(a.store.db.QueryRowContext(ctx, `INSERT INTO wedding_logistics_records (wedding_id, section_name, payload)
			SELECT $1::uuid, $2::text, $3::jsonb FROM wedding_memberships WHERE wedding_id = $1 AND account_id = $4
			AND role IN ('owner', 'co-organizer') RETURNING id`, wedding, section, payload, actor), &id)
	} else {
		err = scanWorkspace(a.store.db.QueryRowContext(ctx, `UPDATE wedding_logistics_records l
			SET payload = jsonb_set($3::jsonb, '{number}', payload->'number'), revision = revision + 1
			WHERE wedding_id = $1 AND section_name = $2 AND id = $5 AND revision = $6
			AND EXISTS (SELECT 1 FROM wedding_memberships WHERE wedding_id = $1 AND account_id = $4
			AND role IN ('owner', 'co-organizer')) RETURNING id`, wedding, section, payload, actor, id, input.Revision), &id)
	}
	finishLogisticsSave(w, id, create, err)
}

func finishLogisticsSave(w http.ResponseWriter, id string, create bool, err error) {
	if err == errWorkspaceNotFound && !create {
		err = errWorkspaceConflict
	}
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	status := http.StatusOK
	if create {
		status = http.StatusCreated
	}
	httpx.Reply(w, status, map[string]string{"id": id})
}

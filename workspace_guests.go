package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"
)

type liveGuest struct {
	ID                string          `json:"id"`
	WorkbookID        string          `json:"workbookId"`
	Name              string          `json:"name"`
	Household         string          `json:"household"`
	Side              string          `json:"side"`
	RSVP              string          `json:"rsvp"`
	ArrivalDate       string          `json:"arrivalDate"`
	ArrivalTime       string          `json:"arrivalTime"`
	ArrivalMode       string          `json:"arrivalMode"`
	TransportRequired string          `json:"transportRequired"`
	Revision          int             `json:"revision"`
	Links             []guestPlanLink `json:"links,omitempty"`
}

type guestPlanLink struct {
	Section string `json:"section"`
	Label   string `json:"label"`
	Detail  string `json:"detail"`
}

const guestColumns = `g.id, g.workbook_id, g.name, g.household, g.side, g.wedding_rsvp,
	COALESCE(g.arrival_date::text, ''), COALESCE(to_char(g.arrival_time, 'HH24:MI'), ''),
	g.arrival_mode, g.transport_required, g.revision`

func scanGuest(row *sql.Rows, guest *liveGuest) error {
	return row.Scan(&guest.ID, &guest.WorkbookID, &guest.Name, &guest.Household, &guest.Side, &guest.RSVP,
		&guest.ArrivalDate, &guest.ArrivalTime, &guest.ArrivalMode, &guest.TransportRequired, &guest.Revision)
}

func listLiveGuests(ctx context.Context, db workspaceRowsQueryer, wedding, actor string) ([]liveGuest, error) {
	return queryWorkspace(ctx, db, scanGuest, `SELECT `+guestColumns+`
		FROM wedding_guests g JOIN wedding_memberships m ON m.wedding_id = g.wedding_id
		WHERE g.wedding_id = $1 AND m.account_id = $2 AND m.role IN ('owner', 'co-organizer')
		ORDER BY g.name, g.workbook_id`, wedding, actor)
}

func (a *workspaceHTTP) guests(w http.ResponseWriter, r *http.Request, actor string) {
	wedding := r.PathValue("wedding")
	if !workspaceUUID.MatchString(wedding) {
		workspaceFailure(w, errWorkspaceNotFound)
		return
	}
	var allowed bool
	err := a.store.db.QueryRowContext(r.Context(), `
		SELECT EXISTS (SELECT 1 FROM wedding_memberships WHERE wedding_id = $1 AND account_id = $2
		AND role IN ('owner', 'co-organizer'))`, wedding, actor).Scan(&allowed)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	if !allowed {
		workspaceFailure(w, errWorkspaceNotFound)
		return
	}
	guests, err := listLiveGuests(r.Context(), a.store.db, wedding, actor)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	links, err := a.guestPlanLinks(r.Context(), wedding, actor)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	for i := range guests {
		guests[i].Links = links[guests[i].WorkbookID]
	}
	reply(w, http.StatusOK, guests)
}

func (a *workspaceHTTP) guestPlanLinks(ctx context.Context, wedding, actor string) (map[string][]guestPlanLink, error) {
	sections, err := queryWorkspace(ctx, a.store.db, func(rows *sql.Rows, section *importSection) error {
		var payload []byte
		if err := rows.Scan(&payload); err != nil {
			return err
		}
		return json.Unmarshal(payload, section)
	}, `SELECT i.payload FROM wedding_imported_sections i JOIN wedding_memberships m ON m.wedding_id = i.wedding_id
		WHERE i.wedding_id = $1 AND m.account_id = $2 AND m.role IN ('owner', 'co-organizer')
		AND i.section_name IN ('Accommodation', 'Transportation', 'RSVP Follow-up') ORDER BY i.position`, wedding, actor)
	if err != nil {
		return nil, err
	}
	links := make(map[string][]guestPlanLink)
	for _, section := range sections {
		for _, row := range section.Rows {
			values := row.Values
			link := guestPlanLink{Section: section.Name}
			switch section.Name {
			case "Accommodation":
				link.Label = values[0] + " · Room " + values[1]
				link.Detail = strings.Trim(strings.Join([]string{values[10], values[11]}, " – "), " –")
			case "Transportation":
				link.Label, link.Detail = values[2]+" → "+values[3], strings.TrimSpace(values[0]+" "+values[1])
			case "RSVP Follow-up":
				link.Label, link.Detail = values[7], strings.TrimSpace(values[4]+" "+values[5])
			}
			seen := make(map[string]bool)
			for _, id := range row.Guests {
				if !seen[id] {
					links[id] = append(links[id], link)
					seen[id] = true
				}
			}
		}
	}
	return links, nil
}

func (guest *liveGuest) valid() bool {
	for _, field := range []*string{&guest.Name, &guest.Household, &guest.Side, &guest.RSVP, &guest.ArrivalDate,
		&guest.ArrivalTime, &guest.ArrivalMode, &guest.TransportRequired} {
		*field = strings.TrimSpace(*field)
		if utf8.RuneCountInString(*field) > 120 {
			return false
		}
	}
	if guest.Name == "" {
		return false
	}
	if guest.ArrivalDate != "" {
		if _, err := time.Parse(time.DateOnly, guest.ArrivalDate); err != nil {
			return false
		}
	}
	if guest.ArrivalTime != "" {
		if parsed, err := time.Parse("15:04", guest.ArrivalTime); err != nil || parsed.Format("15:04") != guest.ArrivalTime {
			return false
		}
	}
	return true
}

func (a *workspaceHTTP) saveGuest(w http.ResponseWriter, r *http.Request, actor string) {
	wedding, id := r.PathValue("wedding"), r.PathValue("guest")
	if !workspaceUUID.MatchString(wedding) || (id != "" && !workspaceUUID.MatchString(id)) {
		workspaceFailure(w, errWorkspaceNotFound)
		return
	}
	var guest liveGuest
	if !readJSON(w, r, &guest) {
		return
	}
	if !guest.valid() || (id != "" && guest.Revision < 1) || guest.ID != "" || guest.WorkbookID != "" || guest.Links != nil {
		workspaceFailure(w, errWorkspaceInput)
		return
	}
	ctx := r.Context()
	args := []any{wedding, actor, guest.Name, guest.Household, guest.Side, guest.RSVP, guest.ArrivalDate,
		guest.ArrivalTime, guest.ArrivalMode, guest.TransportRequired}
	if id == "" {
		err := scanWorkspace(a.store.db.QueryRowContext(ctx, `
			INSERT INTO wedding_guests (wedding_id, workbook_id, name, household, side, wedding_rsvp,
				arrival_date, arrival_time, arrival_mode, transport_required)
			SELECT wedding_id, 'G-' || gen_random_uuid()::text, $3, $4, $5, $6,
				NULLIF($7, '')::date, NULLIF($8, '')::time, $9, $10
			FROM wedding_memberships WHERE wedding_id = $1 AND account_id = $2 AND role IN ('owner', 'co-organizer')
			RETURNING id`, args...), &id)
		workspaceCreated(w, id, err)
		return
	}
	args = append(args, id, guest.Revision)
	var revision int
	err := scanWorkspace(a.store.db.QueryRowContext(ctx, `
		UPDATE wedding_guests g SET name = $3, household = $4, side = $5, wedding_rsvp = $6,
			arrival_date = NULLIF($7, '')::date, arrival_time = NULLIF($8, '')::time,
			arrival_mode = $9, transport_required = $10, revision = g.revision + 1
		FROM wedding_memberships m
		WHERE g.wedding_id = $1 AND g.id = $11 AND g.revision = $12
		AND m.wedding_id = g.wedding_id AND m.account_id = $2 AND m.role IN ('owner', 'co-organizer')
		RETURNING g.revision`, args...), &revision)
	if err == errWorkspaceNotFound {
		err = scanWorkspace(a.store.db.QueryRowContext(ctx, `
			SELECT g.revision FROM wedding_guests g JOIN wedding_memberships m ON m.wedding_id = g.wedding_id
			WHERE g.wedding_id = $1 AND m.account_id = $2 AND g.id = $3 AND m.role IN ('owner', 'co-organizer')`, wedding, actor, id), &revision)
		if err == nil {
			err = errWorkspaceConflict
		}
	}
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	reply(w, http.StatusOK, map[string]int{"revision": revision})
}

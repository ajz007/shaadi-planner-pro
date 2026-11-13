package workspace

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/ajz007/shaadi-planner-pro/internal/httpx"
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
	StayRequired      string          `json:"stayRequired"`
	Revision          int             `json:"revision"`
	Links             []guestPlanLink `json:"links,omitempty"`
	Labels            []string        `json:"labels,omitempty"`
}

type guestPlanLink struct {
	Section string `json:"section"`
	Label   string `json:"label"`
	Detail  string `json:"detail"`
}

const guestColumns = `g.id, g.workbook_id, g.name, g.household, g.side, g.wedding_rsvp,
	COALESCE(g.arrival_date::text, ''), COALESCE(to_char(g.arrival_time, 'HH24:MI'), ''),
	g.arrival_mode, g.transport_required, g.stay_required, g.revision,
	COALESCE((SELECT jsonb_agg(l.name ORDER BY lower(l.name), l.name)
		FROM wedding_guest_label_assignments a JOIN wedding_guest_labels l ON l.wedding_id=a.wedding_id AND l.id=a.label_id
		WHERE a.wedding_id=g.wedding_id AND a.guest_id=g.id), '[]'::jsonb)`

func scanGuest(row *sql.Rows, guest *liveGuest) error {
	var labels []byte
	if err := row.Scan(&guest.ID, &guest.WorkbookID, &guest.Name, &guest.Household, &guest.Side, &guest.RSVP,
		&guest.ArrivalDate, &guest.ArrivalTime, &guest.ArrivalMode, &guest.TransportRequired, &guest.StayRequired, &guest.Revision, &labels); err != nil {
		return err
	}
	return json.Unmarshal(labels, &guest.Labels)
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
	if err := a.store.requireOrganizer(r.Context(), wedding, actor); err != nil {
		workspaceFailure(w, err)
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
	httpx.Reply(w, http.StatusOK, guests)
}

func (a *workspaceHTTP) guestPlanLinks(ctx context.Context, wedding, actor string) (map[string][]guestPlanLink, error) {
	records, err := listLogistics(ctx, a.store.db, wedding, actor, "")
	if err != nil {
		return nil, err
	}
	links := make(map[string][]guestPlanLink)
	for _, record := range records {
		values := record.Values
		link := guestPlanLink{Section: record.Section}
		switch record.Section {
		case roomSection:
			link.Label = values[0] + " · Room " + values[1]
			link.Detail = strings.Trim(strings.Join([]string{values[10], values[11]}, " – "), " –")
		case followupSection:
			link.Label, link.Detail = values[7], strings.TrimSpace(values[4]+" "+values[5])
		}
		seen := make(map[string]bool)
		for _, id := range record.Guests {
			if !seen[id] {
				links[id] = append(links[id], link)
				seen[id] = true
			}
		}
	}
	pickups, err := listPickups(ctx, a.store.db, wedding, actor)
	if err != nil {
		return nil, err
	}
	for _, pickup := range pickups {
		if pickup.Status == "Cancelled" {
			continue
		}
		detail := strings.TrimSpace(pickup.Date + " " + pickup.Time)
		if pickup.NeedsReview {
			detail += " · Needs review"
		}
		link := guestPlanLink{Section: "Transportation", Label: pickup.PickupPoint + " → " + pickup.DropPoint, Detail: detail}
		for _, passenger := range pickup.Passengers {
			links[passenger.WorkbookID] = append(links[passenger.WorkbookID], link)
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
	var input struct {
		liveGuest
		StayRequired *string `json:"stayRequired"`
	}
	if !httpx.ReadJSON(w, r, &input) {
		return
	}
	guest := input.liveGuest
	if input.StayRequired != nil {
		*input.StayRequired = strings.TrimSpace(*input.StayRequired)
		if utf8.RuneCountInString(*input.StayRequired) > 120 {
			workspaceFailure(w, errWorkspaceInput)
			return
		}
	}
	if !guest.valid() || (id != "" && guest.Revision < 1) || guest.ID != "" || guest.WorkbookID != "" || guest.Links != nil {
		workspaceFailure(w, errWorkspaceInput)
		return
	}
	ctx := r.Context()
	args := []any{wedding, actor, guest.Name, guest.Household, guest.Side, guest.RSVP, guest.ArrivalDate,
		guest.ArrivalTime, guest.ArrivalMode, guest.TransportRequired, input.StayRequired}
	if id == "" {
		err := scanWorkspace(a.store.db.QueryRowContext(ctx, `
			INSERT INTO wedding_guests (wedding_id, workbook_id, name, household, side, wedding_rsvp,
				arrival_date, arrival_time, arrival_mode, transport_required, stay_required)
			SELECT wedding_id, 'G-' || gen_random_uuid()::text, $3, $4, $5, $6,
				NULLIF($7, '')::date, NULLIF($8, '')::time, $9, $10, COALESCE($11, '')
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
			arrival_mode = $9, transport_required = $10, stay_required = COALESCE($11, g.stay_required), revision = g.revision + 1
		FROM wedding_memberships m
		WHERE g.wedding_id = $1 AND g.id = $12 AND g.revision = $13
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
	httpx.Reply(w, http.StatusOK, map[string]int{"revision": revision})
}

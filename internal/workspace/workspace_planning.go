package workspace

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/ajz007/shaadi-planner-pro/internal/httpx"
)

type savedPlace struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Address      string `json:"address"`
	MapURL       string `json:"mapUrl"`
	Instructions string `json:"instructions"`
	Revision     int    `json:"revision"`
}

type requiredPerson struct {
	PersonID string `json:"personId"`
	Role     string `json:"role"`
	NeededBy string `json:"neededBy"`
}

type requiredItem struct {
	Name     string `json:"name"`
	Category string `json:"category"`
	Quantity string `json:"quantity"`
	Unit     string `json:"unit"`
	PersonID string `json:"personId"`
	For      string `json:"for"`
	NeededBy string `json:"neededBy"`
	Handoff  string `json:"handoff"`
	Status   string `json:"status"`
}

type functionReadiness struct {
	ID       string           `json:"id"`
	Name     string           `json:"name"`
	Venue    string           `json:"venue"`
	StartsAt time.Time        `json:"startsAt"`
	PlaceID  string           `json:"placeId"`
	Duration *int             `json:"duration"`
	People   []requiredPerson `json:"people"`
	Items    []requiredItem   `json:"items"`
	Revision int              `json:"revision"`
}

type weddingPlanning struct {
	Places    []savedPlace        `json:"places"`
	Functions []functionReadiness `json:"functions"`
}

const planningOrganizer = `EXISTS (SELECT 1 FROM wedding_memberships
	WHERE wedding_id = $1 AND account_id = $2 AND role IN ('owner', 'co-organizer'))`

func listPlanning(ctx context.Context, db workspaceRowsQueryer, wedding, actor string) (weddingPlanning, error) {
	places, err := queryWorkspace(ctx, db, func(rows *sql.Rows, place *savedPlace) error {
		return rows.Scan(&place.ID, &place.Name, &place.Address, &place.MapURL, &place.Instructions, &place.Revision)
	}, `SELECT id, name, address, map_url, instructions, revision FROM wedding_places WHERE wedding_id=$1 AND `+planningOrganizer+` ORDER BY name, id`, wedding, actor)
	if err != nil {
		return weddingPlanning{}, err
	}
	functions, err := queryWorkspace(ctx, db, func(rows *sql.Rows, entry *functionReadiness) error {
		var people, items []byte
		if err := rows.Scan(&entry.ID, &entry.Name, &entry.Venue, &entry.StartsAt, &entry.PlaceID, &entry.Duration, &people, &items, &entry.Revision); err != nil {
			return err
		}
		if err := json.Unmarshal(people, &entry.People); err != nil {
			return err
		}
		return json.Unmarshal(items, &entry.Items)
	}, `SELECT id, name, venue, starts_at, COALESCE(place_id::text,''), duration_minutes,
		COALESCE(required_people, 'null'::jsonb), required_items, revision FROM wedding_functions
		WHERE wedding_id=$1 AND `+planningOrganizer+` ORDER BY starts_at,id`, wedding, actor)
	return weddingPlanning{Places: places, Functions: functions}, err
}

func (a *workspaceHTTP) planning(w http.ResponseWriter, r *http.Request, actor string) {
	wedding := r.PathValue("wedding")
	if !workspaceUUID.MatchString(wedding) {
		workspaceFailure(w, errWorkspaceNotFound)
		return
	}
	if err := a.store.requireOrganizer(r.Context(), wedding, actor); err != nil {
		workspaceFailure(w, err)
		return
	}
	data, err := listPlanning(r.Context(), a.store.db, wedding, actor)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	httpx.Reply(w, http.StatusOK, data)
}

type functionInput struct {
	Name, Venue, Start, PlaceID string
	Duration                    *int
	People                      []requiredPerson
	Items                       []requiredItem
	Revision                    int
}

func (a *workspaceHTTP) savePlanning(w http.ResponseWriter, r *http.Request, actor string) {
	wedding, kind, id := r.PathValue("wedding"), r.PathValue("kind"), r.PathValue("record")
	if !workspaceUUID.MatchString(wedding) || (id != "new" && !workspaceUUID.MatchString(id)) {
		workspaceFailure(w, errWorkspaceNotFound)
		return
	}
	ctx := r.Context()
	if err := a.store.requireOrganizer(ctx, wedding, actor); err != nil {
		workspaceFailure(w, err)
		return
	}
	var err error
	switch kind {
	case "places":
		var input savedPlace
		if !httpx.ReadJSON(w, r, &input) {
			return
		}
		err = a.store.savePlace(ctx, wedding, actor, id, input)
	case "functions":
		var input functionInput
		if !httpx.ReadJSON(w, r, &input) {
			return
		}
		err = a.store.saveFunctionDetails(ctx, wedding, actor, id, input)
	default:
		err = errWorkspaceNotFound
	}
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *workspaceStore) savePlace(ctx context.Context, wedding, actor, id string, p savedPlace) error {
	p.Name, p.Address, p.MapURL, p.Instructions = strings.TrimSpace(p.Name), strings.TrimSpace(p.Address), strings.TrimSpace(p.MapURL), strings.TrimSpace(p.Instructions)
	if !validLabel(p.Name, 120) || !validLabel(p.Address, 500) || len(p.Instructions) > 2000 || len(p.MapURL) > 2048 {
		return errWorkspaceInput
	}
	if p.MapURL != "" {
		u, err := url.Parse(p.MapURL)
		if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil {
			return errWorkspaceInput
		}
	}
	var err error
	if id == "new" {
		err = scanWorkspace(s.db.QueryRowContext(ctx, `INSERT INTO wedding_places (wedding_id,name,address,map_url,instructions)
			SELECT $1,$3,$4,$5,$6 WHERE `+planningOrganizer+` RETURNING id`, wedding, actor, p.Name, p.Address, p.MapURL, p.Instructions), &id)
	} else {
		err = scanWorkspace(s.db.QueryRowContext(ctx, `UPDATE wedding_places SET name=$3,address=$4,map_url=$5,instructions=$6,revision=revision+1
			WHERE wedding_id=$1 AND id=$7 AND revision=$8 AND `+planningOrganizer+` RETURNING id`, wedding, actor, p.Name, p.Address, p.MapURL, p.Instructions, id, p.Revision), &id)
		if err == errWorkspaceNotFound {
			err = errWorkspaceConflict
		}
	}
	return err
}

func validDeadline(value string) bool {
	if value == "" {
		return true
	}
	_, err := time.Parse("2006-01-02T15:04", value)
	return err == nil
}

func (s *workspaceStore) saveFunctionDetails(ctx context.Context, wedding, actor, id string, f functionInput) error {
	f.Name, f.Venue = strings.TrimSpace(f.Name), strings.TrimSpace(f.Venue)
	if !validLabel(f.Name, 120) || len(f.Venue) > 400 || (f.PlaceID != "" && !workspaceUUID.MatchString(f.PlaceID)) ||
		(f.Duration != nil && (*f.Duration < 1 || *f.Duration > 1440)) || len(f.People) > 100 || len(f.Items) > 100 {
		return errWorkspaceInput
	}
	var zone string
	if err := scanWorkspace(s.db.QueryRowContext(ctx, `SELECT time_zone FROM weddings WHERE id=$1 AND `+planningOrganizer, wedding, actor), &zone); err != nil {
		return err
	}
	location, err := time.LoadLocation(zone)
	if err != nil {
		return err
	}
	start, err := time.ParseInLocation("2006-01-02T15:04", f.Start, location)
	if err != nil {
		return errWorkspaceInput
	}
	people, err := queryWorkspace(ctx, s.db, func(rows *sql.Rows, id *string) error { return rows.Scan(id) },
		`SELECT id FROM wedding_people WHERE wedding_id=$1`, wedding)
	if err != nil {
		return err
	}
	known, seen := make(map[string]bool), make(map[string]bool)
	for _, person := range people {
		known[person] = true
	}
	for _, person := range f.People {
		if !known[person.PersonID] || seen[person.PersonID] || len(person.Role) > 240 || !validDeadline(person.NeededBy) {
			return errWorkspaceInput
		}
		seen[person.PersonID] = true
	}
	for _, item := range f.Items {
		if !validLabel(item.Name, 120) || len(item.Category) > 120 || len(item.Quantity) > 30 || len(item.Unit) > 60 ||
			len(item.For) > 240 || len(item.Handoff) > 500 || (item.PersonID != "" && !known[item.PersonID]) ||
			!validDeadline(item.NeededBy) || (item.Status != "To arrange" && item.Status != "Packed" && item.Status != "At venue") {
			return errWorkspaceInput
		}
	}
	if f.Items == nil {
		f.Items = []requiredItem{}
	}
	attendance, err := json.Marshal(f.People)
	if err != nil {
		return err
	}
	items, err := json.Marshal(f.Items)
	if err != nil {
		return err
	}
	if id == "new" {
		return scanWorkspace(s.db.QueryRowContext(ctx, `INSERT INTO wedding_functions (wedding_id,name,venue,starts_at,place_id,duration_minutes,required_people,required_items)
			SELECT $1,$3,$4,$5,NULLIF($6,'')::uuid,$7,$8::jsonb,$9::jsonb WHERE `+planningOrganizer+` RETURNING id`,
			wedding, actor, f.Name, f.Venue, start, f.PlaceID, f.Duration, attendance, items), &id)
	}
	err = scanWorkspace(s.db.QueryRowContext(ctx, `UPDATE wedding_functions SET name=$3,venue=$4,starts_at=$5,place_id=NULLIF($6,'')::uuid,
		duration_minutes=$7,required_people=$8::jsonb,required_items=$9::jsonb,revision=revision+1
		WHERE wedding_id=$1 AND id=$10 AND revision=$11 AND `+planningOrganizer+` RETURNING id`,
		wedding, actor, f.Name, f.Venue, start, f.PlaceID, f.Duration, attendance, items, id, f.Revision), &id)
	if err == errWorkspaceNotFound {
		return errWorkspaceConflict
	}
	return err
}

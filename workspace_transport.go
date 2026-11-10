package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"
)

type guestArrival struct {
	Date      string `json:"date"`
	Time      string `json:"time"`
	Mode      string `json:"mode"`
	Transport string `json:"transport"`
}

type pickupPassenger struct {
	ID         string       `json:"id"`
	WorkbookID string       `json:"workbookId"`
	Name       string       `json:"name"`
	Household  string       `json:"household"`
	Revision   int          `json:"revision"`
	Arrival    guestArrival `json:"arrival"`
	Reviewed   guestArrival `json:"reviewed"`
}

type savedPickup struct {
	ID              string            `json:"id"`
	Date            string            `json:"date"`
	Time            string            `json:"time"`
	PickupPoint     string            `json:"pickupPoint"`
	DropPoint       string            `json:"dropPoint"`
	Vehicle         string            `json:"vehicle"`
	VehicleNumber   string            `json:"vehicleNumber"`
	Driver          string            `json:"driver"`
	OwnerID         string            `json:"ownerId"`
	Owner           string            `json:"owner"`
	Status          string            `json:"status"`
	DriverConfirmed string            `json:"driverConfirmed"`
	Notes           string            `json:"notes"`
	Revision        int               `json:"revision"`
	Passengers      []pickupPassenger `json:"passengers"`
	NeedsReview     bool              `json:"needsReview"`
}

func listPickups(ctx context.Context, db workspaceRowsQueryer, wedding, actor string) ([]savedPickup, error) {
	return queryWorkspace(ctx, db, func(rows *sql.Rows, pickup *savedPickup) error {
		var payload []byte
		err := rows.Scan(&pickup.ID, &pickup.Date, &pickup.Time, &pickup.PickupPoint, &pickup.DropPoint, &pickup.Vehicle,
			&pickup.VehicleNumber, &pickup.Driver, &pickup.OwnerID, &pickup.Owner, &pickup.Status, &pickup.DriverConfirmed, &pickup.Notes, &pickup.Revision, &payload)
		if err != nil {
			return err
		}
		if err := json.Unmarshal(payload, &pickup.Passengers); err != nil {
			return err
		}
		for _, passenger := range pickup.Passengers {
			if pickup.Status != "Cancelled" && passenger.Arrival != passenger.Reviewed {
				pickup.NeedsReview = true
			}
		}
		return nil
	}, `SELECT p.id, COALESCE(p.pickup_date::text, ''), p.pickup_time, p.pickup_point, p.drop_point, p.vehicle,
		p.vehicle_number, p.driver, COALESCE(p.owner_id::text, ''), COALESCE(o.name, p.imported_owner),
		p.status, p.driver_confirmed, p.notes, p.revision, COALESCE(passengers.payload, '[]'::jsonb)
	FROM wedding_pickups p
	JOIN wedding_memberships m ON m.wedding_id = p.wedding_id AND m.account_id = $2 AND m.role IN ('owner', 'co-organizer')
	LEFT JOIN wedding_people o ON o.wedding_id = p.wedding_id AND o.id = p.owner_id
	LEFT JOIN LATERAL (
		SELECT jsonb_agg(jsonb_build_object(
			'id', g.id, 'workbookId', g.workbook_id, 'name', g.name, 'household', g.household, 'revision', g.revision,
			'arrival', jsonb_build_object('date', COALESCE(g.arrival_date::text, ''), 'time', COALESCE(to_char(g.arrival_time, 'HH24:MI'), ''),
				'mode', g.arrival_mode, 'transport', g.transport_required),
			'reviewed', jsonb_build_object('date', COALESCE(l.arrival_date::text, ''), 'time', l.arrival_time,
				'mode', l.arrival_mode, 'transport', l.transport_required)
		) ORDER BY l.position, g.id) AS payload
		FROM wedding_pickup_passengers l JOIN wedding_guests g ON g.wedding_id = l.wedding_id AND g.id = l.guest_id
		WHERE l.wedding_id = p.wedding_id AND l.pickup_id = p.id
	) passengers ON true
	WHERE p.wedding_id = $1 ORDER BY p.pickup_date NULLS LAST, p.pickup_time, p.id`, wedding, actor)
}

type pickupInput struct {
	Date, Time, PickupPoint, DropPoint, Vehicle, VehicleNumber, Driver, OwnerID, Status, DriverConfirmed, Notes string
	Revision                                                                                                    int
	Passengers                                                                                                  []struct {
		ID       string
		Revision int
	}
}

func (p *pickupInput) valid(id string) bool {
	for _, value := range []*string{&p.PickupPoint, &p.DropPoint, &p.Vehicle, &p.VehicleNumber, &p.Driver, &p.Notes} {
		*value = strings.TrimSpace(*value)
		if utf8.RuneCountInString(*value) > 500 {
			return false
		}
	}
	_, dateErr := time.Parse(time.DateOnly, p.Date)
	clock, timeErr := time.Parse("15:04", p.Time)
	if dateErr != nil || timeErr != nil || clock.Format("15:04") != p.Time || p.PickupPoint == "" || p.DropPoint == "" ||
		(p.OwnerID != "" && !workspaceUUID.MatchString(p.OwnerID)) || (id != "" && p.Revision < 1) ||
		(p.Status != "Planned" && p.Status != "Pending" && p.Status != "Confirmed" && p.Status != "Cancelled" && p.Status != "Completed") ||
		(p.DriverConfirmed != "" && p.DriverConfirmed != "Yes" && p.DriverConfirmed != "No") ||
		len(p.Passengers) == 0 || len(p.Passengers) > 100 {
		return false
	}
	seen := make(map[string]bool)
	for _, passenger := range p.Passengers {
		key := strings.ToLower(passenger.ID)
		if !workspaceUUID.MatchString(key) || passenger.Revision < 1 || seen[key] {
			return false
		}
		seen[key] = true
	}
	return true
}

func (a *workspaceHTTP) pickups(w http.ResponseWriter, r *http.Request, actor string) {
	wedding := r.PathValue("wedding")
	if !workspaceUUID.MatchString(wedding) {
		workspaceFailure(w, errWorkspaceNotFound)
		return
	}
	var role string
	if err := scanWorkspace(a.store.db.QueryRowContext(r.Context(), `SELECT role FROM wedding_memberships
		WHERE wedding_id = $1 AND account_id = $2 AND role IN ('owner', 'co-organizer')`, wedding, actor), &role); err != nil {
		workspaceFailure(w, err)
		return
	}
	pickups, err := listPickups(r.Context(), a.store.db, wedding, actor)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	reply(w, http.StatusOK, pickups)
}

func (a *workspaceHTTP) savePickup(w http.ResponseWriter, r *http.Request, actor string) {
	wedding, id := r.PathValue("wedding"), r.PathValue("pickup")
	if !workspaceUUID.MatchString(wedding) || (id != "" && !workspaceUUID.MatchString(id)) {
		workspaceFailure(w, errWorkspaceNotFound)
		return
	}
	var input pickupInput
	if !readJSON(w, r, &input) {
		return
	}
	if !input.valid(id) {
		fail(w, http.StatusUnprocessableEntity, "Enter the pickup date, time, route and at least one guest.")
		return
	}
	saved, err := a.store.savePickup(r.Context(), wedding, actor, id, input)
	if errors.Is(err, errWorkspaceConflict) {
		fail(w, http.StatusConflict, "The pickup or a passenger’s guest record changed. Refresh the plan and review the latest details.")
		return
	}
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	status := http.StatusOK
	if id == "" {
		status = http.StatusCreated
	}
	reply(w, status, map[string]string{"id": saved})
}

func (s *workspaceStore) savePickup(ctx context.Context, wedding, actor, id string, p pickupInput) (string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	var role string
	if err := scanWorkspace(tx.QueryRowContext(ctx, `SELECT role FROM wedding_memberships
		WHERE wedding_id = $1 AND account_id = $2 AND role IN ('owner', 'co-organizer') FOR SHARE`, wedding, actor), &role); err != nil {
		return "", err
	}
	args := []any{wedding, p.Date, p.Time, p.PickupPoint, p.DropPoint, p.Vehicle, p.VehicleNumber, p.Driver,
		p.OwnerID, p.Status, p.DriverConfirmed, p.Notes}
	if id == "" {
		err = scanWorkspace(tx.QueryRowContext(ctx, `INSERT INTO wedding_pickups (wedding_id, pickup_date, pickup_time,
			pickup_point, drop_point, vehicle, vehicle_number, driver, owner_id, status, driver_confirmed, notes)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULLIF($9,'')::uuid, $10, $11, $12) RETURNING id`, args...), &id)
	} else {
		args = append(args, id, p.Revision)
		var updated string
		err = scanWorkspace(tx.QueryRowContext(ctx, `UPDATE wedding_pickups SET pickup_date = $2, pickup_time = $3,
			pickup_point = $4, drop_point = $5, vehicle = $6, vehicle_number = $7, driver = $8, owner_id = NULLIF($9,'')::uuid,
			imported_owner = CASE WHEN $9 = '' THEN imported_owner ELSE '' END,
			status = $10, driver_confirmed = $11, notes = $12, revision = revision + 1
			WHERE wedding_id = $1 AND id = $13 AND revision = $14 RETURNING id`, args...), &updated)
		if errors.Is(err, errWorkspaceNotFound) {
			return "", errWorkspaceConflict
		}
	}
	if err != nil {
		return "", err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM wedding_pickup_passengers WHERE wedding_id = $1 AND pickup_id = $2", wedding, id); err != nil {
		return "", err
	}
	for i, passenger := range p.Passengers {
		var linked string
		err := scanWorkspace(tx.QueryRowContext(ctx, `INSERT INTO wedding_pickup_passengers
			(wedding_id, pickup_id, guest_id, position, arrival_date, arrival_time, arrival_mode, transport_required)
			SELECT g.wedding_id, $2, g.id, $5, g.arrival_date, COALESCE(to_char(g.arrival_time, 'HH24:MI'), ''),
				g.arrival_mode, g.transport_required FROM wedding_guests g
			WHERE g.wedding_id = $1 AND g.id = $3 AND g.revision = $4 FOR SHARE
			RETURNING guest_id`, wedding, id, passenger.ID, passenger.Revision, i), &linked)
		if errors.Is(err, errWorkspaceNotFound) {
			return "", errWorkspaceConflict
		}
		if err != nil {
			return "", err
		}
	}
	return id, tx.Commit()
}

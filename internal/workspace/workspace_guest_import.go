package workspace

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/ajz007/shaadi-planner-pro/internal/httpx"
)

type guestImportReview struct {
	Rows   []guestImportRow `json:"rows"`
	Review string           `json:"review"`
	Ready  int              `json:"ready"`
}

type guestIdentity struct {
	workbookID string
	name       string
	household  string
}

type guestIdentities struct {
	ids   map[string]guestIdentity
	names map[string][]guestIdentity
}

func (index guestIdentities) add(guest guestIdentity) {
	if guest.workbookID != "" {
		index.ids[guestImportKey(guest.workbookID)] = guest
	}
	name := guestImportKey(guest.name)
	index.names[name] = append(index.names[name], guest)
}

func (index guestIdentities) match(guest guestIdentity) (string, string) {
	name, household := guestImportKey(guest.name), guestImportKey(guest.household)
	if guest.workbookID != "" {
		if existing, ok := index.ids[guestImportKey(guest.workbookID)]; ok {
			if guestImportKey(existing.name) == name && guestImportKey(existing.household) == household {
				return "duplicate", "Guest ID and name match"
			}
			return "conflict", "Guest ID belongs to " + existing.name
		}
	}
	possible := false
	for _, existing := range index.names[name] {
		otherHousehold := guestImportKey(existing.household)
		if household == otherHousehold {
			return "duplicate", "Name and household match"
		}
		possible = possible || household == "" || otherHousehold == ""
	}
	if possible {
		return "conflict", "Same name, with a household missing"
	}
	return "", ""
}

func reviewGuestRows(rows []guestImportRow, existing []guestIdentity) guestImportReview {
	saved := guestIdentities{map[string]guestIdentity{}, map[string][]guestIdentity{}}
	inFile := guestIdentities{map[string]guestIdentity{}, map[string][]guestIdentity{}}
	for _, guest := range existing {
		saved.add(guest)
	}

	review := guestImportReview{Rows: rows}
	for i := range rows {
		row := &rows[i]
		if row.Status == "invalid" {
			continue
		}
		identity := guestIdentity{row.WorkbookID, row.Name, row.Household}
		if status, reason := saved.match(identity); status != "" {
			row.Status, row.Reason = status, reason+" in this wedding."
		} else if status, reason := inFile.match(identity); status != "" {
			row.Status, row.Reason = status, reason+" in an earlier file row."
		} else {
			inFile.add(identity)
			review.Ready++
		}
	}
	return review
}

// Manual guest saves take the same wedding lock before changing a name or
// household. Confirmations compare the reviewed rows while holding this lock.
func lockGuestIdentity(ctx context.Context, tx *sql.Tx, wedding, actor string) error {
	var id string
	return scanWorkspace(tx.QueryRowContext(ctx, `SELECT w.id FROM weddings w
		JOIN wedding_memberships m ON m.wedding_id=w.id
		WHERE w.id=$1 AND m.account_id=$2 AND m.role IN ('owner', 'co-organizer')
		FOR NO KEY UPDATE OF w`, wedding, actor), &id)
}

func (a *workspaceHTTP) importGuests(w http.ResponseWriter, r *http.Request, actor string) {
	wedding, ctx := r.PathValue("wedding"), r.Context()
	if !workspaceUUID.MatchString(wedding) {
		workspaceFailure(w, errWorkspaceNotFound)
		return
	}
	if err := a.store.requireOrganizer(ctx, wedding, actor); err != nil {
		workspaceFailure(w, err)
		return
	}
	format := r.Header.Get("X-Guest-Import-Format")
	if format != "csv" && format != "xlsx" {
		httpx.Fail(w, http.StatusBadRequest, "Choose an Excel (.xlsx) or CSV file.")
		return
	}
	content, err := io.ReadAll(http.MaxBytesReader(w, r.Body, workbookUploadLimit))
	if err != nil || len(content) == 0 {
		httpx.Fail(w, http.StatusBadRequest, "Choose a file up to 2 MB.")
		return
	}
	rows, err := readGuestImport(content, format)
	if err != nil {
		httpx.Fail(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	review, added, err := a.store.reviewGuestImport(ctx, wedding, actor, rows, r.Header.Get("X-Guest-Import-Review"))
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	if review != nil {
		status := http.StatusOK
		if r.Header.Get("X-Guest-Import-Review") != "" {
			status = http.StatusConflict
		}
		httpx.Reply(w, status, review)
		return
	}
	httpx.Reply(w, http.StatusOK, map[string]int64{"added": added})
}

func (s *workspaceStore) reviewGuestImport(ctx context.Context, wedding, actor string, rows []guestImportRow, confirm string) (*guestImportReview, int64, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, 0, err
	}
	defer tx.Rollback()
	if confirm != "" {
		if err := lockGuestIdentity(ctx, tx, wedding, actor); err != nil {
			return nil, 0, err
		}
	}
	existing, err := queryWorkspace(ctx, tx, func(row *sql.Rows, guest *guestIdentity) error {
		return row.Scan(&guest.workbookID, &guest.name, &guest.household)
	}, `SELECT g.workbook_id, g.name, g.household FROM wedding_guests g
		JOIN wedding_memberships m ON m.wedding_id=g.wedding_id
		WHERE g.wedding_id=$1 AND m.account_id=$2 AND m.role IN ('owner', 'co-organizer')
		ORDER BY g.workbook_id`, wedding, actor)
	if err != nil {
		return nil, 0, err
	}
	review := reviewGuestRows(rows, existing)
	data, err := json.Marshal(review.Rows)
	if err != nil {
		return nil, 0, err
	}
	review.Review = fmt.Sprintf("%x", sha256.Sum256(append([]byte(wedding+actor), data...)))
	if confirm == "" || confirm != review.Review {
		return &review, 0, nil
	}
	if review.Ready == 0 {
		return nil, 0, errWorkspaceInput
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO wedding_guests (wedding_id, workbook_id, name, household, side,
			wedding_rsvp, stay_required, transport_required, arrival_date, arrival_time, arrival_mode)
		SELECT $1, COALESCE(NULLIF(g."workbookId", ''), 'G-' || gen_random_uuid()::text), g.name, g.household, g.side,
			g.rsvp, g."stayRequired", g."transportRequired", NULLIF(g."arrivalDate", '')::date,
			NULLIF(g."arrivalTime", '')::time, g."arrivalMode"
		FROM jsonb_to_recordset($2::jsonb) AS g(status text, "workbookId" text, name text, household text, side text,
			rsvp text, "stayRequired" text, "transportRequired" text, "arrivalDate" text, "arrivalTime" text, "arrivalMode" text)
		WHERE g.status='new'`, wedding, data)
	if err != nil {
		return nil, 0, err
	}
	added, err := result.RowsAffected()
	if err != nil {
		return nil, 0, err
	}
	return nil, added, tx.Commit()
}

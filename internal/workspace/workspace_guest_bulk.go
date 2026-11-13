package workspace

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"unicode"

	"github.com/ajz007/shaadi-planner-pro/internal/httpx"
)

type guestBulkTarget struct {
	ID       string `json:"id"`
	Revision int    `json:"revision"`
}

type guestBulkEdit struct {
	Field      string            `json:"field"`
	Value      string            `json:"value"`
	BlanksOnly bool              `json:"blanksOnly"`
	Guests     []guestBulkTarget `json:"guests"`
}

const maxGuestBulkTargets = 3500

func (edit guestBulkEdit) column() string {
	switch edit.Field {
	case "side":
		if edit.Value == "Bride" || edit.Value == "Groom" || edit.Value == "Both" {
			return "side"
		}
	case "stayRequired":
		if edit.Value == "Yes" || edit.Value == "No" {
			return "stay_required"
		}
	case "transportRequired":
		if edit.Value == "Yes" || edit.Value == "No" {
			return "transport_required"
		}
	}
	return ""
}

func (edit guestBulkEdit) labelChange() bool {
	return edit.Field == "addLabel" || edit.Field == "removeLabel"
}

func (a *workspaceHTTP) bulkEditGuests(w http.ResponseWriter, r *http.Request, actor string) {
	wedding := r.PathValue("wedding")
	if !workspaceUUID.MatchString(wedding) {
		workspaceFailure(w, errWorkspaceNotFound)
		return
	}
	ctx := r.Context()
	if err := a.store.requireOrganizer(ctx, wedding, actor); err != nil {
		workspaceFailure(w, err)
		return
	}
	var edit guestBulkEdit
	if !httpx.ReadJSON(w, r, &edit) {
		return
	}
	if edit.labelChange() {
		edit.Value = strings.Join(strings.Fields(edit.Value), " ")
		if !validLabel(edit.Value, 60) || strings.ContainsFunc(edit.Value, unicode.IsControl) || edit.BlanksOnly {
			workspaceFailure(w, errWorkspaceInput)
			return
		}
	}
	if (!edit.labelChange() && edit.column() == "") || len(edit.Guests) == 0 || len(edit.Guests) > maxGuestBulkTargets {
		workspaceFailure(w, errWorkspaceInput)
		return
	}
	seen := make(map[string]bool, len(edit.Guests))
	for _, guest := range edit.Guests {
		id := strings.ToLower(guest.ID)
		if !workspaceUUID.MatchString(id) || guest.Revision < 1 || guest.Revision > 2147483647 || seen[id] {
			workspaceFailure(w, errWorkspaceInput)
			return
		}
		seen[id] = true
	}
	updated, err := a.store.updateGuestBatch(ctx, wedding, actor, edit)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	httpx.Reply(w, http.StatusOK, map[string]int64{"updated": updated})
}

func (s *workspaceStore) updateGuestBatch(ctx context.Context, wedding, actor string, edit guestBulkEdit) (int64, error) {
	targets, err := json.Marshal(edit.Guests)
	if err != nil {
		return 0, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	// Lock in a consistent order so overlapping batches either commit in
	// sequence or return a conflict when a selected guest has changed.
	var matched int
	err = tx.QueryRowContext(ctx, `SELECT count(*) FROM (
		SELECT g.id FROM wedding_guests g JOIN `+guestBulkTargets+` ON target.id = g.id AND target.revision = g.revision
		JOIN wedding_memberships m ON m.wedding_id = g.wedding_id
		WHERE g.wedding_id = $1 AND m.account_id = $3 AND m.role IN ('owner', 'co-organizer')
		ORDER BY g.id FOR UPDATE OF g
	) locked`, wedding, targets, actor).Scan(&matched)
	if err != nil {
		return 0, err
	}
	if matched != len(edit.Guests) {
		return 0, errWorkspaceConflict
	}
	if edit.labelChange() {
		updated, err := changeGuestLabels(ctx, tx, wedding, targets, edit)
		if err != nil {
			return 0, err
		}
		return updated, tx.Commit()
	}
	column := edit.column()
	result, err := tx.ExecContext(ctx, `UPDATE wedding_guests g SET `+column+` = $3, revision = g.revision + 1
		FROM `+guestBulkTargets+` WHERE g.wedding_id = $1 AND g.id = target.id
		AND g.`+column+` <> $3 AND (NOT $4 OR g.`+column+` = '')`, wedding, targets, edit.Value, edit.BlanksOnly)
	if err != nil {
		return 0, err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return 0, err
	}
	return updated, tx.Commit()
}

const guestBulkTargets = `jsonb_to_recordset($2::jsonb) AS target(id uuid, revision integer)`

func changeGuestLabels(ctx context.Context, tx *sql.Tx, wedding string, targets []byte, edit guestBulkEdit) (int64, error) {
	if edit.Field == "addLabel" {
		// Retain the original spelling when the same label is reused.
		var id string
		err := tx.QueryRowContext(ctx, `INSERT INTO wedding_guest_labels (wedding_id, name) VALUES ($1, $2)
			ON CONFLICT (wedding_id, lower(name)) DO UPDATE SET name = wedding_guest_labels.name RETURNING id`,
			wedding, edit.Value).Scan(&id)
		if err != nil {
			return 0, err
		}
		result, err := tx.ExecContext(ctx, `WITH changed AS (
			INSERT INTO wedding_guest_label_assignments (wedding_id, guest_id, label_id)
			SELECT $1, target.id, $3 FROM `+guestBulkTargets+` WHERE true
			ON CONFLICT DO NOTHING RETURNING guest_id
		) UPDATE wedding_guests g SET revision=g.revision+1
		FROM changed WHERE g.wedding_id=$1 AND g.id=changed.guest_id`, wedding, targets, id)
		if err != nil {
			return 0, err
		}
		return result.RowsAffected()
	}
	result, err := tx.ExecContext(ctx, `WITH changed AS (
		DELETE FROM wedding_guest_label_assignments a USING wedding_guest_labels l, `+guestBulkTargets+`
		WHERE a.wedding_id=$1 AND l.wedding_id=$1 AND l.id=a.label_id
		AND a.guest_id=target.id AND lower(l.name)=lower($3) RETURNING a.guest_id
	) UPDATE wedding_guests g SET revision=g.revision+1
	FROM changed WHERE g.wedding_id=$1 AND g.id=changed.guest_id`, wedding, targets, edit.Value)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

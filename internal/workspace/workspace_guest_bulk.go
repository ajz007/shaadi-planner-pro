package workspace

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

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
	if edit.column() == "" || len(edit.Guests) == 0 || len(edit.Guests) > maxGuestBulkTargets {
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
	const targetRows = `jsonb_to_recordset($2::jsonb) AS target(id uuid, revision integer)`
	var matched int
	err = tx.QueryRowContext(ctx, `SELECT count(*) FROM (
		SELECT g.id FROM wedding_guests g JOIN `+targetRows+` ON target.id = g.id AND target.revision = g.revision
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
	column := edit.column()
	result, err := tx.ExecContext(ctx, `UPDATE wedding_guests g SET `+column+` = $3, revision = g.revision + 1
		FROM `+targetRows+` WHERE g.wedding_id = $1 AND g.id = target.id
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

package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

func (s *workspaceStore) saveImportPreview(ctx context.Context, actor string, plan importedWorkbook) (string, error) {
	payload, err := json.Marshal(plan)
	if err != nil {
		return "", err
	}
	if _, err := s.db.ExecContext(ctx, "DELETE FROM workspace_import_previews WHERE expires_at <= now()"); err != nil {
		return "", err
	}
	token := workspaceSecret()
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO workspace_import_previews (token_hash, account_id, payload, expires_at)
		VALUES ($1, $2, $3, now() + interval '30 minutes')`, inviteHash(token), actor, payload)
	if err != nil {
		return "", err
	}
	return token, nil
}

func (s *workspaceStore) confirmImport(ctx context.Context, actor, token string) (string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	hash := inviteHash(token)
	var existing sql.NullString
	var payload []byte
	err = scanWorkspace(tx.QueryRowContext(ctx, `
		SELECT wedding_id, payload FROM workspace_import_previews
		WHERE token_hash = $1 AND account_id = $2 AND expires_at > now() FOR UPDATE`, hash, actor), &existing, &payload)
	if err != nil {
		return "", err
	}
	if existing.Valid {
		return existing.String, tx.Commit()
	}
	var plan importedWorkbook
	if err := json.Unmarshal(payload, &plan); err != nil {
		return "", err
	}
	wedding, err := createWorkspaceWedding(ctx, tx, actor, plan.Name, plan.Date, plan.TimeZone)
	if err != nil {
		return "", err
	}
	if err := writeImportedSections(ctx, tx, wedding, plan); err != nil {
		return "", err
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE workspace_import_previews SET wedding_id = $2, payload = NULL, expires_at = now() + interval '7 days'
		WHERE token_hash = $1`, hash, wedding); err != nil {
		return "", err
	}
	return wedding, tx.Commit()
}

func writeImportedSections(ctx context.Context, tx *sql.Tx, wedding string, plan importedWorkbook) error {
	location, err := time.LoadLocation(plan.TimeZone)
	if err != nil {
		return err
	}
	people := make(map[string]string)
	person := func(name string) (*string, error) {
		if name == "" {
			return nil, nil
		}
		key := strings.ToLower(name)
		id, exists := people[key]
		if !exists {
			if err := tx.QueryRowContext(ctx, "INSERT INTO wedding_people (wedding_id, name) VALUES ($1, $2) RETURNING id",
				wedding, name).Scan(&id); err != nil {
				return nil, err
			}
			people[key] = id
		}
		return &id, nil
	}
	for i, section := range plan.Sections {
		payload, err := json.Marshal(section)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO wedding_imported_sections (wedding_id, section_name, position, payload) VALUES ($1, $2, $3, $4)`,
			wedding, section.Name, i, payload); err != nil {
			return err
		}
		for _, row := range section.Rows {
			v := row.Values
			switch section.Name {
			case "Guest List":
				clock, _ := excelClock(v[12])
				_, err = tx.ExecContext(ctx, `
					INSERT INTO wedding_guests (wedding_id, workbook_id, name, wedding_rsvp, household, side,
						arrival_date, arrival_time, arrival_mode, transport_required)
					VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, '')::date, NULLIF($8, '')::time, $9, $10)`,
					wedding, v[0], v[1], v[7], v[2], v[3], v[11], clock, v[13], v[10])
			case "Functions & Events":
				owner, err := person(v[7])
				if err != nil {
					return err
				}
				start, err := time.ParseInLocation("2006-01-02T15:04", v[2]+"T"+v[3], location)
				if err != nil {
					return err
				}
				if _, err := tx.ExecContext(ctx, `
					INSERT INTO wedding_functions (wedding_id, workbook_id, name, venue, starts_at, owner_id)
					VALUES ($1, $2, $3, $4, $5, $6)`, wedding, v[0], v[1], v[4], start, owner); err != nil {
					return err
				}
			case "Family Responsibilities":
				owner, err := person(v[2])
				if err != nil {
					return err
				}
				if _, err := tx.ExecContext(ctx, `
					INSERT INTO wedding_tasks (wedding_id, title, assignee_id, due_date, done, workbook_row)
					VALUES ($1, $2, $3, NULLIF($4, '')::date, $5, $6)`, wedding, v[0], owner, v[4], strings.EqualFold(v[5], "done"), row.Number); err != nil {
					return err
				}
			}
			if err != nil {
				return err
			}
		}
	}
	_, err = tx.ExecContext(ctx, "SELECT shaadi_seed_pickups($1)", wedding)
	return err
}

func (a *workspaceHTTP) importPreview(w http.ResponseWriter, r *http.Request, actor string) {
	zone := r.Header.Get("X-Wedding-Time-Zone")
	if zone == "" {
		zone = "Asia/Kolkata"
	}
	if _, err := time.LoadLocation(zone); err != nil || zone == "Local" {
		fail(w, http.StatusUnprocessableEntity, "Choose a valid IANA wedding time zone.")
		return
	}
	content, err := io.ReadAll(http.MaxBytesReader(w, r.Body, workbookUploadLimit))
	if err != nil {
		fail(w, http.StatusBadRequest, "Choose an .xlsx file smaller than 2 MB.")
		return
	}
	plan, issues, err := parseEnglishWorkbook(content, zone)
	if err != nil {
		fail(w, http.StatusUnprocessableEntity, fmt.Sprintf("Workbook could not be imported: %s.", err))
		return
	}
	if len(issues) > 0 {
		reply(w, http.StatusUnprocessableEntity, map[string]any{
			"error": "Fix these workbook rows before creating a wedding.", "issues": issues[:min(len(issues), 100)], "issueCount": len(issues),
		})
		return
	}
	token, err := a.store.saveImportPreview(r.Context(), actor, plan)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	type count struct {
		Section string `json:"section"`
		Count   int    `json:"count"`
	}
	counts := make([]count, 0, len(plan.Sections))
	for _, section := range plan.Sections {
		counts = append(counts, count{section.Name, len(section.Rows)})
	}
	reply(w, http.StatusOK, map[string]any{
		"token": token, "name": plan.Name, "date": plan.Date, "timeZone": zone,
		"counts": counts, "totals": importedTotals(plan.Sections),
	})
}

func (a *workspaceHTTP) importConfirm(w http.ResponseWriter, r *http.Request, actor string) {
	var input struct{ Token string }
	if !readJSON(w, r, &input) {
		return
	}
	if len(input.Token) != 43 {
		workspaceFailure(w, errWorkspaceInput)
		return
	}
	id, err := a.store.confirmImport(r.Context(), actor, input.Token)
	workspaceCreated(w, id, err)
}

func (a *workspaceHTTP) importedSections(w http.ResponseWriter, r *http.Request, actor string) {
	wedding := r.PathValue("wedding")
	if !workspaceUUID.MatchString(wedding) {
		workspaceFailure(w, errWorkspaceNotFound)
		return
	}
	ctx := r.Context()
	var role string
	if err := scanWorkspace(a.store.db.QueryRowContext(ctx, `
		SELECT role FROM wedding_memberships WHERE wedding_id = $1 AND account_id = $2 AND role = 'owner'`, wedding, actor), &role); err != nil {
		workspaceFailure(w, err)
		return
	}
	sections, err := queryWorkspace(ctx, a.store.db, func(rows *sql.Rows, section *importSection) error {
		var payload []byte
		if err := rows.Scan(&payload); err != nil {
			return err
		}
		return json.Unmarshal(payload, section)
	}, `SELECT i.payload FROM wedding_imported_sections i JOIN wedding_memberships m ON m.wedding_id = i.wedding_id
		WHERE i.wedding_id = $1 AND m.account_id = $2 AND m.role = 'owner' ORDER BY i.position`, wedding, actor)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	reply(w, http.StatusOK, map[string]any{"sections": sections, "totals": importedTotals(sections)})
}

package workspace

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	_ "embed"
	"encoding/base64"
	"errors"
	"strings"
	"time"
	_ "time/tzdata"
	"unicode/utf8"

	_ "github.com/jackc/pgx/v5/stdlib"
)

//go:embed migrations/001_workspace.sql
var initialWorkspaceMigration string

//go:embed migrations/002_sessions.sql
var workspaceSessionMigration string

//go:embed migrations/003_workbook_import.sql
var workspaceImportMigration string

//go:embed migrations/004_live_guests.sql
var workspaceGuestMigration string

//go:embed migrations/005_live_transport.sql
var workspaceTransportMigration string

//go:embed migrations/006_repair_arrival_times.sql
var workspaceArrivalRepairMigration string

//go:embed migrations/007_live_logistics.sql
var workspaceLogisticsMigration string

//go:embed migrations/008_live_finance.sql
var workspaceFinanceMigration string

//go:embed migrations/009_readiness_places_documents.sql
var workspaceReadinessMigration string

//go:embed migrations/010_guest_stay_required.sql
var workspaceGuestStayMigration string

//go:embed migrations/011_guest_rsvp.sql
var workspaceGuestRSVPMigration string

//go:embed migrations/012_wedding_run_sheet.sql
var workspaceRunSheetMigration string

//go:embed migrations/013_guest_wedding_page.sql
var workspaceGuestPageMigration string

//go:embed migrations/014_reusable_guest_schedules.sql
var workspaceReusableScheduleMigration string

//go:embed migrations/015_function_guest_visibility.sql
var workspaceFunctionVisibilityMigration string

//go:embed migrations/016_guest_labels.sql
var workspaceGuestLabelsMigration string

//go:embed migrations/017_category_budgets.sql
var workspaceBudgetMigration string

//go:embed migrations/018_wedding_invitation.sql
var workspaceInvitationMigration string

//go:embed migrations/019_invitation_publishing.sql
var workspaceInvitationPublishingMigration string

//go:embed migrations/020_family_passes.sql
var familyPassMigration string

//go:embed migrations/021_family_pass_access.sql
var familyPassAccessMigration string

var (
	errWorkspaceNotFound    = errors.New("record not found or access denied")
	errWorkspaceConflict    = errors.New("record changed or no longer available")
	errWorkspaceInput       = errors.New("invalid workspace data")
	errFamilyPassRequired   = errors.New("family pass required")
	errFamilyWeddingExpired = errors.New("wedding date is outside access period")
)

type workspaceStore struct {
	db       *sql.DB
	passMode string
}

func openWorkspace(ctx context.Context, connection string) (*workspaceStore, error) {
	db, err := sql.Open("pgx", connection)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(10)
	store := &workspaceStore{db: db}
	if err := store.migrate(ctx); err != nil {
		db.Close()
		return nil, err
	}
	return store, nil
}

func (s *workspaceStore) migrate(ctx context.Context) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, "SELECT pg_advisory_xact_lock(718035190)"); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "CREATE TABLE IF NOT EXISTS workspace_migrations (version integer PRIMARY KEY)"); err != nil {
		return err
	}
	migrations := []string{
		initialWorkspaceMigration, workspaceSessionMigration, workspaceImportMigration, workspaceGuestMigration,
		workspaceTransportMigration, workspaceArrivalRepairMigration, workspaceLogisticsMigration, workspaceFinanceMigration,
		workspaceReadinessMigration, workspaceGuestStayMigration, workspaceGuestRSVPMigration, workspaceRunSheetMigration,
		workspaceGuestPageMigration, workspaceReusableScheduleMigration, workspaceFunctionVisibilityMigration,
		workspaceGuestLabelsMigration, workspaceBudgetMigration, workspaceInvitationMigration, workspaceInvitationPublishingMigration, familyPassMigration, familyPassAccessMigration,
	}
	for i, migration := range migrations {
		version := i + 1
		var applied bool
		if err := tx.QueryRowContext(ctx, "SELECT EXISTS (SELECT 1 FROM workspace_migrations WHERE version = $1)", version).Scan(&applied); err != nil {
			return err
		}
		if applied {
			continue
		}
		if _, err := tx.ExecContext(ctx, migration); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, "INSERT INTO workspace_migrations VALUES ($1)", version); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func validLabel(text string, max int) bool {
	n := utf8.RuneCountInString(strings.TrimSpace(text))
	return n > 0 && n <= max
}

func scanWorkspace(row *sql.Row, targets ...any) error {
	if err := row.Scan(targets...); errors.Is(err, sql.ErrNoRows) {
		return errWorkspaceNotFound
	} else {
		return err
	}
}

// The identity subject must come from a verified identity provider, never a
// client-supplied identity claim. It includes the issuer to prevent collisions.
func (s *workspaceStore) syncAccount(ctx context.Context, subject, name string) (string, error) {
	if strings.TrimSpace(subject) == "" || !validLabel(name, 120) {
		return "", errWorkspaceInput
	}
	var id string
	err := scanWorkspace(s.db.QueryRowContext(ctx, `
		INSERT INTO workspace_accounts (identity_subject, display_name) VALUES ($1, $2)
		ON CONFLICT (identity_subject) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id`,
		subject, strings.TrimSpace(name)), &id)
	return id, err
}

func (s *workspaceStore) createWedding(ctx context.Context, account, name, date, zone string) (string, error) {
	return s.createWeddingFromDraft(ctx, account, name, date, zone, nil)
}

type weddingDraft struct {
	Bride, Groom, Function, FunctionTime string
	// Older browser tabs sent the date both here and on the request.
	Date string
}

func (s *workspaceStore) createWeddingFromDraft(ctx context.Context, account, name, date, zone string, draft *weddingDraft) (string, error) {
	_, dateErr := time.Parse(time.DateOnly, date)
	location, zoneErr := time.LoadLocation(zone)
	if !validLabel(name, 120) || dateErr != nil || zoneErr != nil || zone == "" || zone == "Local" {
		return "", errWorkspaceInput
	}
	var startsAt time.Time
	if draft != nil {
		var err error
		startsAt, err = time.ParseInLocation("2006-01-02T15:04", date+"T"+draft.FunctionTime, location)
		if err != nil || (draft.Date != "" && draft.Date != date) ||
			!validLabel(draft.Bride, 56) || !validLabel(draft.Groom, 56) || !validLabel(draft.Function, 120) {
			return "", errWorkspaceInput
		}
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	id, err := s.createWeddingWithPass(ctx, tx, account, name, date, zone)
	if err != nil {
		return "", err
	}
	if draft != nil {
		_, err = tx.ExecContext(ctx, `INSERT INTO wedding_invitations (wedding_id, content)
			VALUES ($1, jsonb_build_object('bride', jsonb_build_object('name', $2::text),
			'groom', jsonb_build_object('name', $3::text)))`, id, strings.TrimSpace(draft.Bride), strings.TrimSpace(draft.Groom))
		if err != nil {
			return "", err
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO wedding_functions (wedding_id, name, venue, starts_at)
			VALUES ($1, $2, '', $3)`, id, strings.TrimSpace(draft.Function), startsAt)
		if err != nil {
			return "", err
		}
	}
	return id, tx.Commit()
}

func (s *workspaceStore) createWeddingWithPass(ctx context.Context, tx *sql.Tx, account, name, date, zone string) (string, error) {
	if s.passMode == "" {
		return createWorkspaceWedding(ctx, tx, account, name, date, zone)
	}
	var expired bool
	if err := tx.QueryRowContext(ctx, `SELECT (($1::date + 91)::timestamp AT TIME ZONE $2) <= now()`, date, zone).Scan(&expired); err != nil {
		return "", err
	}
	if expired {
		return "", errFamilyWeddingExpired
	}
	var pass string
	err := tx.QueryRowContext(ctx, `
		SELECT id FROM family_passes
		WHERE account_id=$1 AND mode=$2 AND consumed_at IS NULL AND revoked_at IS NULL
		ORDER BY granted_at, id LIMIT 1 FOR UPDATE`, account, s.passMode).Scan(&pass)
	if errors.Is(err, sql.ErrNoRows) {
		return "", errFamilyPassRequired
	}
	if err != nil {
		return "", err
	}
	wedding, err := createWorkspaceWedding(ctx, tx, account, name, date, zone)
	if err != nil {
		return "", err
	}
	_, err = tx.ExecContext(ctx, "UPDATE family_passes SET wedding_id=$1, consumed_at=now() WHERE id=$2", wedding, pass)
	return wedding, err
}

type workspaceQueryer interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func createWorkspaceWedding(ctx context.Context, db workspaceQueryer, account, name, date, zone string) (string, error) {
	var id string
	err := scanWorkspace(db.QueryRowContext(ctx, `
		WITH wedding AS (
			INSERT INTO weddings (name, wedding_date, time_zone)
			SELECT $2, $3, $4 FROM workspace_accounts WHERE id = $1
			RETURNING id
		), person AS (
			INSERT INTO wedding_people (wedding_id, name)
			SELECT wedding.id, a.display_name FROM wedding CROSS JOIN workspace_accounts a WHERE a.id = $1
			RETURNING id, wedding_id
		)
		INSERT INTO wedding_memberships (wedding_id, account_id, person_id, role)
		SELECT wedding_id, $1, id, 'owner' FROM person RETURNING wedding_id`,
		account, strings.TrimSpace(name), date, zone), &id)
	return id, err
}

func (s *workspaceStore) addPerson(ctx context.Context, wedding, actor, name string) (string, error) {
	if !validLabel(name, 120) {
		return "", errWorkspaceInput
	}
	var id string
	err := scanWorkspace(s.db.QueryRowContext(ctx, `
		INSERT INTO wedding_people (wedding_id, name)
		SELECT wedding_id, $3 FROM wedding_memberships
		WHERE wedding_id = $1 AND account_id = $2 AND role IN ('owner', 'co-organizer')
		RETURNING id`, wedding, actor, strings.TrimSpace(name)), &id)
	return id, err
}

func (s *workspaceStore) addFunction(ctx context.Context, wedding, actor, name, venue string, start time.Time) (string, error) {
	if !validLabel(name, 120) || start.IsZero() || utf8.RuneCountInString(venue) > 200 {
		return "", errWorkspaceInput
	}
	var id string
	err := scanWorkspace(s.db.QueryRowContext(ctx, `
		INSERT INTO wedding_functions (wedding_id, name, venue, starts_at)
		SELECT wedding_id, $3, $4, $5 FROM wedding_memberships
		WHERE wedding_id = $1 AND account_id = $2 AND role IN ('owner', 'co-organizer')
		RETURNING id`, wedding, actor, strings.TrimSpace(name), strings.TrimSpace(venue), start), &id)
	return id, err
}

func inviteHash(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}

func (s *workspaceStore) invite(ctx context.Context, wedding, actor, person, role string) (string, error) {
	if role != "family" && role != "co-organizer" {
		return "", errWorkspaceInput
	}
	var secret [32]byte
	rand.Read(secret[:])
	token := base64.RawURLEncoding.EncodeToString(secret[:])
	var id string
	err := scanWorkspace(s.db.QueryRowContext(ctx, `
		INSERT INTO wedding_invites (wedding_id, person_id, role, token_hash, expires_at)
		SELECT m.wedding_id, p.id, $4, $5, now() + interval '24 hours'
		FROM wedding_memberships m JOIN wedding_people p ON p.wedding_id = m.wedding_id
		WHERE m.wedding_id = $1 AND m.account_id = $2 AND m.role = 'owner' AND p.id = $3
		AND NOT EXISTS (SELECT 1 FROM wedding_memberships WHERE wedding_id = $1 AND person_id = $3)
		RETURNING person_id`, wedding, actor, person, role, inviteHash(token)), &id)
	if err != nil {
		return "", err
	}
	return token, nil
}

func (s *workspaceStore) revokeInvite(ctx context.Context, wedding, actor, token string) error {
	var id string
	return scanWorkspace(s.db.QueryRowContext(ctx, `
		UPDATE wedding_invites i SET revoked_at = now()
		FROM wedding_memberships m
		WHERE i.wedding_id = $1 AND i.token_hash = $3 AND i.consumed_at IS NULL AND i.revoked_at IS NULL
		AND m.wedding_id = i.wedding_id AND m.account_id = $2 AND m.role = 'owner'
		RETURNING i.person_id`, wedding, actor, inviteHash(token)), &id)
}

func (s *workspaceStore) acceptInvite(ctx context.Context, actor, token string) (string, error) {
	var wedding string
	err := scanWorkspace(s.db.QueryRowContext(ctx, `
		WITH accepted AS (
			UPDATE wedding_invites SET consumed_at = now()
			WHERE token_hash = $2 AND expires_at > now() AND revoked_at IS NULL AND consumed_at IS NULL
			AND NOT EXISTS (SELECT 1 FROM family_wedding_access a
				WHERE a.wedding_id = wedding_invites.wedding_id AND (a.revoked_at IS NOT NULL OR a.delete_at <= now()))
			RETURNING wedding_id, person_id, role
		)
		INSERT INTO wedding_memberships (wedding_id, account_id, person_id, role)
		SELECT wedding_id, $1, person_id, role FROM accepted RETURNING wedding_id`, actor, inviteHash(token)), &wedding)
	if errors.Is(err, errWorkspaceNotFound) {
		// A browser retry can follow successful acceptance of this single-use
		// link. Only the account assigned to the invited person can reopen it.
		err = scanWorkspace(s.db.QueryRowContext(ctx, `
			SELECT i.wedding_id FROM wedding_invites i JOIN wedding_memberships m
			  ON m.wedding_id=i.wedding_id AND m.person_id=i.person_id
			WHERE i.token_hash=$2 AND i.consumed_at IS NOT NULL AND i.revoked_at IS NULL
			  AND i.expires_at > now() AND m.account_id=$1
			  AND NOT EXISTS (SELECT 1 FROM family_wedding_access a
			    WHERE a.wedding_id=i.wedding_id AND (a.revoked_at IS NOT NULL OR a.delete_at <= now()))`,
			actor, inviteHash(token)), &wedding)
	}
	return wedding, err
}

type workspaceTask struct {
	ID        string  `json:"id"`
	Title     string  `json:"title"`
	Function  *string `json:"function"`
	Assignee  *string `json:"assignee"`
	Due       *string `json:"due"`
	Claimable bool    `json:"claimable"`
	Done      bool    `json:"done"`
	Revision  int     `json:"revision"`
}

func (s *workspaceStore) addTask(ctx context.Context, wedding, actor string, task workspaceTask) (string, error) {
	if !validLabel(task.Title, 240) || (task.Claimable && task.Assignee != nil) {
		return "", errWorkspaceInput
	}
	if task.Due != nil {
		if _, err := time.Parse(time.DateOnly, *task.Due); err != nil {
			return "", errWorkspaceInput
		}
	}
	var id string
	err := scanWorkspace(s.db.QueryRowContext(ctx, `
		INSERT INTO wedding_tasks (wedding_id, title, function_id, assignee_id, due_date, claimable)
		SELECT wedding_id, $3, $4, $5, $6, $7 FROM wedding_memberships
		WHERE wedding_id = $1 AND account_id = $2 AND role IN ('owner', 'co-organizer')
		RETURNING id`, wedding, actor, strings.TrimSpace(task.Title), task.Function, task.Assignee, task.Due, task.Claimable), &id)
	return id, err
}

func (s *workspaceStore) listTasks(ctx context.Context, wedding, actor string) ([]workspaceTask, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT t.id, t.title, t.function_id, t.assignee_id, t.due_date::text, t.claimable, t.done, t.revision
		FROM wedding_memberships m JOIN wedding_tasks t ON t.wedding_id = m.wedding_id
		WHERE m.wedding_id = $1 AND m.account_id = $2
		AND (m.role <> 'family' OR t.assignee_id = m.person_id OR (t.claimable AND t.assignee_id IS NULL AND NOT t.done))
		ORDER BY t.due_date NULLS LAST, t.id`, wedding, actor)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tasks := []workspaceTask{}
	for rows.Next() {
		var task workspaceTask
		if err := rows.Scan(&task.ID, &task.Title, &task.Function, &task.Assignee, &task.Due, &task.Claimable, &task.Done, &task.Revision); err != nil {
			return nil, err
		}
		tasks = append(tasks, task)
	}
	return tasks, rows.Err()
}

func (s *workspaceStore) claimTask(ctx context.Context, wedding, actor, task string) (assignee string, err error) {
	err = scanWorkspace(s.db.QueryRowContext(ctx, `
		UPDATE wedding_tasks t SET assignee_id = m.person_id, claimed_by = m.account_id, claimed_at = now(), revision = t.revision + 1
		FROM wedding_memberships m
		WHERE t.wedding_id = $1 AND t.id = $3 AND t.claimable AND t.assignee_id IS NULL AND NOT t.done
		AND m.wedding_id = t.wedding_id AND m.account_id = $2
		RETURNING t.assignee_id`, wedding, actor, task), &assignee)
	if errors.Is(err, errWorkspaceNotFound) {
		err = scanWorkspace(s.db.QueryRowContext(ctx, `
			SELECT p.name FROM wedding_tasks t
			JOIN wedding_memberships m ON m.wedding_id = t.wedding_id AND m.account_id = $2
			JOIN wedding_people p ON p.wedding_id = t.wedding_id AND p.id = t.assignee_id
			WHERE t.wedding_id = $1 AND t.id = $3 AND t.claimable AND t.claimed_at IS NOT NULL`, wedding, actor, task), &assignee)
		if err == nil {
			return assignee, errWorkspaceConflict
		}
	}
	return assignee, err
}

func (s *workspaceStore) setTaskDone(ctx context.Context, wedding, actor, task string, revision int, done bool) (int, error) {
	var next int
	err := scanWorkspace(s.db.QueryRowContext(ctx, `
		UPDATE wedding_tasks t SET done = $5, revision = t.revision + 1 FROM wedding_memberships m
		WHERE t.wedding_id = $1 AND t.id = $3 AND t.revision = $4 AND m.wedding_id = t.wedding_id AND m.account_id = $2
		AND (m.role <> 'family' OR m.person_id = t.assignee_id)
		RETURNING t.revision`, wedding, actor, task, revision, done), &next)
	if errors.Is(err, errWorkspaceNotFound) {
		err = scanWorkspace(s.db.QueryRowContext(ctx, `
			SELECT t.revision FROM wedding_tasks t JOIN wedding_memberships m ON m.wedding_id = t.wedding_id AND m.account_id = $2
			WHERE t.wedding_id = $1 AND t.id = $3 AND (m.role <> 'family' OR m.person_id = t.assignee_id)`,
			wedding, actor, task), &next)
		if err == nil {
			return next, errWorkspaceConflict
		}
	}
	return next, err
}

func (s *workspaceStore) reassignTask(ctx context.Context, wedding, actor, task string, revision int, assignee *string) (int, error) {
	var next int
	err := scanWorkspace(s.db.QueryRowContext(ctx, `
		UPDATE wedding_tasks t SET assignee_id = $5, claimed_by = NULL, claimed_at = NULL, revision = t.revision + 1
		FROM wedding_memberships m
		WHERE t.wedding_id = $1 AND t.id = $3 AND t.revision = $4 AND m.wedding_id = t.wedding_id
		AND m.account_id = $2 AND m.role IN ('owner', 'co-organizer')
		RETURNING t.revision`, wedding, actor, task, revision, assignee), &next)
	if errors.Is(err, errWorkspaceNotFound) {
		err = scanWorkspace(s.db.QueryRowContext(ctx, `
			SELECT t.revision FROM wedding_tasks t JOIN wedding_memberships m ON m.wedding_id = t.wedding_id
			WHERE t.wedding_id = $1 AND m.account_id = $2 AND t.id = $3 AND m.role IN ('owner', 'co-organizer')`,
			wedding, actor, task), &next)
		if err == nil {
			return next, errWorkspaceConflict
		}
	}
	return next, err
}

func Migrate(ctx context.Context, connection string) error {
	store, err := openWorkspace(ctx, connection)
	if err != nil {
		return err
	}
	return store.db.Close()
}

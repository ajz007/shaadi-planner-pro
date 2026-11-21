package workspace

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"testing"
	"time"
)

// This check needs a disposable database with migration 019 already applied.
func TestFamilyPassUpgradeAndRetention(t *testing.T) {
	connection := os.Getenv("SHAADI_FAMILY_UPGRADE_DATABASE_URL")
	if connection == "" {
		t.Skip("set SHAADI_FAMILY_UPGRADE_DATABASE_URL to a disposable database at migration 019")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	db, err := sql.Open("pgx", connection)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var database string
	if err := db.QueryRowContext(ctx, "SELECT current_database()").Scan(&database); err != nil || database != "shaadi_family_upgrade" {
		t.Fatalf("use the disposable shaadi_family_upgrade database: %v", err)
	}
	var migration int
	if err := db.QueryRowContext(ctx, "SELECT COALESCE(max(version), 0) FROM workspace_migrations").Scan(&migration); err != nil || migration != 19 {
		t.Fatalf("baseline migration = %d, want 19: %v", migration, err)
	}

	legacy := &workspaceStore{db: db}
	owner, err := legacy.syncAccount(ctx, "upgrade-test:owner", "Upgrade owner")
	if err != nil {
		t.Fatal(err)
	}
	// An old legacy wedding makes an accidental broad deletion visible.
	legacyWedding, err := legacy.createWedding(ctx, owner, "Legacy wedding", "2020-01-01", "Asia/Kolkata")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO wedding_invitations (wedding_id, enabled, published)
		VALUES ($1, true, '{"templateId":"blush-envelope"}')`, legacyWedding); err != nil {
		t.Fatal(err)
	}

	store, err := openWorkspace(ctx, connection)
	if err != nil {
		t.Fatalf("upgrade from migration 019: %v", err)
	}
	defer store.db.Close()
	if err := store.migrate(ctx); err != nil {
		t.Fatalf("rerun migrations: %v", err)
	}

	store.passMode = "test"
	date := time.Now().UTC().AddDate(0, 0, 10).Format(time.DateOnly)
	if _, err := store.createWedding(ctx, owner, "Without a pass", date, "Asia/Kolkata"); !errors.Is(err, errFamilyPassRequired) {
		t.Fatalf("creation without a pass: %v", err)
	}
	if _, err := store.db.ExecContext(ctx, `INSERT INTO family_passes (account_id, source, mode)
		VALUES ($1, 'upgrade-test:pass', 'test')`, owner); err != nil {
		t.Fatal(err)
	}
	paidWedding, err := store.createWedding(ctx, owner, "Paid wedding", date, "Asia/Kolkata")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.createWedding(ctx, owner, "Second wedding", date, "Asia/Kolkata"); !errors.Is(err, errFamilyPassRequired) {
		t.Fatalf("reuse of the consumed pass: %v", err)
	}
	projected, err := time.Parse(time.DateOnly, date)
	if err != nil {
		t.Fatal(err)
	}
	location := time.FixedZone("IST", 5*3600+30*60)
	wantDeadline := time.Date(projected.Year(), projected.Month(), projected.Day()+91, 0, 0, 0, 0, location)
	var deadline time.Time
	err = store.db.QueryRowContext(ctx, "SELECT delete_at FROM family_wedding_access WHERE wedding_id=$1", paidWedding).Scan(&deadline)
	if err != nil || !deadline.Equal(wantDeadline) {
		t.Fatalf("deadline = %v, want %v: %v", deadline, wantDeadline, err)
	}
	if err := store.purgeExpiredFamilyWeddings(ctx); err != nil {
		t.Fatalf("cleanup with an active wedding: %v", err)
	}
	if _, err := store.db.ExecContext(ctx, "UPDATE weddings SET wedding_date=DATE '2020-01-01' WHERE id=$1", paidWedding); err != nil {
		t.Fatalf("age active wedding fixture: %v", err)
	}
	if err := store.purgeExpiredFamilyWeddings(ctx); err != nil {
		t.Fatalf("cleanup with an expired wedding: %v", err)
	}
	var invitationPreserved, paidRemoved, passStillConsumed bool
	err = store.db.QueryRowContext(ctx, `SELECT
		EXISTS (SELECT 1 FROM wedding_invitations WHERE wedding_id=$1 AND published->>'templateId'='blush-envelope'),
		NOT EXISTS (SELECT 1 FROM weddings WHERE id=$2),
		EXISTS (SELECT 1 FROM family_passes WHERE source='upgrade-test:pass' AND wedding_id IS NULL AND consumed_at IS NOT NULL)`,
		legacyWedding, paidWedding).Scan(&invitationPreserved, &paidRemoved, &passStillConsumed)
	if err != nil || !invitationPreserved || !paidRemoved || !passStillConsumed {
		t.Fatalf("after cleanup: legacy invitation preserved=%t, paid wedding removed=%t, pass still consumed=%t: %v",
			invitationPreserved, paidRemoved, passStillConsumed, err)
	}
}

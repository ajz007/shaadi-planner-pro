package workspace

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
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
	id, granted, err := GrantFamilyPass(ctx, connection, "test", owner, "upgrade-test-pass")
	if err != nil || !granted || id == "" {
		t.Fatalf("grant pilot pass: id=%q granted=%t, %v", id, granted, err)
	}
	retryID, granted, err := GrantFamilyPass(ctx, connection, "test", owner, "upgrade-test-pass")
	if err != nil || granted || retryID != id {
		t.Fatalf("grant retry: id=%q granted=%t, %v", retryID, granted, err)
	}
	if _, _, err := GrantFamilyPass(ctx, connection, "live", owner, "upgrade-test-pass"); err == nil {
		t.Fatal("the same case must not grant a pass in a different mode")
	}
	// A browser kept open during the deploy may still send the date twice.
	body := fmt.Sprintf(`{"name":"Paid wedding","date":%q,"timeZone":"Asia/Kolkata",
		"draft":{"bride":"Test","groom":"Example","date":%q,"function":"Wedding","functionTime":"02:30"}}`, date, date)
	req := httptest.NewRequest(http.MethodPost, "/api/workspace/weddings", strings.NewReader(body)).WithContext(ctx)
	req.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	app := &workspaceHTTP{store: store}
	app.create(response, req, owner)
	if response.Code != http.StatusCreated {
		t.Fatalf("create paid wedding: got %d: %s", response.Code, response.Body)
	}
	var created struct{ ID string }
	if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil || created.ID == "" {
		t.Fatalf("invalid wedding creation response: %v", err)
	}
	paidWedding := created.ID
	t.Run("sign out and switch accounts", func(t *testing.T) { verifyWorkspaceAccountSwitch(t, ctx, store, owner, paidWedding) })
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
		EXISTS (SELECT 1 FROM family_passes WHERE source='support:upgrade-test-pass' AND wedding_id IS NULL AND consumed_at IS NOT NULL)`,
		legacyWedding, paidWedding).Scan(&invitationPreserved, &paidRemoved, &passStillConsumed)
	if err != nil || !invitationPreserved || !paidRemoved || !passStillConsumed {
		t.Fatalf("after cleanup: legacy invitation preserved=%t, paid wedding removed=%t, pass still consumed=%t: %v",
			invitationPreserved, paidRemoved, passStillConsumed, err)
	}
}

func verifyWorkspaceAccountSwitch(t *testing.T, ctx context.Context, store *workspaceStore, owner, wedding string) {
	const origin = "https://planner.example.test"
	app := &workspaceHTTP{store: store, origin: origin, login: testWorkspaceLogin{prefix: "upgrade-test:auth:"}}
	mux := http.NewServeMux()
	app.Register(mux)
	request := func(method, path, source string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, origin+path, nil).WithContext(ctx)
		if source != "" {
			req.Header.Set("Origin", source)
		}
		for _, cookie := range cookies {
			req.AddCookie(cookie)
		}
		response := httptest.NewRecorder()
		mux.ServeHTTP(response, req)
		return response
	}
	signIn := func(code string) *http.Cookie {
		t.Helper()
		start := request(http.MethodGet, "/auth/google/start", "")
		cookies := start.Result().Cookies()
		if start.Code != http.StatusSeeOther || len(cookies) != 1 {
			t.Fatalf("sign-in start: %d, cookies=%d", start.Code, len(cookies))
		}
		state, _, _ := strings.Cut(cookies[0].Value, ".")
		callback := request(http.MethodGet, "/auth/google/callback?state="+state+"&code="+code, "", cookies[0])
		if callback.Code != http.StatusSeeOther {
			t.Fatalf("sign-in callback: %d", callback.Code)
		}
		for _, cookie := range callback.Result().Cookies() {
			if cookie.Name == workspaceSessionCookie && cookie.MaxAge > 0 {
				return cookie
			}
		}
		t.Fatal("sign-in did not issue a session cookie")
		return nil
	}

	first := signIn("first")
	if response := request(http.MethodPost, "/api/workspace/logout", "https://other.example.test", first); response.Code != http.StatusForbidden {
		t.Fatalf("cross-origin sign-out returned %d", response.Code)
	}
	if response := request(http.MethodGet, "/api/workspace/weddings", "", first); response.Code != http.StatusOK {
		t.Fatalf("valid session returned %d", response.Code)
	}
	for range 2 {
		response := request(http.MethodPost, "/api/workspace/logout", origin, first)
		if response.Code != http.StatusNoContent {
			t.Fatalf("sign-out returned %d", response.Code)
		}
		cleared := false
		for _, cookie := range response.Result().Cookies() {
			if cookie.Name == workspaceSessionCookie && cookie.MaxAge < 0 && cookie.Path == "/" {
				cleared = true
			}
		}
		if !cleared {
			t.Fatal("sign-out did not expire the workspace cookie")
		}
	}
	if response := request(http.MethodGet, "/api/workspace/weddings", "", first); response.Code != http.StatusUnauthorized {
		t.Fatalf("signed-out session returned %d", response.Code)
	}
	second := signIn("second")
	response := request(http.MethodGet, "/api/workspace/session", "", second)
	var session struct{ Name string }
	if response.Code != http.StatusOK || json.Unmarshal(response.Body.Bytes(), &session) != nil || session.Name != "second" {
		t.Fatal("second sign-in did not use the second account")
	}
	if response := request(http.MethodGet, "/api/workspace/weddings/"+wedding, "", second); response.Code != http.StatusNotFound {
		t.Fatalf("second account's request for another family's wedding returned %d", response.Code)
	}
	person, err := store.addPerson(ctx, wedding, owner, "Invited family member")
	if err != nil {
		t.Fatal(err)
	}
	token, err := store.invite(ctx, wedding, owner, person, "family")
	if err != nil {
		t.Fatal(err)
	}
	join := func(cookie *http.Cookie) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, origin+"/api/workspace/join",
			strings.NewReader(fmt.Sprintf(`{"token":%q}`, token))).WithContext(ctx)
		req.Header.Set("Origin", origin)
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(cookie)
		response := httptest.NewRecorder()
		mux.ServeHTTP(response, req)
		return response
	}
	for range 2 {
		response := join(second)
		var joined struct{ ID string }
		if response.Code != http.StatusCreated || json.Unmarshal(response.Body.Bytes(), &joined) != nil || joined.ID != wedding {
			t.Fatalf("joining or reopening an invite returned %d: %s", response.Code, response.Body)
		}
	}
	if response := join(signIn("third")); response.Code != http.StatusNotFound {
		t.Fatalf("another account retried a used invite and got %d", response.Code)
	}
	if response := request(http.MethodGet, "/api/workspace/weddings/"+wedding, "", second); response.Code != http.StatusOK {
		t.Fatalf("joined family member could not open their wedding: %d", response.Code)
	}

}

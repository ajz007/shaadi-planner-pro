package workspace

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"
)

type analyticsTestLogin struct{ testWorkspaceLogin }

func (login analyticsTestLogin) identity(ctx context.Context, code, verifier string) (workspaceIdentity, error) {
	identity, err := login.testWorkspaceLogin.identity(ctx, code, verifier)
	identity.email = code + "@example.test"
	return identity, err
}

func TestAdminAnalyticsAccessAndAccountCounts(t *testing.T) {
	connection := os.Getenv("SHAADI_TEST_DATABASE_URL")
	if connection == "" {
		t.Skip("set SHAADI_TEST_DATABASE_URL to a dedicated test database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	store, err := openWorkspace(ctx, connection)
	if err != nil {
		t.Fatal(err)
	}
	defer store.db.Close()
	const origin = "https://planner.example.test"
	prefix := googleSubjectPrefix + "analytics-test:" + workspaceSecret() + ":"
	app := &workspaceHTTP{store: store, origin: origin, adminEmail: "owner@example.test",
		login: analyticsTestLogin{testWorkspaceLogin{prefix: prefix}}}
	mux := http.NewServeMux()
	app.Register(mux)
	app.RegisterAdmin(mux, nil)
	request := func(path string, cookie *http.Cookie, want int) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(http.MethodGet, origin+path, nil).WithContext(ctx)
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("%s: got %d, want %d: %s", path, w.Code, want, w.Body.String())
		}
		return w
	}
	login := func(code string) *http.Cookie {
		t.Helper()
		start := request("/auth/google/start?admin=1", nil, http.StatusSeeOther)
		destination, err := url.Parse(start.Header().Get("Location"))
		if err != nil {
			t.Fatal(err)
		}
		callback := request("/auth/google/callback?code="+code+"&state="+destination.Query().Get("state"),
			start.Result().Cookies()[0], http.StatusSeeOther)
		if callback.Header().Get("Location") != "/admin" {
			t.Fatal("Google callback did not return to admin")
		}
		for _, cookie := range callback.Result().Cookies() {
			if cookie.Name == workspaceSessionCookie {
				return cookie
			}
		}
		t.Fatal("Google callback did not set a session")
		return nil
	}
	now := time.Now()
	before, err := store.analytics(ctx, nil, now, 7)
	if err != nil {
		t.Fatal(err)
	}
	if redirect := request("/admin", nil, http.StatusSeeOther).Header().Get("Location"); redirect != "/auth/google/start?admin=1" {
		t.Fatalf("unexpected sign-in redirect %q", redirect)
	}
	if _, err := store.db.ExecContext(ctx, "INSERT INTO workspace_accounts (identity_subject, display_name, created_at) VALUES ($1, 'Returning user', NULL)", prefix+"returning"); err != nil {
		t.Fatal(err)
	}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if _, err := store.db.ExecContext(cleanup, "DELETE FROM workspace_accounts WHERE identity_subject LIKE $1", prefix+"%"); err != nil {
			t.Error(err)
		}
	}()
	denied := request("/admin", login("returning"), http.StatusForbidden)
	if strings.Contains(denied.Body.String(), "Successful sign-ins") {
		t.Fatal("analytics exposed to a non-admin")
	}
	login("owner")
	owner := login("owner")
	page := request("/admin?days=7", owner, http.StatusOK)
	if page.Header().Get("Cache-Control") != "private, no-store" ||
		!strings.Contains(page.Body.String(), "Daily activity") {
		t.Fatal("dashboard content or private cache header missing")
	}
	report, err := store.analytics(ctx, nil, now, 7)
	if err != nil {
		t.Fatal(err)
	}
	if newAccounts, signins := report.Total.NewAccounts-before.Total.NewAccounts, report.Total.Signins-before.Total.Signins; newAccounts != 1 || signins != 3 {
		t.Fatalf("got %d new accounts and %d sign-ins, want 1 and 3", newAccounts, signins)
	}
	app.adminEmail = "changed@example.test"
	request("/admin", owner, http.StatusForbidden)
	app.adminEmail = ""
	request("/admin", owner, http.StatusNotFound)
}

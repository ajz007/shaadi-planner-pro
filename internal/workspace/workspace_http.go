package workspace

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/ajz007/shaadi-planner-pro/internal/httpx"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/oauth2"
)

var workspaceUUID = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

func Configure(ctx context.Context, publicOrigin string) (*workspaceHTTP, error) {
	connection, id, secret := os.Getenv("SHAADI_DATABASE_URL"), os.Getenv("SHAADI_GOOGLE_CLIENT_ID"), os.Getenv("SHAADI_GOOGLE_CLIENT_SECRET")
	localTest := os.Getenv("SHAADI_LOCAL_TEST_LOGIN") == "1"
	if publicOrigin != "" && localTest {
		return nil, errors.New("local test sign-in is only available in loopback mode")
	}
	if publicOrigin == "" && id == "" && secret == "" && !localTest {
		return nil, nil
	}
	if connection == "" || (!localTest && (id == "" || secret == "")) {
		return nil, errors.New("workspace sign-in requires a database URL and both Google OAuth credentials")
	}
	if localTest {
		config, err := pgx.ParseConfig(connection)
		if err != nil || config.Database != "shaadi_local" || (config.Host != "127.0.0.1" && config.Host != "localhost") ||
			id != "" || secret != "" {
			return nil, errors.New("local test sign-in requires a local shaadi_local database and no Google credentials")
		}
		for _, fallback := range config.Fallbacks {
			if fallback.Host != "127.0.0.1" && fallback.Host != "localhost" {
				return nil, errors.New("local test database fallbacks must be loopback addresses")
			}
		}
	}
	origin := publicOrigin
	if origin == "" {
		origin = os.Getenv("SHAADI_WORKSPACE_ORIGIN")
		if origin == "" {
			origin = "http://localhost:8080"
		}
		if origin != "http://localhost:8080" && origin != "http://127.0.0.1:8080" {
			return nil, errors.New("workspace origin must match the local demo address")
		}
	}
	store, err := openWorkspace(ctx, connection)
	if err != nil {
		return nil, errors.New("could not connect to or migrate the workspace database")
	}
	if localTest {
		return &workspaceHTTP{store: store, origin: origin, localTest: true}, nil
	}
	config := oauth2.Config{
		ClientID: id, ClientSecret: secret, RedirectURL: origin + "/auth/google/callback",
		Scopes: []string{"openid", "profile", "email"},
		Endpoint: oauth2.Endpoint{
			AuthURL: "https://accounts.google.com/o/oauth2/v2/auth", TokenURL: "https://oauth2.googleapis.com/token",
			AuthStyle: oauth2.AuthStyleInParams,
		},
	}
	return &workspaceHTTP{store: store, origin: origin, login: googleWorkspaceLogin{config: config}}, nil
}

func (a *workspaceHTTP) matchesHost(r *http.Request) bool {
	_, host, _ := strings.Cut(a.origin, "://")
	return r.Host == host
}

type workspaceRequest func(http.ResponseWriter, *http.Request, string)

func (a *workspaceHTTP) protected(next workspaceRequest) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if r.Method != http.MethodGet && r.Header.Get("Origin") != a.origin {
			httpx.Fail(w, http.StatusForbidden, "Open the workspace from its configured address.")
			return
		}
		account, _, err := a.session(r.Context(), r)
		if errors.Is(err, errWorkspaceNotFound) {
			httpx.Fail(w, http.StatusUnauthorized, "Sign in to open the workspace.")
			return
		}
		if err != nil {
			workspaceFailure(w, err)
			return
		}
		next(w, r, account)
	}
}

func (a *workspaceHTTP) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/workspace/session", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if a == nil {
			httpx.Reply(w, http.StatusOK, map[string]bool{"configured": false})
			return
		}
		if !a.matchesHost(r) {
			httpx.Reply(w, http.StatusOK, map[string]any{"configured": true, "workspaceURL": a.origin + "/#workspace"})
			return
		}
		_, name, err := a.session(r.Context(), r)
		if err != nil && !errors.Is(err, errWorkspaceNotFound) {
			workspaceFailure(w, err)
			return
		}
		httpx.Reply(w, http.StatusOK, map[string]any{"configured": true, "name": name, "localTest": a.localTest})
	})
	if a == nil {
		return
	}
	if a.localTest {
		mux.HandleFunc("POST /auth/local", a.localSignIn)
	} else {
		mux.HandleFunc("GET /auth/google/start", func(w http.ResponseWriter, r *http.Request) {
			if !a.matchesHost(r) {
				http.Redirect(w, r, a.origin+"/#workspace", http.StatusSeeOther)
				return
			}
			a.startLogin(w, r)
		})
		mux.HandleFunc("GET /auth/google/callback", a.finishLogin)
	}
	mux.HandleFunc("POST /api/workspace/logout", a.protected(func(w http.ResponseWriter, r *http.Request, _ string) { a.logout(w, r) }))
	mux.HandleFunc("GET /api/workspace/weddings", a.protected(a.weddings))
	mux.HandleFunc("POST /api/workspace/weddings", a.protected(a.create))
	mux.HandleFunc("GET /api/workspace/weddings/{wedding}", a.protected(a.view))
	mux.HandleFunc("POST /api/workspace/weddings/{wedding}/{action}", a.protected(a.action))
	mux.HandleFunc("POST /api/workspace/join", a.protected(a.join))
	mux.HandleFunc("POST /api/workspace/import/preview", a.protected(a.importPreview))
	mux.HandleFunc("POST /api/workspace/import/confirm", a.protected(a.importConfirm))
	mux.HandleFunc("GET /api/workspace/weddings/{wedding}/imported-sections", a.protected(a.importedSections))
	mux.HandleFunc("GET /api/workspace/weddings/{wedding}/guests", a.protected(a.guests))
	mux.HandleFunc("GET /api/workspace/weddings/{wedding}/transportation", a.protected(a.pickups))
	mux.HandleFunc("POST /api/workspace/weddings/{wedding}/transportation/{pickup}", a.protected(a.savePickup))
	mux.HandleFunc("POST /api/workspace/weddings/{wedding}/guests/{guest}", a.protected(a.saveGuest))
	mux.HandleFunc("POST /api/workspace/weddings/{wedding}/guests/bulk", a.protected(a.bulkEditGuests))
	mux.HandleFunc("GET /api/workspace/weddings/{wedding}/logistics/{section}", a.protected(a.logistics))
	mux.HandleFunc("POST /api/workspace/weddings/{wedding}/logistics/{section}/{record}", a.protected(a.saveLogistics))
	mux.HandleFunc("GET /api/workspace/weddings/{wedding}/planning", a.protected(a.planning))
	mux.HandleFunc("POST /api/workspace/weddings/{wedding}/planning/{kind}/{record}", a.protected(a.savePlanning))
	mux.HandleFunc("GET /api/workspace/weddings/{wedding}/vendors/{vendor}/documents", a.protected(a.vendorDocuments))
	mux.HandleFunc("POST /api/workspace/weddings/{wedding}/vendors/{vendor}/documents", a.protected(a.uploadVendorDocuments))
	mux.HandleFunc("GET /api/workspace/weddings/{wedding}/vendors/{vendor}/documents/{document}", a.protected(a.downloadVendorDocument))
	mux.HandleFunc("POST /api/workspace/weddings/{wedding}/vendors/{vendor}/documents/{document}", a.protected(a.removeVendorDocument))
	mux.HandleFunc("GET /api/workspace/weddings/{wedding}/finance", a.protected(a.finance))
	mux.HandleFunc("POST /api/workspace/weddings/{wedding}/finance/{kind}/{record}", a.protected(a.saveFinance))
	mux.HandleFunc("GET /api/workspace/weddings/{wedding}/snapshot.xlsx", a.protected(a.weddingSnapshot))
}

func workspaceFailure(w http.ResponseWriter, err error) {
	var dbError *pgconn.PgError
	switch {
	case errors.Is(err, errWorkspaceNotFound):
		httpx.Fail(w, http.StatusNotFound, "This record is unavailable.")
	case errors.Is(err, errWorkspaceInput):
		httpx.Fail(w, http.StatusUnprocessableEntity, "Check the details and try again.")
	case errors.Is(err, errWorkspaceConflict):
		httpx.Fail(w, http.StatusConflict, "The plan changed. Refresh and try again.")
	case errors.As(err, &dbError) && dbError.Code == "23505":
		httpx.Fail(w, http.StatusConflict, "This person or account already belongs to the wedding.")
	case errors.As(err, &dbError) && dbError.Code == "23503":
		httpx.Fail(w, http.StatusUnprocessableEntity, "The selected person or function is unavailable.")
	default:
		log.Printf("workspace request failed: %T", err)
		httpx.Fail(w, http.StatusInternalServerError, "The workspace could not complete this request.")
	}
}

type weddingSummary struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Date     string `json:"date"`
	TimeZone string `json:"timeZone"`
	Role     string `json:"role"`
	PersonID string `json:"personId"`
}

type workspacePerson struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type workspaceFunction struct {
	ID       string    `json:"id"`
	Name     string    `json:"name"`
	Venue    string    `json:"venue"`
	StartsAt time.Time `json:"startsAt"`
}

type workspaceRowsQueryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

func queryWorkspace[T any](ctx context.Context, db workspaceRowsQueryer, scan func(*sql.Rows, *T) error, query string, args ...any) ([]T, error) {
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []T{}
	for rows.Next() {
		var item T
		if err := scan(rows, &item); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (a *workspaceHTTP) weddings(w http.ResponseWriter, r *http.Request, actor string) {
	items, err := queryWorkspace(r.Context(), a.store.db, func(row *sql.Rows, item *weddingSummary) error {
		return row.Scan(&item.ID, &item.Name, &item.Date, &item.TimeZone, &item.Role, &item.PersonID)
	}, `SELECT w.id, w.name, w.wedding_date::text, w.time_zone, m.role, m.person_id
		FROM weddings w JOIN wedding_memberships m ON w.id = m.wedding_id
		WHERE m.account_id = $1 ORDER BY w.created_at, w.id`, actor)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	httpx.Reply(w, http.StatusOK, items)
}

func (a *workspaceHTTP) create(w http.ResponseWriter, r *http.Request, actor string) {
	var input struct{ Name, Date, TimeZone string }
	if !httpx.ReadJSON(w, r, &input) {
		return
	}
	id, err := a.store.createWedding(r.Context(), actor, input.Name, input.Date, input.TimeZone)
	workspaceCreated(w, id, err)
}

func (a *workspaceHTTP) view(w http.ResponseWriter, r *http.Request, actor string) {
	wedding := r.PathValue("wedding")
	if !workspaceUUID.MatchString(wedding) {
		httpx.Fail(w, http.StatusNotFound, "Wedding unavailable.")
		return
	}
	ctx := r.Context()
	var summary weddingSummary
	err := scanWorkspace(a.store.db.QueryRowContext(ctx, `
		SELECT w.id, w.name, w.wedding_date::text, w.time_zone, m.role, m.person_id
		FROM weddings w JOIN wedding_memberships m ON w.id = m.wedding_id
		WHERE w.id = $1 AND m.account_id = $2`, wedding, actor),
		&summary.ID, &summary.Name, &summary.Date, &summary.TimeZone, &summary.Role, &summary.PersonID)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	functions, err := queryWorkspace(ctx, a.store.db, func(row *sql.Rows, item *workspaceFunction) error {
		return row.Scan(&item.ID, &item.Name, &item.Venue, &item.StartsAt)
	}, `SELECT f.id, f.name, concat_ws(' · ', p.name, NULLIF(f.venue,'')), f.starts_at FROM wedding_functions f
		JOIN wedding_memberships m ON f.wedding_id = m.wedding_id
		LEFT JOIN wedding_places p ON p.wedding_id=f.wedding_id AND p.id=f.place_id
		WHERE f.wedding_id = $1 AND m.account_id = $2 ORDER BY f.starts_at, f.id`, wedding, actor)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	people, err := queryWorkspace(ctx, a.store.db, func(row *sql.Rows, item *workspacePerson) error {
		return row.Scan(&item.ID, &item.Name)
	}, `SELECT p.id, p.name FROM wedding_people p JOIN wedding_memberships m ON p.wedding_id = m.wedding_id
		WHERE p.wedding_id = $1 AND m.account_id = $2 AND (m.role <> 'family' OR p.id = m.person_id)
		ORDER BY p.name, p.id`, wedding, actor)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	tasks, err := a.store.listTasks(ctx, wedding, actor)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	httpx.Reply(w, http.StatusOK, map[string]any{"wedding": summary, "people": people, "functions": functions, "tasks": tasks})
}

func workspaceCreated(w http.ResponseWriter, id string, err error) {
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	httpx.Reply(w, http.StatusCreated, map[string]string{"id": id})
}

func (a *workspaceHTTP) join(w http.ResponseWriter, r *http.Request, actor string) {
	var input struct{ Token string }
	if !httpx.ReadJSON(w, r, &input) {
		return
	}
	if len(input.Token) != 43 {
		workspaceFailure(w, errWorkspaceInput)
		return
	}
	id, err := a.store.acceptInvite(r.Context(), actor, input.Token)
	workspaceCreated(w, id, err)
}

func (a *workspaceHTTP) action(w http.ResponseWriter, r *http.Request, actor string) {
	wedding := r.PathValue("wedding")
	if !workspaceUUID.MatchString(wedding) {
		workspaceFailure(w, errWorkspaceNotFound)
		return
	}
	ctx := r.Context()
	switch r.PathValue("action") {
	case "guests":
		a.saveGuest(w, r, actor)
	case "transportation":
		a.savePickup(w, r, actor)
	case "people":
		var input struct{ Name string }
		if httpx.ReadJSON(w, r, &input) {
			id, err := a.store.addPerson(ctx, wedding, actor, input.Name)
			workspaceCreated(w, id, err)
		}
	case "functions":
		var input struct{ Name, Venue, StartsAt string }
		if !httpx.ReadJSON(w, r, &input) {
			return
		}
		var zone string
		err := scanWorkspace(a.store.db.QueryRowContext(ctx, `
			SELECT w.time_zone FROM weddings w JOIN wedding_memberships m ON m.wedding_id = w.id
			WHERE w.id = $1 AND m.account_id = $2 AND m.role IN ('owner', 'co-organizer')`, wedding, actor), &zone)
		if err != nil {
			workspaceFailure(w, err)
			return
		}
		location, err := time.LoadLocation(zone)
		if err != nil {
			workspaceFailure(w, err)
			return
		}
		const localFormat = "2006-01-02T15:04"
		start, err := time.ParseInLocation(localFormat, input.StartsAt, location)
		if err != nil || start.Format(localFormat) != input.StartsAt {
			workspaceFailure(w, errWorkspaceInput)
			return
		}
		id, err := a.store.addFunction(ctx, wedding, actor, input.Name, input.Venue, start)
		workspaceCreated(w, id, err)
	case "tasks":
		var input struct {
			Title                   string
			Function, Assignee, Due *string
			Claimable               bool
		}
		if !httpx.ReadJSON(w, r, &input) {
			return
		}
		if (input.Function != nil && !workspaceUUID.MatchString(*input.Function)) ||
			(input.Assignee != nil && !workspaceUUID.MatchString(*input.Assignee)) {
			workspaceFailure(w, errWorkspaceInput)
			return
		}
		id, err := a.store.addTask(ctx, wedding, actor, workspaceTask{
			Title: input.Title, Function: input.Function, Assignee: input.Assignee, Due: input.Due, Claimable: input.Claimable,
		})
		workspaceCreated(w, id, err)
	case "invite":
		var input struct{ Person, Role string }
		if !httpx.ReadJSON(w, r, &input) {
			return
		}
		if !workspaceUUID.MatchString(input.Person) {
			workspaceFailure(w, errWorkspaceInput)
			return
		}
		token, err := a.store.invite(ctx, wedding, actor, input.Person, input.Role)
		if err != nil {
			workspaceFailure(w, err)
			return
		}
		httpx.Reply(w, http.StatusCreated, map[string]string{"token": token})
	case "revoke":
		var input struct{ Token string }
		if !httpx.ReadJSON(w, r, &input) {
			return
		}
		if len(input.Token) != 43 {
			workspaceFailure(w, errWorkspaceInput)
			return
		}
		if err := a.store.revokeInvite(ctx, wedding, actor, input.Token); err != nil {
			workspaceFailure(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	case "claim", "complete", "reassign":
		a.taskAction(w, r, actor, wedding)
	default:
		workspaceFailure(w, errWorkspaceNotFound)
	}
}

func (a *workspaceHTTP) taskAction(w http.ResponseWriter, r *http.Request, actor, wedding string) {
	var input struct {
		Task     string
		Revision int
		Done     *bool
		Assignee *string
	}
	if !httpx.ReadJSON(w, r, &input) {
		return
	}
	if !workspaceUUID.MatchString(input.Task) {
		workspaceFailure(w, errWorkspaceInput)
		return
	}
	if r.PathValue("action") == "claim" {
		assignee, err := a.store.claimTask(r.Context(), wedding, actor, input.Task)
		if errors.Is(err, errWorkspaceConflict) {
			httpx.Reply(w, http.StatusConflict, map[string]string{"error": "Already claimed by " + assignee + "."})
			return
		}
		if err != nil {
			workspaceFailure(w, err)
			return
		}
		httpx.Reply(w, http.StatusOK, map[string]string{"assignee": assignee})
		return
	}
	if input.Revision < 1 {
		workspaceFailure(w, errWorkspaceInput)
		return
	}
	var revision int
	var err error
	if r.PathValue("action") == "reassign" {
		if input.Assignee != nil && !workspaceUUID.MatchString(*input.Assignee) {
			workspaceFailure(w, errWorkspaceInput)
			return
		}
		revision, err = a.store.reassignTask(r.Context(), wedding, actor, input.Task, input.Revision, input.Assignee)
	} else {
		if input.Done == nil {
			workspaceFailure(w, errWorkspaceInput)
			return
		}
		revision, err = a.store.setTaskDone(r.Context(), wedding, actor, input.Task, input.Revision, *input.Done)
	}
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	httpx.Reply(w, http.StatusOK, map[string]int{"revision": revision})
}

func (a *workspaceHTTP) Close() {
	a.store.db.Close()
}

func (a *workspaceHTTP) MaintainImportPreviews(ctx context.Context) {
	a.store.maintainImportPreviews(ctx)
}

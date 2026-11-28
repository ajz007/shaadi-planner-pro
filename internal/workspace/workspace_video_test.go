package workspace

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"
)

type fakeVideoRenderer struct {
	composition string
	props       videoSnapshot
	startErr    error
	state       videoProgress
	files       string
}

func (f *fakeVideoRenderer) start(_ context.Context, composition string, props any) (string, string, error) {
	if f.startErr != nil {
		return "", "", f.startErr
	}
	f.composition, f.props = composition, props.(videoSnapshot)
	return "render-1", "spp-video-test", nil
}

func (f *fakeVideoRenderer) progress(context.Context, string, string) (videoProgress, error) {
	return f.state, nil
}

func (f *fakeVideoRenderer) fileURL(_ context.Context, bucket, key, name string, download bool) (string, error) {
	query := url.Values{"name": {name}}
	if download {
		query.Set("download", "1")
	}
	return f.files + "/" + bucket + "/" + key + "?" + query.Encode(), nil
}

func TestWeddingVideos(t *testing.T) {
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
	mp4 := "pretend mp4 bytes"
	files := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(mp4)) }))
	defer files.Close()
	const origin = "http://127.0.0.1:8080"
	prefix := "video-test:" + workspaceSecret() + ":"
	app := &workspaceHTTP{store: store, origin: origin, login: testWorkspaceLogin{prefix: prefix}}
	mux := http.NewServeMux()
	app.Register(mux)
	var wedding string
	defer func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if wedding != "" {
			if _, err := store.db.ExecContext(cleanup, "DELETE FROM weddings WHERE id = $1", wedding); err != nil {
				t.Error(err)
			}
		}
		if _, err := store.db.ExecContext(cleanup, "DELETE FROM workspace_accounts WHERE identity_subject LIKE $1", prefix+"%"); err != nil {
			t.Error(err)
		}
	}()
	request := func(method, path, body string, cookie *http.Cookie, want int) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, origin+path, strings.NewReader(body)).WithContext(ctx)
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Origin", origin)
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("%s %s: got %d, want %d: %s", method, path, w.Code, want, w.Body.String())
		}
		return w
	}
	login := func(code string) *http.Cookie {
		t.Helper()
		start := request("GET", "/auth/google/start", "", nil, http.StatusSeeOther)
		destination, err := url.Parse(start.Header().Get("Location"))
		if err != nil {
			t.Fatal(err)
		}
		callback := request("GET", "/auth/google/callback?code="+code+"&state="+destination.Query().Get("state"),
			"", start.Result().Cookies()[0], http.StatusSeeOther)
		for _, cookie := range callback.Result().Cookies() {
			if cookie.Name == workspaceSessionCookie {
				return cookie
			}
		}
		t.Fatal("sign-in did not set a session")
		return nil
	}
	owner, relative := login("owner"), login("relative")
	var ownerID string
	if err := store.db.QueryRowContext(ctx, "SELECT id FROM workspace_accounts WHERE identity_subject = $1", prefix+"owner").Scan(&ownerID); err != nil {
		t.Fatal(err)
	}
	if wedding, err = store.createWedding(ctx, ownerID, "आरव & Meera", "2027-02-14", "Asia/Kolkata"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.ExecContext(ctx, `WITH person AS (
		INSERT INTO wedding_people (wedding_id, name) VALUES ($1, 'Relative') RETURNING id
	) INSERT INTO wedding_memberships (wedding_id, account_id, person_id, role)
	SELECT $1, a.id, p.id, 'family' FROM person p CROSS JOIN workspace_accounts a WHERE a.identity_subject = $2`,
		wedding, prefix+"relative"); err != nil {
		t.Fatal(err)
	}
	path := "/api/workspace/weddings/" + wedding + "/guest-rsvp/videos"
	ask := `{"kind":"invite","language":"hindi"}`

	// Switched off until the Lambda renderer is configured.
	if body := request("GET", path, "", owner, http.StatusOK).Body.String(); !strings.Contains(body, `"enabled":false`) {
		t.Fatalf("disabled list: %s", body)
	}
	request("POST", path, ask, owner, http.StatusServiceUnavailable)

	renderer := &fakeVideoRenderer{files: files.URL}
	app.video = renderer
	request("GET", path, "", relative, http.StatusNotFound)
	request("POST", path, ask, relative, http.StatusNotFound)
	request("POST", path, `{"kind":"reel","language":"english"}`, owner, http.StatusUnprocessableEntity)
	if body := request("POST", path, ask, owner, http.StatusConflict).Body.String(); !strings.Contains(body, "Publish the invitation first") {
		t.Fatalf("asked before publishing: %s", body)
	}

	photo := []byte("jpeg bytes")
	if _, err := store.db.ExecContext(ctx, `UPDATE weddings SET guest_page_photo=$2 WHERE id=$1`, wedding, photo); err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.ExecContext(ctx, `INSERT INTO wedding_invitations (wedding_id, enabled, published, published_at)
		VALUES ($1, true, jsonb_build_object('content', '{}'::jsonb, 'templateId', 'blush-envelope', 'templateVersion', 1,
			'templateOptions', '{"palette":"royal"}'::jsonb), now())`, wedding); err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.ExecContext(ctx, `INSERT INTO wedding_functions (wedding_id, name, starts_at, family_only)
		VALUES ($1, 'Sangeet', '2027-02-13T13:30:00Z', false), ($1, 'Family puja', '2027-02-12T04:00:00Z', true)`, wedding); err != nil {
		t.Fatal(err)
	}
	request("POST", path, ask, owner, http.StatusAccepted)
	snapshot := renderer.props
	if renderer.composition != "planner-invite" || snapshot.Language != "hindi" || snapshot.TemplateID != "blush-envelope" ||
		snapshot.TemplateOptions["palette"] != "royal" || len(snapshot.Events) != 1 || snapshot.Events[0].Name != "Sangeet" ||
		!strings.HasPrefix(snapshot.Photo, origin+"/api/video-photo/") {
		t.Fatalf("unexpected render %q with %+v", renderer.composition, snapshot)
	}
	request("POST", path, ask, owner, http.StatusConflict)

	// Lambda fetches the photo with the one-time link, without a session.
	photoPath := strings.TrimPrefix(snapshot.Photo, origin)
	if got := request("GET", photoPath, "", nil, http.StatusOK).Body.String(); got != string(photo) {
		t.Fatalf("photo %q", got)
	}
	request("GET", "/api/video-photo/not-a-token", "", nil, http.StatusNotFound)

	renderer.state = videoProgress{Progress: 0.4}
	if body := request("GET", path, "", owner, http.StatusOK).Body.String(); !strings.Contains(body, `"progress":0.4`) ||
		!strings.Contains(body, `"status":"rendering"`) {
		t.Fatalf("in progress: %s", body)
	}
	request("GET", path+"/invite", "", owner, http.StatusNotFound)

	renderer.state = videoProgress{Done: true, Progress: 1, Key: "renders/render-1/out.mp4", Bytes: int64(len(mp4))}
	if _, err := store.db.ExecContext(ctx, `UPDATE wedding_videos SET checked_at=now()-interval '1 minute' WHERE wedding_id=$1`, wedding); err != nil {
		t.Fatal(err)
	}
	if body := request("GET", path, "", owner, http.StatusOK).Body.String(); !strings.Contains(body, `"status":"ready"`) ||
		!strings.Contains(body, `"hasFile":true`) {
		t.Fatalf("finished: %s", body)
	}
	request("GET", photoPath, "", nil, http.StatusNotFound)

	play := request("GET", path+"/invite", "", owner, http.StatusFound).Header().Get("Location")
	if !strings.Contains(play, "/spp-video-test/renders/render-1/out.mp4") || strings.Contains(play, "download=1") ||
		!strings.Contains(play, "invitation.mp4") {
		t.Fatalf("play link %q", play)
	}
	if save := request("GET", path+"/invite?download=1", "", owner, http.StatusFound).Header().Get("Location"); !strings.Contains(save, "download=1") {
		t.Fatalf("download link %q", save)
	}
	shared := request("GET", path+"/invite?share=1", "", owner, http.StatusOK)
	if shared.Body.String() != mp4 || shared.Header().Get("Content-Type") != "video/mp4" {
		t.Fatalf("shared %q", shared.Body.String())
	}
	var downloads int
	if err := store.db.QueryRowContext(ctx, `SELECT downloads FROM wedding_videos WHERE wedding_id=$1`, wedding).Scan(&downloads); err != nil || downloads != 2 {
		t.Fatalf("downloads %d, %v", downloads, err)
	}
	request("GET", path+"/invite", "", relative, http.StatusNotFound)

	// A failed start is recorded, and the previous file stays available.
	renderer.startErr = errors.New("lambda unavailable")
	request("POST", path, `{"kind":"invite","language":"english"}`, owner, http.StatusBadGateway)
	if body := request("GET", path, "", owner, http.StatusOK).Body.String(); !strings.Contains(body, `"status":"failed"`) ||
		!strings.Contains(body, `"hasFile":true`) {
		t.Fatalf("after failure: %s", body)
	}
	request("GET", path+"/invite", "", owner, http.StatusFound)
}

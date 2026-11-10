package main

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"
)

type testWorkspaceLogin struct{ prefix string }

func (login testWorkspaceLogin) authorizationURL(state, _ string) string {
	return "https://login.example.test/?state=" + state
}

func (login testWorkspaceLogin) identity(_ context.Context, code, verifier string) (workspaceIdentity, error) {
	if len(verifier) != 43 {
		return workspaceIdentity{}, errors.New("missing verifier")
	}
	return workspaceIdentity{subject: login.prefix + code, name: code}, nil
}

func TestPrivateWorkspaceHTTP(t *testing.T) {
	connection := os.Getenv("SHAADI_TEST_DATABASE_URL")
	if connection == "" {
		t.Skip("set SHAADI_TEST_DATABASE_URL to a dedicated test database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	store, err := openWorkspace(ctx, connection)
	if err != nil {
		t.Fatal(err)
	}
	defer store.db.Close()
	prefix := "http-test:" + time.Now().UTC().Format(time.RFC3339Nano) + ":"
	const origin = "http://127.0.0.1:8080"
	app := &workspaceHTTP{store: store, origin: origin, login: testWorkspaceLogin{prefix: prefix}}
	mux := http.NewServeMux()
	app.register(mux)
	var wedding, importedWedding string
	t.Cleanup(func() {
		cleanup, stop := context.WithTimeout(context.Background(), 5*time.Second)
		defer stop()
		db, err := openWorkspace(cleanup, connection)
		if err != nil {
			t.Error(err)
			return
		}
		defer db.db.Close()
		for _, id := range []string{wedding, importedWedding} {
			if id != "" {
				if _, err := db.db.ExecContext(cleanup, "DELETE FROM weddings WHERE id = $1", id); err != nil {
					t.Error(err)
				}
			}
		}
		if _, err := db.db.ExecContext(cleanup, "DELETE FROM workspace_accounts WHERE identity_subject LIKE $1", prefix+"%"); err != nil {
			t.Error(err)
		}
	})

	request := func(method, path, body, requestOrigin string, cookie *http.Cookie, want int) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(method, origin+path, strings.NewReader(body)).WithContext(ctx)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Origin", requestOrigin)
		if cookie != nil {
			req.AddCookie(cookie)
		}
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code != want {
			t.Fatalf("%s %s returned %d, want %d: %s", method, path, rec.Code, want, rec.Body)
		}
		return rec
	}
	login := func(name string) *http.Cookie {
		t.Helper()
		start := request("GET", "/auth/google/start", "", "", nil, 303)
		location, err := url.Parse(start.Header().Get("Location"))
		if err != nil {
			t.Fatal(err)
		}
		flow := start.Result().Cookies()[0]
		bad := request("GET", "/auth/google/callback?state=wrong&code="+name, "", "", flow, 303)
		if bad.Header().Get("Location") != "/#workspace?login=failed" {
			t.Fatal("mismatched login state was accepted")
		}
		callback := request("GET", "/auth/google/callback?state="+location.Query().Get("state")+"&code="+name, "", "", flow, 303)
		for _, cookie := range callback.Result().Cookies() {
			if cookie.Name == workspaceSessionCookie && cookie.HttpOnly && cookie.Value != "" {
				return cookie
			}
		}
		t.Fatal("callback did not create an HTTP-only session")
		return nil
	}
	stringValue := func(rec *httptest.ResponseRecorder, key string) string {
		t.Helper()
		var data map[string]string
		if err := json.Unmarshal(rec.Body.Bytes(), &data); err != nil || data[key] == "" {
			t.Fatalf("missing %s in response: %s", key, rec.Body)
		}
		return data[key]
	}

	owner, brother, outsider := login("Owner"), login("Brother"), login("Outsider")
	request("GET", "/api/workspace/weddings", "", "", nil, 401)
	request("POST", "/api/workspace/weddings", "{}", "https://other.example", owner, 403)
	wedding = stringValue(request("POST", "/api/workspace/weddings",
		`{"name":"Private wedding","date":"2027-02-15","timeZone":"Asia/Kolkata"}`, origin, owner, 201), "id")
	path := "/api/workspace/weddings/" + wedding
	request("GET", path, "", "", outsider, 404)
	person := stringValue(request("POST", path+"/people", `{"name":"Brother"}`, origin, owner, 201), "id")
	function := stringValue(request("POST", path+"/functions",
		`{"name":"Sangeet","venue":"Hall","startsAt":"2027-02-14T19:00"}`, origin, owner, 201), "id")
	request("POST", path+"/tasks", `{"title":"Sound check","function":"`+function+`","assignee":"`+person+`"}`, origin, owner, 201)
	openTask := stringValue(request("POST", path+"/tasks", `{"title":"Arrange pickup","claimable":true}`, origin, owner, 201), "id")
	token := stringValue(request("POST", path+"/invite", `{"person":"`+person+`","role":"family"}`, origin, owner, 201), "token")
	request("POST", "/api/workspace/join", `{"token":"`+token+`"}`, origin, brother, 201)
	request("POST", "/api/workspace/join", `{"token":"`+token+`"}`, origin, outsider, 404)
	view := request("GET", path, "", "", brother, 200)
	var plan struct {
		Functions []workspaceFunction `json:"functions"`
		Tasks     []workspaceTask     `json:"tasks"`
	}
	if err := json.Unmarshal(view.Body.Bytes(), &plan); err != nil {
		t.Fatal(err)
	}
	if len(plan.Functions) != 1 || !plan.Functions[0].StartsAt.Equal(time.Date(2027, 2, 14, 13, 30, 0, 0, time.UTC)) ||
		len(plan.Tasks) != 2 || !strings.Contains(view.Body.String(), "Sound check") {
		t.Fatalf("existing task or wedding-local function time missing: %s", view.Body)
	}
	request("POST", path+"/claim", `{"task":"`+openTask+`"}`, origin, brother, 200)
	request("POST", path+"/complete", `{"task":"`+openTask+`","revision":2,"done":true}`, origin, brother, 200)
	request("POST", path+"/complete", `{"task":"`+openTask+`","revision":2,"done":false}`, origin, owner, 409)
	request("POST", "/api/workspace/logout", "{}", origin, brother, 204)
	request("GET", path, "", "", brother, 401)

	if os.Getenv("SHAADI_TEST_WORKBOOK_PACKAGE") != "" {
		workbook := launchWorkbook(t, "DEMO")
		preview := request("POST", "/api/workspace/import/preview", string(workbook), origin, owner, 200)
		var data struct {
			Token  string       `json:"token"`
			Totals importTotals `json:"totals"`
		}
		if err := json.Unmarshal(preview.Body.Bytes(), &data); err != nil || data.Token == "" || data.Totals.Guests != 14 {
			t.Fatalf("invalid review response: %s", preview.Body)
		}
		list := request("GET", "/api/workspace/weddings", "", "", owner, 200)
		if strings.Contains(list.Body.String(), "Aarav & Meera") {
			t.Fatal("preview created a wedding")
		}
		body := `{"token":"` + data.Token + `"}`
		request("POST", "/api/workspace/import/confirm", body, origin, outsider, 404)
		importedWedding = stringValue(request("POST", "/api/workspace/import/confirm", body, origin, owner, 201), "id")
		repeated := stringValue(request("POST", "/api/workspace/import/confirm", body, origin, owner, 201), "id")
		if repeated != importedWedding {
			t.Fatal("confirmation created a duplicate wedding")
		}
		path := "/api/workspace/weddings/" + importedWedding
		rec := request("GET", path, "", "", owner, 200)
		var imported struct {
			Functions []workspaceFunction `json:"functions"`
			Tasks     []workspaceTask     `json:"tasks"`
			People    []workspacePerson   `json:"people"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &imported); err != nil || len(imported.Functions) != 4 || len(imported.Tasks) != 5 {
			t.Fatalf("wedding functions or tasks were lost: %s", rec.Body)
		}
		var brotherID string
		for _, person := range imported.People {
			if person.Name == "Brother" {
				brotherID = person.ID
			}
		}
		if brotherID == "" {
			t.Fatal("import did not create the planning person for Brother")
		}
		var assigned bool
		for _, item := range imported.Tasks {
			if item.Title == "Finalize room allocation" && item.Assignee != nil && *item.Assignee == brotherID {
				assigned = true
			}
		}
		if !assigned {
			t.Fatal("import did not keep Brother's task assignment")
		}
		sections := request("GET", path+"/imported-sections", "", "", owner, 200)
		if !strings.Contains(sections.Body.String(), "guestLinks") {
			t.Fatal("imported guest references were not stored")
		}
		brotherSession := login("Brother")
		brotherInvite := stringValue(request("POST", path+"/invite", `{"person":"`+brotherID+`","role":"family"}`, origin, owner, 201), "token")
		request("POST", "/api/workspace/join", `{"token":"`+brotherInvite+`"}`, origin, brotherSession, 201)
		joined := request("GET", path, "", "", brotherSession, 200)
		if !strings.Contains(joined.Body.String(), "Finalize room allocation") {
			t.Fatal("member could not see the imported assignment")
		}
		request("GET", path+"/imported-sections", "", "", brotherSession, 404)
		guestsResponse := request("GET", path+"/guests", "", "", owner, 200)
		var guests []liveGuest
		if err := json.Unmarshal(guestsResponse.Body.Bytes(), &guests); err != nil || len(guests) != 14 {
			t.Fatalf("live guest records missing: %s", guestsResponse.Body)
		}
		var guestID string
		for _, guest := range guests {
			if guest.WorkbookID == "G001" {
				guestID = guest.ID
				if guest.ArrivalDate != "2027-02-14" || guest.ArrivalTime != "08:30" || guest.TransportRequired != "Yes" || len(guest.Links) != 3 {
					t.Fatalf("arrival details were not preserved: %+v", guest)
				}
			}
		}
		update := `{"name":"Rajiv Sharma","arrivalDate":"2027-02-14","arrivalTime":"11:37","transportRequired":"Yes","revision":1}`
		request("POST", path+"/guests/"+guestID, update, origin, brotherSession, 404)
		request("GET", path+"/guests", "", "", brotherSession, 404)
		request("POST", path+"/guests/"+guestID, update, origin, owner, 200)
		request("POST", path+"/guests/"+guestID, update, origin, owner, 409)
		request("POST", path+"/guests", `{"name":"Additional guest","side":"Bride"}`, origin, owner, 201)
		request("GET", path+"/snapshot.xlsx", "", "", outsider, 404)
		request("GET", path+"/snapshot.xlsx", "", "", brotherSession, 404)
		snapshot := request("GET", path+"/snapshot.xlsx", "", "", owner, 200)
		archive, err := zip.NewReader(bytes.NewReader(snapshot.Body.Bytes()), int64(snapshot.Body.Len()))
		if err != nil {
			t.Fatal(err)
		}
		found := false
		for _, part := range archive.File {
			if !strings.HasPrefix(part.Name, "xl/worksheets/") {
				continue
			}
			file, err := part.Open()
			if err != nil {
				t.Fatal(err)
			}
			content, err := io.ReadAll(file)
			file.Close()
			if err != nil {
				t.Fatal(err)
			}
			text := string(content)
			if strings.Contains(text, "Additional guest") && strings.Contains(text, "11:37") && strings.Contains(text, "G001") {
				found = true
			}
		}
		if !found {
			t.Fatal("downloaded workbook did not contain the new guest and edited arrival")
		}
	}
}

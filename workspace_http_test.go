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
			Wedding   weddingSummary      `json:"wedding"`
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
		var reassignedTask workspaceTask
		for _, task := range imported.Tasks {
			if task.Title == "Pack bridal jewellery" {
				reassignedTask = task
			}
		}
		if reassignedTask.ID == "" {
			t.Fatal("missing imported task to reassign")
		}
		reassignBody := `{"task":"` + reassignedTask.ID + `","revision":1,"assignee":"` + imported.Wedding.PersonID + `"}`
		request("POST", path+"/reassign", reassignBody, origin, brotherSession, 404)
		request("POST", path+"/reassign", reassignBody, origin, owner, 200)
		request("POST", path+"/reassign", reassignBody, origin, owner, 409)
		reassigned := request("GET", path, "", "", owner, 200)
		var reassignedPlan struct{ Tasks []workspaceTask }
		if err := json.Unmarshal(reassigned.Body.Bytes(), &reassignedPlan); err != nil {
			t.Fatal(err)
		}
		var ownerAssigned bool
		for _, task := range reassignedPlan.Tasks {
			if task.ID == reassignedTask.ID && task.Assignee != nil && *task.Assignee == imported.Wedding.PersonID {
				ownerAssigned = true
			}
		}
		if !ownerAssigned {
			t.Fatal("reassigned task did not appear under the owner's planning ID")
		}
		pickupList := func() []savedPickup {
			t.Helper()
			response := request("GET", path+"/transportation", "", "", owner, 200)
			var pickups []savedPickup
			if err := json.Unmarshal(response.Body.Bytes(), &pickups); err != nil {
				t.Fatal(err)
			}
			return pickups
		}
		originalPickups := pickupList()
		if len(originalPickups) != 3 || originalPickups[0].NeedsReview || len(originalPickups[0].Passengers) != 4 {
			t.Fatalf("workbook pickups did not seed with current arrival details: %+v", originalPickups)
		}
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
		update := `{"name":"Rajiv Sharma","household":"Sharma Family","side":"Groom","rsvp":"Confirmed","arrivalDate":"2027-02-14","arrivalTime":"11:37","arrivalMode":"Flight","transportRequired":"Yes","revision":1}`
		request("POST", path+"/guests/"+guestID, update, origin, brotherSession, 404)
		request("GET", path+"/guests", "", "", brotherSession, 404)
		request("POST", path+"/guests/"+guestID, update, origin, owner, 200)
		request("POST", path+"/guests/"+guestID, update, origin, owner, 409)
		changed := pickupList()[0]
		if !changed.NeedsReview || changed.Time != "08:30" || changed.Passengers[0].Arrival.Time != "11:37" || changed.Passengers[0].Reviewed.Time != "08:30" {
			t.Fatalf("arrival change should flag the original pickup without moving it: %+v", changed)
		}
		passengers := make([]map[string]any, 0, len(changed.Passengers))
		for _, passenger := range changed.Passengers {
			passengers = append(passengers, map[string]any{"id": passenger.ID, "revision": passenger.Revision})
		}
		pickupBody := map[string]any{"date": changed.Date, "time": "11:50", "pickupPoint": changed.PickupPoint,
			"dropPoint": changed.DropPoint, "vehicle": "Review test van", "status": "Confirmed",
			"revision": changed.Revision, "passengers": passengers}
		payload, err := json.Marshal(pickupBody)
		if err != nil {
			t.Fatal(err)
		}
		request("GET", path+"/transportation", "", "", brotherSession, 404)
		request("POST", path+"/transportation/"+changed.ID, string(payload), origin, brotherSession, 404)
		request("POST", path+"/transportation/"+changed.ID, string(payload), origin, owner, 200)
		request("POST", path+"/transportation/"+changed.ID, string(payload), origin, owner, 409)
		foundReviewed := false
		for _, pickup := range pickupList() {
			if pickup.ID == changed.ID && !pickup.NeedsReview && pickup.Time == "11:50" {
				foundReviewed = true
			}
		}
		if !foundReviewed {
			t.Fatal("reviewed pickup time and cleared flag were not saved")
		}
		pickupBody["time"] = "12:30"
		passengers[0]["revision"] = 1
		payload, err = json.Marshal(pickupBody)
		if err != nil {
			t.Fatal(err)
		}
		request("POST", path+"/transportation", string(payload), origin, owner, 409)
		if len(pickupList()) != 3 {
			t.Fatal("failed passenger check left a partial pickup")
		}
		passengers[0]["revision"] = changed.Passengers[0].Revision
		pickupBody["pickupPoint"] = "Test arrival gate"
		payload, err = json.Marshal(pickupBody)
		if err != nil {
			t.Fatal(err)
		}
		request("POST", path+"/transportation", string(payload), origin, owner, 201)
		request("POST", path+"/guests", `{"name":"Additional guest","side":"Bride"}`, origin, owner, 201)
		request("GET", path+"/snapshot.xlsx", "", "", outsider, 404)
		request("GET", path+"/snapshot.xlsx", "", "", brotherSession, 404)
		roomsPath, followupsPath := path+"/logistics/accommodation", path+"/logistics/rsvp-follow-up"
		readLogistics := func(endpoint string) []logisticsRecord {
			t.Helper()
			response := request("GET", endpoint, "", "", owner, 200)
			var records []logisticsRecord
			if err := json.Unmarshal(response.Body.Bytes(), &records); err != nil {
				t.Fatal(err)
			}
			return records
		}
		rooms, followups := readLogistics(roomsPath), readLogistics(followupsPath)
		if len(rooms) != 4 || rooms[0].Values[9] != "2" || len(followups) != 3 || followups[0].Values[2] == "" {
			t.Fatal("rooms or follow-ups did not seed from the workbook with their guest details")
		}
		request("GET", roomsPath, "", "", brotherSession, 404)
		roomEdit := `{"values":{"0":"Test live hotel","1":"201","2":"Single","10":"2027-02-14","11":"2027-02-16"},"guestLinks":{"3":"G001","4":"G002"},"revision":1}`
		request("POST", roomsPath+"/"+rooms[0].ID, roomEdit, origin, brotherSession, 404)
		request("POST", roomsPath+"/"+rooms[0].ID, roomEdit, origin, owner, 200)
		request("POST", roomsPath+"/"+rooms[0].ID, roomEdit, origin, owner, 409)
		request("POST", roomsPath+"/new", `{"values":{"0":"Test hotel","1":"202"},"guestLinks":{"3":"G001","4":"G001"}}`, origin, owner, 422)
		request("POST", roomsPath+"/new", `{"values":{"0":"Test hotel","1":"202"},"guestLinks":{"3":"UNKNOWN"}}`, origin, owner, 422)
		addedRoom := stringValue(request("POST", roomsPath+"/new", `{"values":{"0":"Temporary hotel","1":"203"}}`, origin, owner, 201), "id")
		request("POST", roomsPath+"/"+addedRoom, `{"remove":true,"revision":1}`, origin, owner, 200)
		rooms = readLogistics(roomsPath)
		if len(rooms) != 4 || rooms[0].Values[0] != "Test live hotel" || rooms[0].Values[14] != "Over room capacity" {
			t.Fatal("room edit or allocation check was not reflected in the live plan")
		}
		followupEdit := `{"values":{"4":"2027-01-21","6":"2027-01-19","7":"Test live follow-up"},"guestLinks":{"0":"G001"},"revision":1}`
		request("POST", followupsPath+"/"+followups[0].ID, followupEdit, origin, owner, 200)
		request("POST", path+"/guests/"+guestID, strings.Replace(strings.Replace(update, `"Confirmed"`, `"Maybe"`, 1), `"revision":1`, `"revision":2`, 1), origin, owner, 200)
		followups = readLogistics(followupsPath)
		if followups[0].Values[3] != "Maybe" || followups[0].Values[7] != "Test live follow-up" {
			t.Fatal("follow-up did not show the saved action and current guest RSVP")
		}
		updatedGuests := request("GET", path+"/guests", "", "", owner, 200).Body.String()
		if !strings.Contains(updatedGuests, "Test live hotel") || !strings.Contains(updatedGuests, "Test live follow-up") {
			t.Fatal("guest links did not reflect changes to the live plan")
		}
		importHistory := request("GET", path+"/imported-sections", "", "", owner, 200).Body.String()
		if strings.Contains(importHistory, "Test live hotel") || strings.Contains(importHistory, "Test live follow-up") {
			t.Fatal("live edits overwrote the original import history")
		}
		snapshot := request("GET", path+"/snapshot.xlsx", "", "", owner, 200)
		archive, err := zip.NewReader(bytes.NewReader(snapshot.Body.Bytes()), int64(snapshot.Body.Len()))
		if err != nil {
			t.Fatal(err)
		}
		found, foundTransport, foundRoom, foundFollowup := false, false, false, false
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
			foundRoom = foundRoom || strings.Contains(text, "Test live hotel") && strings.Contains(text, "Over room capacity")
			foundFollowup = foundFollowup || strings.Contains(text, "Test live follow-up") && strings.Contains(text, "Maybe")
			if strings.Contains(text, "Additional guest") && strings.Contains(text, "11:37") && strings.Contains(text, "G001") {
				found = true
			}
			if strings.Contains(text, "Test arrival gate") && strings.Contains(text, "Review test van") &&
				strings.Contains(text, "11:50") && strings.Contains(text, "12:30") {
				foundTransport = true
			}
		}
		if !found {
			t.Fatal("downloaded workbook did not contain the new guest and edited arrival")
		}
		if !foundTransport {
			t.Fatal("downloaded workbook did not contain the saved transportation changes")
		}
		if !foundRoom || !foundFollowup {
			t.Fatal("downloaded workbook did not include live room and follow-up changes")
		}
		// Simulate an older import with numeric and AM/PM values, including an
		// explicitly cleared arrival. Reapply the repair to the saved records.
		if _, err := store.db.ExecContext(ctx, `UPDATE wedding_imported_sections SET payload =
			jsonb_set(jsonb_set(jsonb_set(payload, '{rows,2,values,12}', '"0.3541666666666666"'),
			'{rows,3,values,12}', '"8:30 AM"'), '{rows,4,values,12}', '"0.5555555555555555"')
			WHERE wedding_id = $1 AND section_name = 'Guest List'`, importedWedding); err != nil {
			t.Fatal(err)
		}
		if _, err := store.db.ExecContext(ctx, `UPDATE wedding_guests SET arrival_time = NULL, revision =
			CASE WHEN workbook_id = 'G004' THEN 2 ELSE 1 END
			WHERE wedding_id = $1 AND workbook_id IN ('G003','G004','G005')`, importedWedding); err != nil {
			t.Fatal(err)
		}
		if _, err := store.db.ExecContext(ctx, `UPDATE wedding_pickup_passengers l SET arrival_time = '13:19'
			FROM wedding_guests g WHERE l.guest_id = g.id AND g.wedding_id = $1 AND g.workbook_id = 'G005'`, importedWedding); err != nil {
			t.Fatal(err)
		}
		if _, err := store.db.ExecContext(ctx, workspaceArrivalRepairMigration); err != nil {
			t.Fatal(err)
		}
		var repaired, cleared, baseline string
		if err := store.db.QueryRowContext(ctx, `SELECT
			COALESCE((SELECT to_char(arrival_time, 'HH24:MI') FROM wedding_guests WHERE wedding_id = $1 AND workbook_id = 'G003'), ''),
			COALESCE((SELECT to_char(arrival_time, 'HH24:MI') FROM wedding_guests WHERE wedding_id = $1 AND workbook_id = 'G004'), ''),
			(SELECT l.arrival_time FROM wedding_pickup_passengers l JOIN wedding_guests g ON g.id = l.guest_id
			 JOIN wedding_pickups p ON p.id = l.pickup_id
			 WHERE g.wedding_id = $1 AND g.workbook_id = 'G005' AND p.workbook_row IS NOT NULL)`, importedWedding).
			Scan(&repaired, &cleared, &baseline); err != nil {
			t.Fatal(err)
		}
		if repaired != "08:30" || cleared != "" || baseline != "13:20" {
			t.Fatalf("migration did not preserve the correct arrivals: %q %q %q", repaired, cleared, baseline)
		}
	}
}

package workspace

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"image"
	"image/jpeg"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/ajz007/shaadi-planner-pro/internal/httpx"
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
	t.Run("loopback", func(t *testing.T) { testPrivateWorkspaceHTTP(t, "http://127.0.0.1:8080") })
	t.Run("hosted", func(t *testing.T) { testPrivateWorkspaceHTTP(t, "https://planner.example.com") })
}

func testPrivateWorkspaceHTTP(t *testing.T, origin string) {
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
	secure := strings.HasPrefix(origin, "https://")
	app := &workspaceHTTP{store: store, origin: origin, login: testWorkspaceLogin{prefix: prefix}}
	mux := http.NewServeMux()
	app.Register(mux)
	var handler http.Handler = mux
	if secure {
		handler = httpx.HostedOnly(origin, mux)
	}
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
		req := httptest.NewRequest(method, strings.Replace(origin, "https://", "http://", 1)+path, strings.NewReader(body)).WithContext(ctx)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Origin", requestOrigin)
		if cookie != nil {
			req.AddCookie(cookie)
		}
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
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
		if flow.Secure != secure || !flow.HttpOnly {
			t.Fatal("incorrect OAuth flow cookie security")
		}
		bad := request("GET", "/auth/google/callback?state=wrong&code="+name, "", "", flow, 303)
		if bad.Header().Get("Location") != "/#workspace?login=failed" {
			t.Fatal("mismatched login state was accepted")
		}
		callback := request("GET", "/auth/google/callback?state="+location.Query().Get("state")+"&code="+name, "", "", flow, 303)
		for _, cookie := range callback.Result().Cookies() {
			if cookie.Name == workspaceSessionCookie && cookie.HttpOnly && cookie.Secure == secure && cookie.Value != "" {
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
	rsvpPath := path + "/guest-rsvp"
	request("GET", rsvpPath, "", "", brother, 404)
	guestID := stringValue(request("POST", path+"/guests", `{"name":"Guest A","household":"Household A"}`, origin, owner, 201), "id")
	otherGuest := stringValue(request("POST", path+"/guests", `{"name":"Guest B","household":"Household B"}`, origin, owner, 201), "id")
	editLabels := func(field, name string, targets []guestBulkTarget, status int) *httptest.ResponseRecorder {
		t.Helper()
		payload, err := json.Marshal(guestBulkEdit{Field: field, Value: name, Guests: targets})
		if err != nil {
			t.Fatal(err)
		}
		return request("POST", path+"/guests/bulk", string(payload), origin, owner, status)
	}
	guestTargets := []guestBulkTarget{{ID: guestID, Revision: 1}, {ID: otherGuest, Revision: 1}}
	editLabels("addLabel", " Grand Palace  Hotel ", guestTargets, 200)
	editLabels("addLabel", "Stale group", guestTargets, 409)
	guestTargets[0].Revision++
	guestTargets[1].Revision++
	if rec := editLabels("addLabel", "grand palace hotel", guestTargets, 200); !strings.Contains(rec.Body.String(), `"updated":0`) {
		t.Fatalf("reusing a label should leave existing assignments alone: %s", rec.Body)
	}
	editLabels("addLabel", "Friday station pickup", guestTargets[:1], 200)
	editLabels("removeLabel", "GRAND PALACE HOTEL", guestTargets[1:], 200)
	var labelledGuests []liveGuest
	if rec := request("GET", path+"/guests", "", "", owner, 200); json.Unmarshal(rec.Body.Bytes(), &labelledGuests) != nil ||
		len(labelledGuests) != 2 || strings.Join(labelledGuests[0].Labels, "|") != "Friday station pickup|Grand Palace Hotel" ||
		len(labelledGuests[1].Labels) != 0 {
		t.Fatalf("labels should overlap across households and be removable per guest: %s", rec.Body)
	}
	request("GET", path+"/guests", "", "", brother, 404)
	inviteTo := func(guest, function string) string {
		return `{"guestId":"` + guest + `","functionId":"` + function + `"}`
	}
	selection := func(invitations ...string) string {
		return `{"invitations":[` + strings.Join(invitations, ",") + `]}`
	}
	request("POST", rsvpPath, selection(inviteTo(guestID, function), inviteTo(otherGuest, function)), origin, owner, 422)
	created := request("POST", rsvpPath, selection(inviteTo(guestID, function)), origin, owner, 201)
	linkPath := rsvpPath + "/links/" + stringValue(created, "id")
	_, secret, ok := strings.Cut(stringValue(created, "url"), "/rsvp#")
	if !ok || !rsvpToken.MatchString(secret) {
		t.Fatal("expected a guest link with its secret in the fragment")
	}
	request("POST", rsvpPath, selection(inviteTo(guestID, function)), origin, owner, 409)
	otherLink := request("POST", rsvpPath, selection(inviteTo(otherGuest, function)), origin, owner, 201)
	_, otherSecret, _ := strings.Cut(stringValue(otherLink, "url"), "/rsvp#")
	publicPath := "/api/guest-rsvp"
	readRSVP := func(secret string, status int) *httptest.ResponseRecorder {
		return request("POST", publicPath, `{"token":"`+secret+`"}`, origin, nil, status)
	}
	public := readRSVP(secret, 200)
	var publicRSVP struct{ Invitations []rsvpInvitation }
	if err := json.Unmarshal(public.Body.Bytes(), &publicRSVP); err != nil || len(publicRSVP.Invitations) != 1 ||
		publicRSVP.Invitations[0].Guest != "Guest A" || strings.Contains(public.Body.String(), "Household A") ||
		strings.Contains(public.Body.String(), "linkId") {
		t.Fatalf("unexpected guest visibility: %s", public.Body)
	}
	replyID := publicRSVP.Invitations[0].ID
	guestReply := func(secret, id string) string {
		return `{"token":"` + secret + `","id":"` + id + `","reply":{"status":"attending","revision":1}}`
	}
	request("POST", publicPath, guestReply(otherSecret, replyID), origin, nil, 409)
	request("POST", publicPath, guestReply(secret, replyID), "https://other.example", nil, 403)
	request("POST", publicPath, guestReply(secret, replyID), origin, nil, 200)
	request("POST", publicPath, guestReply(secret, replyID), origin, nil, 409)
	replyPath := rsvpPath + "/replies/" + replyID
	request("POST", replyPath, `{"status":"declined","revision":1}`, origin, owner, 409)
	request("POST", replyPath, `{"status":"declined","revision":2}`, origin, owner, 204)
	if rows := request("GET", rsvpPath, "", "", owner, 200).Body.String(); !strings.Contains(rows, `"replySource":"organizer"`) ||
		!strings.Contains(rows, `"status":"declined"`) || strings.Contains(rows, secret) {
		t.Fatalf("organizer should see the recorded reply, with no plaintext link: %s", rows)
	}
	replaced := request("POST", linkPath, `{"action":"replace","revision":1}`, origin, owner, 200)
	_, newSecret, _ := strings.Cut(stringValue(replaced, "url"), "/rsvp#")
	readRSVP(secret, 404)
	if body := readRSVP(newSecret, 200).Body.String(); !strings.Contains(body, `"status":"declined"`) {
		t.Fatalf("replacement did not preserve the reply: %s", body)
	}
	request("POST", linkPath, `{"action":"revoke","revision":2}`, origin, owner, 204)
	readRSVP(newSecret, 404)
	request("POST", publicPath, guestReply(newSecret, replyID), origin, nil, 404)
	if _, err := store.db.ExecContext(ctx, "UPDATE wedding_rsvp_links SET expires_at=now() WHERE token_hash=$1", inviteHash(otherSecret)); err != nil {
		t.Fatal(err)
	}
	readRSVP(otherSecret, 404)

	timelinePath := path + "/planning/timeline/"
	activity := `{"fields":["2027-02-14","18:30","Main Hall","Sound check and handoff","","DJ","Pending","","30","Use the side door"],"functionId":"` +
		function + `","ownerId":"` + person + `","revision":0}`
	request("POST", timelinePath+"new", activity, origin, brother, 404)
	request("POST", timelinePath+"new", activity, origin, owner, 204)
	var runSheet weddingPlanning
	if rec := request("GET", path+"/planning", "", "", owner, 200); json.Unmarshal(rec.Body.Bytes(), &runSheet) != nil ||
		len(runSheet.Timeline) != 1 || runSheet.Timeline[0].Function != "Sangeet" || runSheet.Timeline[0].Fields[4] != "Brother" ||
		runSheet.Timeline[0].Fields[8] != "30 min" {
		t.Fatalf("unexpected saved run sheet: %s", rec.Body)
	}
	activityPath := timelinePath + runSheet.Timeline[0].ID
	updatedActivity := strings.Replace(strings.Replace(activity, "18:30", "18:15", 1), `"revision":0`, `"revision":1`, 1)
	request("POST", activityPath, updatedActivity, origin, owner, 204)
	request("POST", activityPath, updatedActivity, origin, owner, 409)
	request("POST", activityPath, `{"remove":true,"revision":2}`, origin, owner, 204)
	housemate := stringValue(request("POST", path+"/guests", `{"name":"Guest C","household":"Household A"}`, origin, owner, 201), "id")
	reception := stringValue(request("POST", path+"/functions",
		`{"name":"Reception","venue":"Hall","startsAt":"2027-02-15T19:00"}`, origin, owner, 201), "id")
	household := request("POST", rsvpPath, selection(inviteTo(guestID, reception), inviteTo(housemate, reception),
		inviteTo(housemate, function)), origin, owner, 201)
	_, householdSecret, _ := strings.Cut(stringValue(household, "url"), "/rsvp#")
	if rec := readRSVP(householdSecret, 200); json.Unmarshal(rec.Body.Bytes(), &publicRSVP) != nil ||
		len(publicRSVP.Invitations) != 3 || publicRSVP.Invitations[0].Guest != "Guest A" ||
		publicRSVP.Invitations[0].Function != "Reception" {
		t.Fatalf("household link should include only the selected guest and function pairs: %s", rec.Body)
	}
	pagePath := rsvpPath + "/page"
	request("GET", pagePath, "", "", brother, 404)
	var photo bytes.Buffer
	if err := jpeg.Encode(&photo, image.NewRGBA(image.Rect(0, 0, 2, 2)), nil); err != nil {
		t.Fatal(err)
	}
	design := guestPageDesign{Heading: "Aarav & Meera", Welcome: "Join us for the wedding", Theme: "rose", CoverPhoto: photo.Bytes()}
	pageBody, err := json.Marshal(struct {
		guestPageDesign
		Revision int `json:"revision"`
	}{design, 1})
	if err != nil {
		t.Fatal(err)
	}
	request("POST", pagePath, string(pageBody), origin, owner, 200)
	request("POST", pagePath, string(pageBody), origin, owner, 409)
	var publicPage guestPageDetails
	if rec := readRSVP(householdSecret, 200); json.Unmarshal(rec.Body.Bytes(), &publicPage) != nil ||
		publicPage.Design.Heading != design.Heading || publicPage.Design.Theme != "rose" || !bytes.Equal(publicPage.Design.CoverPhoto, photo.Bytes()) {
		t.Fatal("the private invitation did not show the saved wedding page")
	}
	schedulePath := rsvpPath + "/schedule"
	request("POST", schedulePath, `{"date":"2027-02-15"}`, origin, brother, 404)
	request("GET", schedulePath, "", "", brother, 404)
	scheduleLink := request("POST", schedulePath, `{"date":"2027-02-15"}`, origin, owner, 201)
	scheduleURL := stringValue(scheduleLink, "url")
	scheduleID := stringValue(scheduleLink, "id")
	reused := request("POST", schedulePath, `{"date":"2027-02-15"}`, origin, owner, 200)
	if stringValue(reused, "url") != scheduleURL || stringValue(reused, "id") != scheduleID {
		t.Fatal("the same active schedule scope should reuse the existing record and URL")
	}
	var scheduleLinks []guestScheduleLink
	if rec := request("GET", schedulePath, "", "", owner, 200); json.Unmarshal(rec.Body.Bytes(), &scheduleLinks) != nil ||
		len(scheduleLinks) != 1 || scheduleLinks[0].URL != scheduleURL {
		t.Fatalf("the organizer should be able to copy the active link again: %s", rec.Body)
	}
	_, scheduleSecret, _ := strings.Cut(scheduleURL, "/wedding-schedule#")
	scheduleBody := `{"token":"` + scheduleSecret + `"}`
	shared := request("POST", "/api/guest-schedule", scheduleBody, origin, nil, 200)
	if body := shared.Body.String(); !strings.Contains(body, "Reception") || strings.Contains(body, "Sangeet") ||
		strings.Contains(body, "Guest A") || strings.Contains(body, "invitations") {
		t.Fatalf("schedule link should show only the date's public events: %s", body)
	}
	readRSVP(scheduleSecret, 404)
	request("POST", schedulePath+"/"+scheduleID, "{}", origin, owner, 204)
	request("POST", "/api/guest-schedule", scheduleBody, origin, nil, 404)
	replacement := request("POST", schedulePath, `{"date":"2027-02-15"}`, origin, owner, 201)
	if stringValue(replacement, "url") == scheduleURL {
		t.Fatal("a revoked schedule address must stay revoked")
	}
	legacySecret := newRSVPToken()
	if _, err := store.db.ExecContext(ctx, `INSERT INTO wedding_guest_schedule_links(wedding_id,function_id,token_hash,expires_at)
		VALUES ($1,$2,$3,now()+interval '1 day')`, wedding, function, inviteHash(legacySecret)); err != nil {
		t.Fatal(err)
	}
	legacy := request("POST", schedulePath, `{"functionId":"`+function+`"}`, origin, owner, 200)
	_, copySecret, _ := strings.Cut(stringValue(legacy, "url"), "/wedding-schedule#")
	for _, secret := range []string{legacySecret, copySecret} {
		rec := request("POST", "/api/guest-schedule", `{"token":"`+secret+`"}`, origin, nil, 200)
		if !strings.Contains(rec.Body.String(), "Sangeet") || strings.Contains(rec.Body.String(), "Reception") {
			t.Fatalf("both addresses should resolve to the same scoped schedule: %s", rec.Body)
		}
	}
	request("POST", schedulePath+"/"+stringValue(legacy, "id"), "{}", origin, owner, 204)
	for _, secret := range []string{legacySecret, copySecret} {
		request("POST", "/api/guest-schedule", `{"token":"`+secret+`"}`, origin, nil, 404)
	}

	first, second := publicRSVP.Invitations[0].ID, publicRSVP.Invitations[1].ID
	batch := `{"token":"` + householdSecret + `","replies":[{"id":"` + first +
		`","status":"attending","revision":1},{"id":"` + second + `","status":"declined","revision":9}]}`
	request("POST", publicPath, batch, origin, nil, 409)
	request("POST", publicPath, strings.Replace(batch, `"revision":9`, `"revision":1`, 1), origin, nil, 204)
	if rec := readRSVP(householdSecret, 200); json.Unmarshal(rec.Body.Bytes(), &publicRSVP) != nil ||
		publicRSVP.Invitations[0].Status != "attending" || publicRSVP.Invitations[1].Status != "declined" ||
		publicRSVP.Invitations[2].Status != "pending" {
		t.Fatalf("batch replies should only update the selected invitations: %s", rec.Body)
	}
	travelBody := `{"token":"` + householdSecret + `","travel":{"guestId":"` + guestID +
		`","arrivalDate":"2027-02-14","arrivalTime":"17:30","pickup":"yes","stay":"no","revision":0}}`
	request("POST", publicPath, strings.Replace(travelBody, guestID, otherGuest, 1), origin, nil, 409)
	request("POST", publicPath, travelBody, origin, nil, 204)
	request("POST", publicPath, travelBody, origin, nil, 409)
	if rec := request("GET", rsvpPath, "", "", owner, 200); !strings.Contains(rec.Body.String(), `"arrivalTime":"17:30"`) {
		t.Fatal("guest arrival plans are missing from the organizer view")
	}
	// Existing links must respect an audience change, including guest updates.
	defaultSchedule := request("POST", schedulePath, "{}", origin, owner, 201)
	familyOnly := `{"name":"Sangeet","venue":"Hall","start":"2027-02-14T19:00","revision":1,"familyOnly":true}`
	request("POST", path+"/planning/functions/"+function, familyOnly, origin, owner, 204)
	if rec := request("GET", path, "", "", brother, 200); !strings.Contains(rec.Body.String(), `"familyOnly":true`) {
		t.Fatal("family-only functions must stay in the wedding team's plan")
	}
	if rec := readRSVP(householdSecret, 200); strings.Contains(rec.Body.String(), "Sangeet") {
		t.Fatal("a previously shared household link still exposes the family-only function")
	}
	hiddenID := publicRSVP.Invitations[1].ID
	request("POST", publicPath, strings.Replace(guestReply(householdSecret, hiddenID), `"revision":1`, `"revision":2`, 1), origin, nil, 409)
	request("POST", rsvpPath, selection(inviteTo(guestID, function)), origin, owner, 422)
	familyInvite := strings.TrimSuffix(inviteTo(guestID, function), "}") + `,"includeFamilyOnly":true}`
	privateRSVP := request("POST", rsvpPath, selection(familyInvite), origin, owner, 201)
	_, familySecret, _ := strings.Cut(stringValue(privateRSVP, "url"), "/rsvp#")
	if rec := readRSVP(familySecret, 200); !strings.Contains(rec.Body.String(), "Sangeet") {
		t.Fatal("explicitly included family-only function is missing from the RSVP link")
	}
	guestSchedule := func(link *httptest.ResponseRecorder) string {
		_, key, _ := strings.Cut(stringValue(link, "url"), "/wedding-schedule#")
		return request("POST", "/api/guest-schedule", `{"token":"`+key+`"}`, origin, nil, 200).Body.String()
	}
	request("POST", schedulePath, "{}", origin, owner, 200)
	if body := guestSchedule(defaultSchedule); strings.Contains(body, "Sangeet") || !strings.Contains(body, "Reception") {
		t.Fatalf("default guest schedule did not limit visibility: %s", body)
	}
	request("POST", schedulePath, `{"functionId":"`+function+`"}`, origin, owner, 422)
	request("POST", schedulePath, `{"date":"2027-02-15","familyFunctionIds":["`+function+`"]}`, origin, owner, 422)
	familyScope := `{"familyFunctionIds":["` + function + `"]}`
	familySchedule := request("POST", schedulePath, familyScope, origin, owner, 201)
	reusedFamilySchedule := request("POST", schedulePath, familyScope, origin, owner, 200)
	if stringValue(reusedFamilySchedule, "url") != stringValue(familySchedule, "url") ||
		stringValue(familySchedule, "url") == stringValue(defaultSchedule, "url") ||
		!strings.Contains(guestSchedule(familySchedule), "Sangeet") {
		t.Fatal("a family-only selection must use its own reusable guest schedule link")
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
		financePath := path + "/finance"
		readFinance := func() weddingFinance {
			t.Helper()
			var data weddingFinance
			if err := json.Unmarshal(request("GET", financePath, "", "", owner, 200).Body.Bytes(), &data); err != nil {
				t.Fatal(err)
			}
			return data
		}
		finance := readFinance()
		if len(finance.Vendors) != 4 || len(finance.Contracts) != 5 {
			t.Fatalf("finance sections did not seed: %d vendors, %d contracts", len(finance.Vendors), len(finance.Contracts))
		}
		var importedContract vendorContract
		for _, contract := range finance.Contracts {
			if contract.Values[1] == "LensCraft Studio" {
				importedContract = contract
			}
		}
		if importedContract.VendorID == "" || importedContract.OpeningPaid != 2000000 || importedContract.Paid != 2000000 {
			t.Fatalf("imported contract lost its vendor link or opening balance: %+v", importedContract)
		}
		request("GET", financePath, "", "", brotherSession, 404)
		request("GET", financePath, "", "", outsider, 404)
		vendorBody := `{"values":["Catering","Live Test Caterer","1200.50","Dinner","","","Test owner","Shortlisted","1000.50",""]}`
		request("POST", financePath+"/vendors/new", vendorBody, origin, brotherSession, 404)
		vendorID := stringValue(request("POST", financePath+"/vendors/new", vendorBody, origin, owner, 200), "id")
		contractBody := `{"vendorId":"` + vendorID + `","values":["","","","1000.50","","","2027-02-13","Test owner","UPI",""]}`
		contractID := stringValue(request("POST", financePath+"/contracts/new", contractBody, origin, owner, 200), "id")
		paymentPath := financePath + "/payments/" + contractID
		request("POST", paymentPath, `{"revision":1,"amount":"1000.51","date":"2027-02-01"}`, origin, owner, 422)
		firstPayment := `{"revision":1,"amount":"100.25","date":"2027-02-01","method":"UPI","notes":"Live deposit"}`
		request("POST", paymentPath, firstPayment, origin, owner, 200)
		request("POST", paymentPath, firstPayment, origin, owner, 409)
		request("POST", paymentPath, `{"revision":2,"amount":"200.50","date":"2027-02-02","notes":"Voided instalment"}`, origin, owner, 200)
		for _, contract := range readFinance().Contracts {
			if contract.ID == contractID {
				if contract.Paid != 30075 || len(contract.Payments) != 2 {
					t.Fatalf("contract did not roll up its payments: %+v", contract)
				}
				request("POST", paymentPath, `{"revision":3,"voidPayment":"`+contract.Payments[1].ID+`"}`, origin, owner, 200)
			}
		}
		for _, contract := range readFinance().Contracts {
			if contract.ID == contractID && (contract.Paid != 10025 || contract.Values[5] != "900.25" || !contract.Payments[1].Voided) {
				t.Fatalf("voided payment affected the balance or disappeared: %+v", contract)
			}
		}
		contractUpdate := `{"revision":4,` + contractBody[1:]
		request("POST", financePath+"/contracts/"+contractID, strings.Replace(contractUpdate, "1000.50", "100.24", 1), origin, owner, 422)
		request("POST", financePath+"/contracts/"+contractID, contractUpdate, origin, owner, 200)
		planningPath := path + "/planning"
		request("GET", planningPath, "", "", brotherSession, 404)
		request("POST", planningPath+"/places/new", `{"name":"Live Test Hotel","address":"123 Wedding Lane","mapUrl":"https://maps.google.com/","instructions":"South gate"}`, origin, owner, 204)
		var planning weddingPlanning
		if err := json.Unmarshal(request("GET", planningPath, "", "", owner, 200).Body.Bytes(), &planning); err != nil {
			t.Fatal(err)
		}
		if len(planning.Places) != 1 || len(planning.Functions) == 0 || planning.Functions[0].People != nil {
			t.Fatalf("unexpected initial planning data: %+v", planning)
		}
		if len(planning.Timeline) == 0 || planning.Timeline[0].Fields[1] != "08:00" || planning.Timeline[0].Fields[3] != "Haldi setup check" {
			t.Fatalf("the original workbook timeline was not brought into the run sheet: %+v", planning.Timeline)
		}
		importedActivity := planning.Timeline[0]
		importedActivity.Fields[3] = "Updated live Haldi setup check"
		timelineBody, err := json.Marshal(runSheetInput{Fields: importedActivity.Fields, OwnerID: importedActivity.OwnerID,
			FunctionID: planning.Functions[0].ID, Revision: importedActivity.Revision})
		if err != nil {
			t.Fatal(err)
		}
		request("POST", planningPath+"/timeline/"+importedActivity.ID, string(timelineBody), origin, owner, 204)
		placeID := planning.Places[0].ID
		functionPath := planningPath + "/functions/" + planning.Functions[0].ID
		functionBody := `{"name":"Live Ceremony","start":"2027-02-15T10:30","venue":"Main hall","placeId":"` + placeID +
			`","duration":60,"revision":1,"people":[{"personId":"` + brotherID +
			`","role":"Family representative","neededBy":"2027-02-15T10:15"}],"items":[{"name":"Gift tray","category":"Family exchange","quantity":"2","status":"Packed","personId":"` + brotherID + `"}]}`
		request("POST", functionPath, functionBody, origin, owner, 204)
		request("POST", functionPath, functionBody, origin, owner, 409)
		request("POST", roomsPath+"/new", `{"placeId":"`+placeID+`","values":{"1":"990"}}`, origin, owner, 201)
		passenger := pickupList()[0].Passengers[0]
		linkedPickup, err := json.Marshal(map[string]any{
			"date": "2027-02-15", "time": "09:30", "pickupPlaceId": placeID, "pickupPoint": "South gate",
			"dropPoint": "Reception", "status": "Planned",
			"passengers": []map[string]any{{"id": passenger.ID, "revision": passenger.Revision}},
		})
		if err != nil {
			t.Fatal(err)
		}
		linkedPickupID := stringValue(request("POST", path+"/transportation", string(linkedPickup), origin, owner, 201), "id")
		var placeLinked bool
		for _, pickup := range pickupList() {
			if pickup.ID == linkedPickupID {
				placeLinked = pickup.PickupPlaceID == placeID && pickup.PickupPoint == "Live Test Hotel · South gate"
			}
		}
		if !placeLinked {
			t.Fatal("pickup did not retain the saved place and the gate detail")
		}
		documentsPath := path + "/vendors/" + vendorID + "/documents"
		pdf := "%PDF-1.4\nExample catalogue"
		uploadDocuments := func(actorCookie *http.Cookie, want int) {
			t.Helper()
			var body bytes.Buffer
			writer := multipart.NewWriter(&body)
			for _, name := range []string{"menu.pdf", "quote.pdf"} {
				part, err := writer.CreateFormFile("files", name)
				if err != nil {
					t.Fatal(err)
				}
				if _, err := io.WriteString(part, pdf); err != nil {
					t.Fatal(err)
				}
			}
			if err := writer.Close(); err != nil {
				t.Fatal(err)
			}
			req := httptest.NewRequest("POST", strings.Replace(origin, "https://", "http://", 1)+documentsPath, &body).WithContext(ctx)
			req.Header.Set("Content-Type", writer.FormDataContentType())
			req.Header.Set("Origin", origin)
			req.AddCookie(actorCookie)
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, req)
			if response.Code != want {
				t.Fatalf("document upload returned %d, want %d: %s", response.Code, want, response.Body)
			}
		}
		uploadDocuments(brotherSession, 404)
		uploadDocuments(owner, 204)
		var documents []vendorDocument
		if err := json.Unmarshal(request("GET", documentsPath, "", "", owner, 200).Body.Bytes(), &documents); err != nil || len(documents) != 2 {
			t.Fatalf("missing uploaded documents: %+v %v", documents, err)
		}
		filePath := documentsPath + "/" + documents[0].ID
		request("GET", filePath, "", "", brotherSession, 404)
		download := request("GET", filePath, "", "", owner, 200)
		if download.Body.String() != pdf || !strings.HasPrefix(download.Header().Get("Content-Disposition"), "attachment;") {
			t.Fatal("vendor document download did not return the saved file as an attachment")
		}
		readGuest := func(workbookID, name string) liveGuest {
			t.Helper()
			var rows []liveGuest
			if err := json.Unmarshal(request("GET", path+"/guests", "", "", owner, 200).Body.Bytes(), &rows); err != nil {
				t.Fatal(err)
			}
			for _, guest := range rows {
				if (workbookID != "" && guest.WorkbookID == workbookID) || (name != "" && guest.Name == name) {
					return guest
				}
			}
			t.Fatal("guest is missing from the live list")
			return liveGuest{}
		}
		bulkPath := path + "/guests/bulk"
		importedGuest := readGuest("G001", "")
		newGuest := readGuest("", "Additional guest")
		if importedGuest.StayRequired != "Yes" || newGuest.StayRequired != "" {
			t.Fatal("stay requirements were not initialized for imported and manual guests")
		}
		bulk := guestBulkEdit{Field: "stayRequired", Value: "No", BlanksOnly: true, Guests: []guestBulkTarget{
			{ID: importedGuest.ID, Revision: importedGuest.Revision},
			{ID: newGuest.ID, Revision: newGuest.Revision},
		}}
		sendBulk := func(cookie *http.Cookie, status int) {
			t.Helper()
			body, err := json.Marshal(bulk)
			if err != nil {
				t.Fatal(err)
			}
			request("POST", bulkPath, string(body), origin, cookie, status)
		}
		sendBulk(brotherSession, 404)
		bulk.Guests[0].Revision--
		sendBulk(owner, 409)
		if readGuest("", "Additional guest").Revision != newGuest.Revision {
			t.Fatal("a stale selection partially updated guests")
		}
		bulk.Guests[0].Revision++
		sendBulk(owner, 200)
		if readGuest("G001", "").StayRequired != "Yes" || readGuest("", "Additional guest").StayRequired != "No" {
			t.Fatal("fill blanks only overwrote an existing value or skipped a blank")
		}
		bulk = guestBulkEdit{Field: "transportRequired", Value: "No", Guests: bulk.Guests[:1]}
		sendBulk(owner, 200)
		var linkedPickupNeedsReview bool
		for _, pickup := range pickupList() {
			if pickup.ID == changed.ID {
				linkedPickupNeedsReview = pickup.NeedsReview
			}
		}
		if !linkedPickupNeedsReview {
			t.Fatal("a bulk transport change did not flag the linked pickup")
		}
		bulk.Field, bulk.Value = "side", "Bride"
		bulk.Guests[0].Revision++
		sendBulk(owner, 200)
		if readGuest("G001", "").Side != "Bride" {
			t.Fatal("bulk wedding-side change was not saved")
		}
		snapshot := request("GET", path+"/snapshot.xlsx", "", "", owner, 200)
		request("POST", filePath, "", origin, owner, 204)
		request("GET", filePath, "", "", owner, 404)
		archive, err := zip.NewReader(bytes.NewReader(snapshot.Body.Bytes()), int64(snapshot.Body.Len()))
		if err != nil {
			t.Fatal(err)
		}
		found, foundTransport, foundRoom, foundFollowup := false, false, false, false
		foundVendor, foundContract, foundLedger := false, false, false
		foundPlace, foundItems, foundDocuments, foundTimeline := false, false, false, false
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
			foundPlace = foundPlace || strings.Contains(text, "123 Wedding Lane")
			foundItems = foundItems || strings.Contains(text, "Gift tray") && strings.Contains(text, "Live Ceremony")
			foundDocuments = foundDocuments || strings.Contains(text, "menu.pdf") && strings.Contains(text, "quote.pdf")
			foundTimeline = foundTimeline || strings.Contains(text, "Updated live Haldi setup check") && strings.Contains(text, "Linked function")
			foundVendor = foundVendor || strings.Contains(text, "Live Test Caterer") && strings.Contains(text, "1200.5")
			foundContract = foundContract || strings.Contains(text, "Live Test Caterer") && strings.Contains(text, "900.25")
			foundLedger = foundLedger || strings.Contains(text, "Live deposit") && strings.Contains(text, "Voided instalment") && strings.Contains(text, "Imported opening balance")
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
		if !foundVendor || !foundContract || !foundLedger {
			t.Fatal("downloaded workbook did not include the live vendor, contract and payment history")
		}
		if !foundPlace || !foundItems || !foundDocuments {
			t.Fatal("downloaded workbook did not include places, required items and document filenames")
		}
		if !foundTimeline {
			t.Fatal("downloaded workbook did not include the saved timeline and its linked function")
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

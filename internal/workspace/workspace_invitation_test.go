package workspace

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

func TestInvitationContentValidation(t *testing.T) {
	valid := invitationContent{
		Groom:    invitationPerson{Name: "  Aarav Sharma ", ShortName: "Aarav"},
		Symbols:  []string{"om", "swastik"},
		Shloka:   "line one\r\nline two",
		Events:   map[string]invitationEventStyle{"11111111-1111-4111-8111-111111111111": {Icon: "haldi"}, "22222222-2222-4222-8222-222222222222": {}},
		Families: []invitationFamily{{Heading: "Groom", Cards: []invitationFamilyCard{{Title: "Empty", Lines: []invitationFamilyLine{{Relation: "Cousins"}}}}}},
		Contacts: []invitationContact{{Name: "Rohan", Phone: "+91 98765 43210"}},
		RSVPBy:   "2026-12-06",
	}
	if !valid.normalize() {
		t.Fatal("expected valid content")
	}
	if valid.Palette != "rose-gold" || valid.Groom.Name != "Aarav Sharma" || valid.Shloka != "line one\nline two" {
		t.Fatalf("content was not normalized: %+v", valid)
	}
	if len(valid.Events) != 1 || len(valid.Families) != 0 {
		t.Fatalf("empty styles and families should be dropped: %+v", valid)
	}
	invalid := []func(*invitationContent){
		func(c *invitationContent) { c.Palette = "neon" },
		func(c *invitationContent) { c.Symbols = []string{"om", "om"} },
		func(c *invitationContent) { c.Symbols = []string{"om", "shri", "swastik", "kalash"} },
		func(c *invitationContent) { c.Events = map[string]invitationEventStyle{"not-a-uuid": {Icon: "haldi"}} },
		func(c *invitationContent) {
			c.Events = map[string]invitationEventStyle{"11111111-1111-4111-8111-111111111111": {Icon: "rocket"}}
		},
		func(c *invitationContent) { c.Contacts = []invitationContact{{Name: "Rohan", Phone: "call me"}} },
		func(c *invitationContent) { c.Contacts = []invitationContact{{Phone: "9876543210"}} },
		func(c *invitationContent) { c.RSVPBy = "6 December" },
		func(c *invitationContent) { c.Title = strings.Repeat("x", 41) },
		func(c *invitationContent) { c.Hosts = "bad\x00name" },
		func(c *invitationContent) { c.Intro = "two\nlines" },
	}
	for i, change := range invalid {
		content := invitationContent{}
		change(&content)
		if content.normalize() {
			t.Errorf("case %d: expected invalid content to be rejected", i)
		}
	}
	if !validMP3([]byte("ID3\x04\x00rest")) || !validMP3([]byte{0xFF, 0xFB, 0x90, 0x00, 0x00}) || validMP3([]byte("<html>")) {
		t.Fatal("MP3 detection is wrong")
	}
}

type testRequest func(method, path, body, requestOrigin string, cookie *http.Cookie, want int) *httptest.ResponseRecorder

func testInvitationHTTP(t *testing.T, request testRequest, handler http.Handler, origin, rsvpPath string, owner, brother *http.Cookie,
	sangeet, reception, householdSecret, scheduleSecret string) {
	t.Helper()
	path := rsvpPath + "/invitation"
	request("GET", path, "", "", brother, 404)
	var settings invitationSettings
	if rec := request("GET", path, "", "", owner, 200); json.Unmarshal(rec.Body.Bytes(), &settings) != nil ||
		settings.Revision != 0 || settings.Enabled || len(settings.Events) < 2 {
		t.Fatalf("unexpected first invitation settings: %s", rec.Body)
	}
	request("POST", path, `{"enabled":true,"revision":0,"content":{"palette":"neon"}}`, origin, owner, 422)
	request("POST", path, `{"enabled":true,"revision":0,"content":{}}`, "https://other.example", owner, 403)
	request("POST", path, `{"enabled":true,"revision":0,"content":{}}`, origin, brother, 404)
	content := `{"groom":{"name":"Aarav Sharma","shortName":"Aarav"},"bride":{"name":"Meera Iyer","shortName":"Meera"},` +
		`"events":{"` + sangeet + `":{"icon":"sangeet","subtitle":"Dance night","timeLabel":""},"` + reception +
		`":{"icon":"reception","subtitle":"followed by dinner","timeLabel":""}},"contacts":[{"name":"Rohan","role":"Brother","phone":"9876543210"}]}`
	save := func(enabled bool, revision, want int) *httptest.ResponseRecorder {
		return request("POST", path, `{"enabled":`+strconv.FormatBool(enabled)+`,"revision":`+strconv.Itoa(revision)+`,"content":`+content+`}`,
			origin, owner, want)
	}
	save(false, 0, 200)
	save(false, 0, 409)
	public := request("POST", "/api/guest-rsvp", `{"token":"`+householdSecret+`"}`, origin, nil, 200)
	if strings.Contains(public.Body.String(), `"invitation"`) {
		t.Fatal("a draft invitation must not reach guests")
	}
	save(true, 1, 200)

	var rsvp struct{ Invitation *publicInvitation }
	if rec := request("POST", "/api/guest-rsvp", `{"token":"`+householdSecret+`"}`, origin, nil, 200); json.Unmarshal(rec.Body.Bytes(), &rsvp) != nil ||
		rsvp.Invitation == nil || rsvp.Invitation.Content.Groom.ShortName != "Aarav" || len(rsvp.Invitation.Events) != 2 ||
		rsvp.Invitation.HasMusic || len(rsvp.Invitation.Content.Contacts) != 1 || strings.Contains(rec.Body.String(), "familyOnly") {
		t.Fatalf("household link should show the invitation with its two functions: %s", rec.Body)
	}
	var schedule struct{ Invitation *publicInvitation }
	if rec := request("POST", "/api/guest-schedule", `{"token":"`+scheduleSecret+`"}`, origin, nil, 200); json.Unmarshal(rec.Body.Bytes(), &schedule) != nil ||
		schedule.Invitation == nil || len(schedule.Invitation.Events) != 1 || schedule.Invitation.Events[0].ID != reception ||
		len(schedule.Invitation.Content.Events) != 1 || strings.Contains(rec.Body.String(), "Dance night") {
		t.Fatalf("a date-scoped schedule must show only that date's functions and their styles: %s", rec.Body)
	}

	upload := func(body []byte, contentType string, revision, want int) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest("POST", strings.Replace(origin, "https://", "http://", 1)+path+
			"/music?revision="+strconv.Itoa(revision), bytes.NewReader(body))
		req.Header.Set("Content-Type", contentType)
		req.Header.Set("Origin", origin)
		req.Header.Set("X-File-Name", "shehnai.mp3")
		req.AddCookie(owner)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != want {
			t.Fatalf("music upload returned %d, want %d: %s", rec.Code, want, rec.Body)
		}
		return rec
	}
	music := append([]byte("ID3\x04\x00\x00"), bytes.Repeat([]byte{1}, 2048)...)
	upload([]byte("<html>not music</html>"), "audio/mpeg", 2, 422)
	upload(music, "audio/mpeg", 1, 409)
	upload(music, "audio/mpeg", 2, 200)
	if rec := request("GET", path, "", "", owner, 200); json.Unmarshal(rec.Body.Bytes(), &settings) != nil ||
		!settings.HasMusic || settings.MusicName != "shehnai.mp3" || settings.Revision != 3 || settings.Content.Groom.Name != "Aarav Sharma" {
		t.Fatalf("music should be saved without touching the content: %s", rec.Body)
	}
	for _, secret := range []string{householdSecret, scheduleSecret} {
		rec := request("POST", "/api/guest-invitation-music", `{"token":"`+secret+`"}`, origin, nil, 200)
		if !bytes.Equal(rec.Body.Bytes(), music) || rec.Header().Get("Content-Type") != "audio/mpeg" {
			t.Fatal("guests should receive the saved music")
		}
	}
	request("POST", "/api/guest-invitation-music", `{"token":"`+householdSecret+`"}`, "https://other.example", nil, 403)
	request("POST", "/api/guest-invitation-music", `{"token":"`+newRSVPToken()+`"}`, origin, nil, 404)
	if rec := request("GET", path+"/music", "", "", owner, 200); !bytes.Equal(rec.Body.Bytes(), music) {
		t.Fatal("organizers should be able to preview the music")
	}
	request("GET", path+"/music", "", "", brother, 404)
	upload(nil, "", 3, 200)
	request("POST", "/api/guest-invitation-music", `{"token":"`+householdSecret+`"}`, origin, nil, 404)

	save(false, 4, 200)
	request("POST", "/api/guest-invitation-music", `{"token":"`+householdSecret+`"}`, origin, nil, 404)
	if rec := request("POST", "/api/guest-schedule", `{"token":"`+scheduleSecret+`"}`, origin, nil, 200); strings.Contains(rec.Body.String(), `"invitation"`) {
		t.Fatal("turning the invitation off should restore the simple page")
	}
}

package workspace

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"testing/fstest"
)

func TestInvitationContentValidation(t *testing.T) {
	valid := invitationContent{
		Groom:    invitationPerson{Name: "  Aarav Sharma ", ShortName: "Aarav"},
		Symbols:  []string{"om", "swastik"},
		Shloka:   "line one\r\nline two",
		Events:   map[string]invitationEventStyle{"11111111-1111-4111-8111-111111111111": {Icon: "haldi"}, "22222222-2222-4222-8222-222222222222": {}},
		Families: []invitationFamily{{Heading: "Groom", Cards: []invitationFamilyCard{{Title: "Empty", Lines: []invitationFamilyLine{{Relation: "Cousins"}}}}}},
		Contacts: []invitationContact{{Name: "Rohan", Phone: "+91 00000 00011"}},
		RSVPBy:   "2026-12-06",
	}
	if !valid.normalize() {
		t.Fatal("expected valid content")
	}
	if valid.Groom.Name != "Aarav Sharma" || valid.Shloka != "line one\nline two" {
		t.Fatalf("content was not normalized: %+v", valid)
	}
	if len(valid.Events) != 1 || len(valid.Families) != 0 {
		t.Fatalf("empty styles and families should be dropped: %+v", valid)
	}
	invalid := []func(*invitationContent){
		func(c *invitationContent) { c.Symbols = []string{"om", "om"} },
		func(c *invitationContent) { c.Symbols = []string{"om", "shri", "swastik", "kalash"} },
		func(c *invitationContent) { c.Events = map[string]invitationEventStyle{"not-a-uuid": {Icon: "haldi"}} },
		func(c *invitationContent) {
			c.Events = map[string]invitationEventStyle{"11111111-1111-4111-8111-111111111111": {Icon: "rocket"}}
		},
		func(c *invitationContent) { c.Contacts = []invitationContact{{Name: "Rohan", Phone: "call me"}} },
		func(c *invitationContent) { c.Contacts = []invitationContact{{Phone: "0000000011"}} },
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

func TestInvitationTemplates(t *testing.T) {
	template, ok := invitationTemplates[defaultInvitationTemplate]
	if !ok || len(template.Sections) == 0 {
		t.Fatal("the default template must load from the shared manifest")
	}
	mismatched := fstest.MapFS{"src/invitation/templates/other-name/manifest.json": {Data: []byte(`{"id":"blush-envelope"}`)}}
	if _, err := readTemplates(mismatched); err == nil {
		t.Fatal("a manifest whose id doesn't match its folder must be rejected")
	}
	options, ok := template.normalize(map[string]any{"palette": "royal"}, true)
	if !ok || options["palette"] != "royal" || options["flightPath"] != true || options["envelopeHint"] != "" {
		t.Fatalf("missing options should take their defaults: %v", options)
	}
	for _, bad := range []map[string]any{{"palette": "neon"}, {"lanterns": "yes"}, {"unknown": true},
		{"envelopeHint": strings.Repeat("x", 101)}} {
		if _, ok := template.normalize(bad, true); ok {
			t.Errorf("expected %v to be rejected", bad)
		}
	}
	if options, _ := template.normalize(map[string]any{"palette": "neon", "old": 1}, false); options["palette"] != "rose-gold" {
		t.Fatal("stored values that no longer fit should fall back to defaults")
	}
	if design := storedDesign("retired-design", 7, []byte(`{"palette":"royal"}`)); design.ID != defaultInvitationTemplate ||
		design.Version != template.Version || design.Options["palette"] != "royal" {
		t.Fatalf("a removed template should fall back to the default: %+v", design)
	}
	for name, manifest := range map[string]string{
		"unknown section":        `[{"id":"blush-envelope","version":1,"name":"A","sections":["hero","gallery"],"options":[]}]`,
		"bad default":            `[{"id":"blush-envelope","version":1,"name":"A","sections":["hero"],"options":[{"key":"k","label":"K","type":"boolean","default":"no"}]}]`,
		"no default":             `[{"id":"other","version":1,"name":"A","sections":["hero"],"options":[]}]`,
		"no tags":                `[{"id":"blush-envelope","version":1,"name":"A","sections":["hero"],"options":[]}]`,
		"unknown mood":           `[{"id":"blush-envelope","version":1,"name":"A","tags":{"mood":["spooky"],"region":["north"],"time":"day"},"sections":["hero"],"options":[]}]`,
		"palette without swatch": `[{"id":"blush-envelope","version":1,"name":"A","tags":{"mood":["royal"],"region":["north"],"time":"day"},"sections":["hero"],"options":[{"key":"palette","label":"P","type":"choice","default":"a","choices":[{"value":"a","label":"A"}]}]}]`,
		"bad swatch colour":      `[{"id":"blush-envelope","version":1,"name":"A","tags":{"mood":["royal"],"region":["north"],"time":"day"},"sections":["hero"],"options":[{"key":"palette","label":"P","type":"choice","default":"a","choices":[{"value":"a","label":"A","swatch":["#fff","#000000","#111111"]}]}]}]`,
		"text no max":            `[{"id":"blush-envelope","version":1,"name":"A","sections":["hero"],"options":[{"key":"k","label":"K","type":"text","default":""}]}]`,
	} {
		var list []invitationTemplate
		if err := json.Unmarshal([]byte(manifest), &list); err != nil {
			t.Fatal(err)
		}
		if _, err := checkTemplates(list); err == nil {
			t.Errorf("%s: expected the manifest to be rejected", name)
		}
	}
}

type testRequest func(method, path, body, requestOrigin string, cookie *http.Cookie, want int) *httptest.ResponseRecorder

func testInvitationHTTP(t *testing.T, request testRequest, handler http.Handler, origin, rsvpPath string, owner, brother *http.Cookie,
	sangeet, reception, householdSecret, scheduleSecret string) {
	t.Helper()
	path := rsvpPath + "/invitation"
	request("GET", path, "", "", brother, 404)
	var settings invitationSettings
	readSettings := func() invitationSettings {
		t.Helper()
		var result invitationSettings
		if rec := request("GET", path, "", "", owner, 200); json.Unmarshal(rec.Body.Bytes(), &result) != nil {
			t.Fatalf("invalid settings: %s", rec.Body)
		}
		return result
	}
	if settings = readSettings(); settings.Revision != 0 || settings.Live || settings.EverPublished || len(settings.Events) < 2 ||
		settings.Template.ID != "blush-envelope" {
		t.Fatalf("unexpected first invitation settings: %+v", settings)
	}
	design := func(palette string) string {
		return `"template":{"id":"blush-envelope","options":{"palette":"` + palette + `","lanterns":false}}`
	}
	request("POST", path, `{"revision":0,"content":{},"template":{"id":"blush-envelope","options":{"palette":"neon"}}}`, origin, owner, 422)
	request("POST", path, `{"revision":0,"content":{},"template":{"id":"no-such-design","options":{}}}`, origin, owner, 422)
	request("POST", path, `{"revision":0,"content":{},`+design("royal")+`}`, "https://other.example", owner, 403)
	request("POST", path, `{"revision":0,"content":{},`+design("royal")+`}`, origin, brother, 404)
	content := func(shortName string) string {
		return `{"groom":{"name":"Aarav Sharma","shortName":"` + shortName + `"},"bride":{"name":"Meera Iyer","shortName":"Meera"},` +
			`"events":{"` + sangeet + `":{"icon":"sangeet","subtitle":"Dance night","timeLabel":""},"` + reception +
			`":{"icon":"reception","subtitle":"followed by dinner","timeLabel":""}},"contacts":[{"name":"Rohan","role":"Brother","phone":"0000000011"}]}`
	}
	save := func(shortName, palette string, revision, want int) {
		t.Helper()
		request("POST", path, `{"revision":`+strconv.Itoa(revision)+`,"content":`+content(shortName)+`,`+design(palette)+`}`, origin, owner, want)
	}
	publish := func(action string, revision, want int) {
		t.Helper()
		request("POST", path+"/publish", `{"action":"`+action+`","revision":`+strconv.Itoa(revision)+`}`, origin, owner, want)
	}
	guest := func() *publicInvitation {
		t.Helper()
		var rsvp struct{ Invitation *publicInvitation }
		rec := request("POST", "/api/guest-rsvp", `{"token":"`+householdSecret+`"}`, origin, nil, 200)
		if json.Unmarshal(rec.Body.Bytes(), &rsvp) != nil {
			t.Fatalf("invalid guest response: %s", rec.Body)
		}
		return rsvp.Invitation
	}

	save("Aarav", "royal", 0, 200)
	save("Aarav", "royal", 0, 409)
	if guest() != nil {
		t.Fatal("a saved draft must not reach guests before it is published")
	}
	publish("discard", 1, 409)
	publish("launch", 1, 422)
	request("POST", path+"/publish", `{"action":"publish","revision":1}`, origin, brother, 404)
	publish("publish", 1, 200)
	if invitation := guest(); invitation == nil || invitation.Content.Groom.ShortName != "Aarav" || len(invitation.Events) != 2 ||
		invitation.HasMusic || len(invitation.Content.Contacts) != 1 || invitation.Template.ID != "blush-envelope" ||
		invitation.Template.Options["palette"] != "royal" || invitation.Template.Options["lanterns"] != false ||
		invitation.Template.Options["flightPath"] != true {
		t.Fatalf("household link should show the published invitation with its two functions: %+v", invitation)
	}
	if rec := request("POST", "/api/guest-rsvp", `{"token":"`+householdSecret+`"}`, origin, nil, 200); strings.Contains(rec.Body.String(), "familyOnly") {
		t.Fatal("guests never need the organizer's family-only flag")
	}
	var schedule struct{ Invitation *publicInvitation }
	if rec := request("POST", "/api/guest-schedule", `{"token":"`+scheduleSecret+`"}`, origin, nil, 200); json.Unmarshal(rec.Body.Bytes(), &schedule) != nil ||
		schedule.Invitation == nil || len(schedule.Invitation.Events) != 1 || schedule.Invitation.Events[0].ID != reception ||
		len(schedule.Invitation.Content.Events) != 1 || strings.Contains(rec.Body.String(), "Dance night") {
		t.Fatalf("a date-scoped schedule must show only that date's functions and their styles: %s", rec.Body)
	}
	if settings = readSettings(); !settings.Live || !settings.EverPublished || settings.PublishedAt == nil || settings.UnpublishedChanges {
		t.Fatalf("just published, with no further edits: %+v", settings)
	}

	// Edits after publishing stay in the draft until published again.
	save("Arjun", "rose-gold", 2, 200)
	if invitation := guest(); invitation.Content.Groom.ShortName != "Aarav" || invitation.Template.Options["palette"] != "royal" {
		t.Fatal("guests must keep seeing the published version while the draft changes")
	}
	if settings = readSettings(); !settings.UnpublishedChanges || settings.Content.Groom.ShortName != "Arjun" {
		t.Fatalf("the organizer should see the draft and its unpublished changes: %+v", settings)
	}
	publish("discard", 3, 200)
	if settings = readSettings(); settings.UnpublishedChanges || settings.Content.Groom.ShortName != "Aarav" ||
		settings.Template.Options["palette"] != "royal" {
		t.Fatalf("discarding should restore the published version: %+v", settings)
	}
	save("Arjun", "rose-gold", 4, 200)
	publish("publish", 5, 200)
	if invitation := guest(); invitation.Content.Groom.ShortName != "Arjun" || invitation.Template.Options["palette"] != "rose-gold" {
		t.Fatal("publishing again should show the new version")
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
	upload([]byte("<html>not music</html>"), "audio/mpeg", 6, 422)
	upload(music, "audio/mpeg", 1, 409)
	upload(music, "audio/mpeg", 6, 200)
	if settings = readSettings(); !settings.HasMusic || settings.MusicName != "shehnai.mp3" || settings.Revision != 7 ||
		settings.Content.Groom.Name != "Aarav Sharma" {
		t.Fatalf("music should be saved without touching the content: %+v", settings)
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

	publish("unpublish", 6, 409)
	publish("unpublish", 7, 200)
	request("POST", "/api/guest-invitation-music", `{"token":"`+householdSecret+`"}`, origin, nil, 404)
	if rec := request("POST", "/api/guest-schedule", `{"token":"`+scheduleSecret+`"}`, origin, nil, 200); strings.Contains(rec.Body.String(), `"invitation"`) {
		t.Fatal("stopping the invitation should restore the simple page")
	}
	if settings = readSettings(); settings.Live || !settings.EverPublished || settings.Content.Groom.ShortName != "Arjun" {
		t.Fatalf("stopping keeps the draft and the published snapshot: %+v", settings)
	}
	upload(nil, "", 8, 200)
}

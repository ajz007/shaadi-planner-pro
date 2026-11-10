package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDemoGuestImportAndRSVP(t *testing.T) {
	handler := newDemo().routes(http.Dir("web/dist"), true)
	request := func(method, path string, data any, status int) *httptest.ResponseRecorder {
		t.Helper()
		payload, err := json.Marshal(data)
		if err != nil {
			t.Fatal(err)
		}
		recorder := httptest.NewRecorder()
		req := httptest.NewRequest(method, path, bytes.NewReader(payload))
		req.Header.Set("Content-Type", "application/json")
		handler.ServeHTTP(recorder, req)
		if recorder.Code != status {
			t.Fatalf("%s %s returned %d, want %d: %s", method, path, recorder.Code, status, recorder.Body)
		}
		return recorder
	}
	readWedding := func() []group {
		t.Helper()
		var wedding struct{ Groups []group }
		body := request("GET", "/api/wedding", nil, 200).Body.Bytes()
		if err := json.Unmarshal(body, &wedding); err != nil {
			t.Fatal(err)
		}
		return wedding.Groups
	}

	request("POST", "/api/import", map[string]any{"csv": sampleCSV, "confirm": false}, 200)
	if groups := readWedding(); len(groups) != 0 {
		t.Fatal("preview saved guest records")
	}
	importRequest := map[string]any{"csv": sampleCSV, "confirm": true}
	request("POST", "/api/import", importRequest, 200)
	retry := request("POST", "/api/import", importRequest, 200)
	if !strings.Contains(retry.Body.String(), `"newGuests":0`) {
		t.Fatalf("repeat import was not idempotent: %s", retry.Body)
	}
	groups := readWedding()
	if len(groups) != 2 {
		t.Fatalf("got %d households, want 2", len(groups))
	}

	shahURL := "/api/rsvp/" + groups[1].Token
	body := request("GET", shahURL, nil, 200).Body.String()
	if strings.Contains(body, "Patel") || strings.Contains(body, groups[1].Token) {
		t.Fatal("RSVP read exposed another household or the token")
	}
	change := map[string]any{"guestId": "G003", "function": "Sangeet", "status": "accepted", "revision": 0}
	request("PUT", shahURL, change, 404)
	change["guestId"] = "G002"
	request("PUT", shahURL, change, 404)
	change["guestId"] = "G001"
	request("PUT", shahURL, change, 200)
	change["status"] = "declined"
	request("PUT", "/api/responses", change, 409)
	export := request("GET", "/api/headcounts.csv", nil, 200).Body.String()
	if !strings.Contains(export, "Sangeet,2,1,0,1") || !strings.Contains(export, "Reception,4,0,0,4") {
		t.Fatalf("unexpected headcount export: %q", export)
	}
}

func TestHostedPlanner(t *testing.T) {
	const origin = "https://planner.example.com"
	for _, invalid := range []string{"", "http://planner.example.com", origin + "/", origin + "?x=1", "https://user@planner.example.com"} {
		if _, _, err := serverSettings("8080", invalid); err == nil {
			t.Errorf("accepted invalid public origin %q", invalid)
		}
	}
	address, public, err := serverSettings("8081", origin)
	if err != nil || address != ":8081" || public != origin {
		t.Fatalf("wrong hosted settings: %q %q %v", address, public, err)
	}
	mux := newDemo().routes(http.Dir("web/dist"), false)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	handler := hostedOnly(origin, mux)
	for _, test := range []struct {
		method, host, path, source string
		want                       int
	}{
		{"GET", "healthcheck.railway.app", "/healthz", "", 200},
		{"GET", "healthcheck.railway.app", "/api/wedding", "", 403},
		{"GET", "planner.example.com", "/healthz", origin, 200},
		{"GET", "other.example.com", "/healthz", "", 403},
		{"GET", "planner.example.com", "/healthz", "https://other.example.com", 403},
		{"GET", "planner.example.com", "/api/wedding", "", 404},
		{"POST", "planner.example.com", "/api/import", origin, 405},
	} {
		req := httptest.NewRequest(test.method, "http://"+test.host+test.path, nil)
		req.Header.Set("Origin", test.source)
		req.Header.Set("X-Forwarded-Host", "planner.example.com")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, req)
		if response.Code != test.want {
			t.Errorf("%s %s%s returned %d, want %d", test.method, test.host, test.path, response.Code, test.want)
		}
	}
}

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
	handler := newDemo().routes(http.Dir("web/dist"))
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

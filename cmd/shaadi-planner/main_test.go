package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ajz007/shaadi-planner-pro/internal/httpx"
)

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
	mux := routes(http.Dir("web/dist"), false)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	handler := httpx.HostedOnly(origin, mux)
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

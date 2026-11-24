package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/ajz007/shaadi-planner-pro/internal/httpx"
)

func TestStorefrontAnalytics(t *testing.T) {
	for _, id := range []string{"", "555057816", "G-INVALID/ID"} {
		response := httptest.NewRecorder()
		storefrontAnalytics(id)(response, httptest.NewRequest("GET", "/api/storefront-analytics", nil))
		if response.Code != http.StatusNoContent || response.Body.Len() != 0 {
			t.Errorf("invalid GA4 ID %q produced status %d and body %q", id, response.Code, response.Body.String())
		}
	}
	response := httptest.NewRecorder()
	storefrontAnalytics(" G-TEST123 ")(response, httptest.NewRequest("GET", "/api/storefront-analytics", nil))
	var config map[string]string
	err := json.Unmarshal(response.Body.Bytes(), &config)
	if err != nil || response.Code != http.StatusOK || config["measurementID"] != "G-TEST123" {
		t.Errorf("GA4 configuration response %d %s: %v", response.Code, response.Body.String(), err)
	}
}

func TestPaidKitCannotBeServedAsStaticFile(t *testing.T) {
	assets := fstest.MapFS{
		"index.html":                     {Data: []byte("storefront")},
		"Shaadi-Planner-Pro-English.zip": {Data: []byte("private")},
		"downloads/Shaadi_Planner_Pro_V1_3_1_English_Launch_Package.zip": {Data: []byte("private")},
		"Shaadi-Planner-Pro-English-Blank.xlsx":                          {Data: []byte("private")},
		"sample.csv":                                                     {Data: []byte("public")},
		"Shaadi_WhatsApp_Vendor_Message_Pack.pdf":                        {Data: []byte("private")},
		"downloads/Shaadi_Planner_Pro_All_in_One_English_v1.0.zip":       {Data: []byte("private")},
	}
	mux := routes(http.FS(assets), false)
	for path, want := range map[string]int{
		"/Shaadi-Planner-Pro-English.zip":                                 404,
		"/downloads/Shaadi_Planner_Pro_V1_3_1_English_Launch_Package.zip": 404,
		"/Shaadi-Planner-Pro-English-Blank.xlsx":                          404,
		"/sample.csv":                                                     200, "/excel-kit": 301, "/excel-kit/purchase": 200,
		"/Shaadi_WhatsApp_Vendor_Message_Pack.pdf":                  404,
		"/downloads/Shaadi_Planner_Pro_All_in_One_English_v1.0.zip": 404,
		"/shop": 200, "/shop/purchase": 200, "/shop/wedding-pass": 200, "/shop/all-in-one": 200, "/shop/unknown": 404,
	} {
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != want {
			t.Errorf("%s returned %d, want %d", path, w.Code, want)
		}
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

package commerce

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestShopExposesBrowserPixelInTestMode(t *testing.T) {
	t.Setenv("META_PIXEL_ID", "2154551848819332")
	t.Setenv("META_CAPI_ACCESS_TOKEN", "example-token")

	shop := &Shop{mode: "test", meta: configuredMeta("test")}
	if shop.meta != nil {
		t.Fatal("server purchase tracking must stay disabled in test mode")
	}

	mux := http.NewServeMux()
	shop.Register(mux)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/excel/shop", nil))
	var result struct {
		PixelID string `json:"metaPixelID"`
		Test    bool   `json:"test"`
	}
	if w.Code != http.StatusOK {
		t.Fatalf("shop response status = %d", w.Code)
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if !result.Test || result.PixelID != "2154551848819332" {
		t.Fatalf("expected browser pixel in test mode, got %+v", result)
	}
}

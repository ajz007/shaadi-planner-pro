package commerce

import (
	"context"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
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

type metaTransport func(*http.Request) (*http.Response, error)

func (f metaTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestCheckoutEventLifecycle(t *testing.T) {
	dsn := os.Getenv("SHAADI_FUNNEL_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("requires a disposable shaadi_funnel_test database")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	var name string
	if err = db.QueryRow("SELECT current_database()").Scan(&name); err != nil || name != "shaadi_funnel_test" {
		t.Fatal("use disposable shaadi_funnel_test database", err)
	}
	if err = migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`TRUNCATE excel_orders CASCADE;
	INSERT INTO excel_orders (razorpay_order_id,mode,buyer_email,product,amount_paise,currency,meta_attribution) VALUES
	('order_Pass','live','fixture@example.com','wedding-pass',299900,'INR','{"entry":"post_purchase"}'),
	('order_Download','live','fixture@example.com','complete-en-v1',99900,'INR',NULL)`)
	if err != nil {
		t.Fatal(err)
	}
	var events []string
	client := &http.Client{Transport: metaTransport(func(r *http.Request) (*http.Response, error) {
		var body struct {
			Data []struct {
				Name   string `json:"event_name"`
				ID     string `json:"event_id"`
				Custom struct {
					Value    int
					Currency string
				} `json:"custom_data"`
			}
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.Data) != 1 {
			t.Fatalf("invalid Meta event: %v", err)
		}
		ev := body.Data[0]
		if ev.Custom.Value != 2999 || ev.Custom.Currency != "INR" {
			t.Fatal(ev)
		}
		events = append(events, ev.Name+"/"+ev.ID)
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"events_received":1}`))}, nil
	})}
	shop := &Shop{db: db, mode: "live", meta: &metaEvents{"12345", "fixture", client}, linkSecret: "fixture", webhookSecret: "fixture"}
	mux := http.NewServeMux()
	shop.Register(mux)
	for _, event := range []string{"checkout_opened", "checkout_dismissed", "checkout_dismissed"} {
		body, _ := json.Marshal(map[string]string{"code": shop.accessCode("order_Pass"), "event": event, "attempt": "00000000-0000-4000-8000-000000000001"})
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest("POST", "/api/excel/checkout-event", strings.NewReader(string(body))))
		if w.Code != 204 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	failure := `{"event":"payment.failed","payload":{"payment":{"entity":{"order_id":"order_Pass","id":"pay_Failed"}}}}`
	for range 2 {
		r := httptest.NewRequest("POST", "/api/excel/webhook", strings.NewReader(failure))
		r.Header.Set("X-Razorpay-Signature", hex.EncodeToString(digest(shop.webhookSecret, failure)))
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		if w.Code != 204 {
			t.Fatal(w.Code)
		}
	}
	var count int
	if err := db.QueryRow("SELECT count(*) FROM excel_checkout_events").Scan(&count); err != nil || count != 3 {
		t.Fatal(count, err)
	}
	for _, event := range []string{"InitiateCheckout", "InitiateCheckout", "Purchase"} {
		if _, err := shop.sendMetaOrderEvent(ctx, event); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec("UPDATE excel_orders SET razorpay_payment_id='pay_' || razorpay_order_id,paid_at=now()"); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if _, err := shop.sendMetaOrderEvent(ctx, "Purchase"); err != nil {
			t.Fatal(err)
		}
	}
	if strings.Join(events, ",") != "InitiateCheckout/spp-start-order_Pass,Purchase/spp-order_Pass" {
		t.Fatal(events)
	}
}

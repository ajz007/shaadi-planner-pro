package commerce

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func TestCheckoutLandingsAndLiveAnalytics(t *testing.T) {
	connection := os.Getenv("SHAADI_TEST_DATABASE_URL")
	if connection == "" {
		t.Skip("set SHAADI_TEST_DATABASE_URL to a dedicated test database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	db, err := sql.Open("pgx", connection)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	suffix := fmt.Sprint(time.Now().UnixNano())
	item := "analytics-test-" + suffix
	defer db.Exec("DELETE FROM excel_orders WHERE product = $1", item)
	live, test, paid := "order_Live"+suffix, "order_Test"+suffix, "order_Paid"+suffix
	if _, err := db.ExecContext(ctx, `INSERT INTO excel_orders
		(razorpay_order_id, mode, buyer_email, product, amount_paise, currency, created_at, paid_at, razorpay_payment_id)
		VALUES ($1,'live','test@example.test',$4,99900,'INR',now(),NULL,NULL),
		($2,'test','test@example.test',$4,99900,'INR',now(),now(),'pay_' || $2),
		($3,'live','test@example.test',$4,149900,'INR',now(),now(),'pay_' || $3)`,
		live, test, paid, item); err != nil {
		t.Fatal(err)
	}
	client := &http.Client{Transport: metaTransport(func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"items":[]}`))}, nil
	})}
	shop := &Shop{db: db, mode: "live", linkSecret: "fixture", gateway: gateway{"https://example.test", "fixture", "fixture", client}}
	status := func(code string, landing bool, want int) {
		t.Helper()
		body, _ := json.Marshal(map[string]any{"code": code, "checkoutLanding": landing})
		request := httptest.NewRequest(http.MethodPost, "/api/excel/status", strings.NewReader(string(body))).WithContext(ctx)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		shop.status(response, request)
		if response.Code != want {
			t.Fatalf("status returned %d, want %d: %s", response.Code, want, response.Body.String())
		}
	}
	landedAt := func() sql.NullTime {
		t.Helper()
		var at sql.NullTime
		if err := db.QueryRowContext(ctx, "SELECT checkout_landed_at FROM excel_orders WHERE razorpay_order_id=$1", live).Scan(&at); err != nil {
			t.Fatal(err)
		}
		return at
	}
	status(live+".invalid", true, 404)
	status(shop.accessCode(live), false, 200)
	if landedAt().Valid {
		t.Fatal("a status check counted as a landing")
	}
	status(shop.accessCode(live), true, 200)
	first := landedAt()
	status(shop.accessCode(live), true, 200)
	if !first.Valid || !landedAt().Time.Equal(first.Time) {
		t.Fatal("the first checkout landing was missing or overwritten")
	}
	status(shop.accessCode(paid), true, 200)
	rows, err := shop.Analytics(ctx, time.Now().Add(-time.Hour), time.Now().Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	var total AnalyticsCounts
	for _, row := range rows {
		if row.Product == item {
			total.Add(row.AnalyticsCounts)
		}
	}
	if total != (AnalyticsCounts{Orders: 2, Landings: 1, Purchases: 1, GrossPaise: 149900}) {
		t.Fatalf("unexpected live totals: %+v", total)
	}
}

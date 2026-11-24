package commerce

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"
)

func TestConfiguredFirstWeddingPrice(t *testing.T) {
	for raw, want := range map[string]int{"": 0, "0": 299900, "50": 149950, "100": 0} {
		percent, err := firstWeddingDiscount(raw, true)
		if err != nil || weddingPrice(percent).Amount != want {
			t.Errorf("setting %q: percent=%d, error=%v", raw, percent, err)
		}
	}
	for _, raw := range []string{"-1", "101", "half"} {
		if _, err := firstWeddingDiscount(raw, true); err == nil {
			t.Errorf("accepted %q", raw)
		}
	}
}

func TestFamilyPassPaymentRecoveryAndRefund(t *testing.T) {
	connection := os.Getenv("SHAADI_FAMILY_UPGRADE_DATABASE_URL")
	if connection == "" {
		t.Skip("requires the disposable Family Pass upgrade database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	db, err := sql.Open("pgx", connection)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var database string
	if err := db.QueryRowContext(ctx, "SELECT current_database()").Scan(&database); err != nil || database != "shaadi_family_upgrade" {
		t.Fatalf("use the disposable shaadi_family_upgrade database: %v", err)
	}
	if err := migrate(ctx, db); err != nil {
		t.Fatal(err)
	}

	t.Run("free offer", func(t *testing.T) {
		var account, joined string
		if err := db.QueryRowContext(ctx, "INSERT INTO workspace_accounts(identity_subject,display_name) VALUES ('offer-fixture','Family') RETURNING id").Scan(&account); err != nil {
			t.Fatal(err)
		}
		if err := db.QueryRowContext(ctx, "INSERT INTO weddings(name,wedding_date,time_zone) VALUES ('Joined wedding',current_date+1,'Asia/Kolkata') RETURNING id").Scan(&joined); err != nil {
			t.Fatal(err)
		}
		if _, err := db.ExecContext(ctx, `WITH person AS (INSERT INTO wedding_people(wedding_id,name) VALUES ($1,'Guest') RETURNING id)
   INSERT INTO wedding_memberships(wedding_id,account_id,person_id,role) SELECT $1,$2,id,'family' FROM person`, joined, account); err != nil {
			t.Fatal(err)
		}
		shop := &Shop{db: db, mode: "test", firstWeddingDiscount: 100}
		claim := func() int {
			r := httptest.NewRequest("POST", "/api/workspace/family-pass", strings.NewReader(`{"claimFree":true,"expectedAmount":0}`)).WithContext(ctx)
			r.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			shop.CreateFamilyPassOrder(w, r, account)
			return w.Code
		}
		results := make(chan int, 2)
		for range 2 {
			go func() { results <- claim() }()
		}
		for range 2 {
			if code := <-results; code != 200 && code != 201 {
				t.Fatalf("claim returned %d", code)
			}
		}
		var n int
		if err := db.QueryRowContext(ctx, "SELECT count(*) FROM family_passes WHERE account_id=$1", account).Scan(&n); err != nil || n != 1 {
			t.Fatalf("expected one grant, got %d: %v", n, err)
		}
		if _, err := db.ExecContext(ctx, "UPDATE family_passes SET consumed_at=now() WHERE account_id=$1", account); err != nil {
			t.Fatal(err)
		}
		status, err := shop.familyPassStatus(ctx, db, account)
		if err != nil || status.Available || status.Quote.Amount != catalog[familyPassID].Amount || claim() != 409 {
			t.Fatalf("second wedding price: %+v, %v", status, err)
		}
	})
	for _, fixture := range []struct {
		suffix    string
		activated bool
		bundle    string
	}{
		{"Unused", false, allInOneID},
		{"Discounted", true, allInOneID},
		{"Activated", true, allInOneID},
		{"Complete", false, completeID},
		{"Essentials", false, essentialsID},
		{"Legacy", false, ""},
	} {
		t.Run(fixture.suffix, func(t *testing.T) {
			activated := fixture.activated
			order := "order_Family" + fixture.suffix
			payID := "pay_Family" + fixture.suffix
			amount := catalog[familyPassID].Amount
			percent := 0
			if fixture.suffix == "Discounted" {
				percent = 50
				amount = 149950
			}
			var account string
			if err := db.QueryRowContext(ctx, "INSERT INTO workspace_accounts (identity_subject, display_name) VALUES ($1, 'Checkout fixture') RETURNING id", order).Scan(&account); err != nil {
				t.Fatal(err)
			}

			// Only the fixture controls the fake gateway's payment state.
			var current atomic.Pointer[payment]
			var orders atomic.Int32
			var receipt atomic.Pointer[string]
			gatewayServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch {
				case r.Method == http.MethodPost && r.URL.Path == "/v2/email/outbound-emails":
					var email struct {
						Content struct {
							Simple struct {
								Body struct{ Text struct{ Data string } }
							}
						}
					}
					if err := json.NewDecoder(r.Body).Decode(&email); err != nil {
						http.Error(w, "invalid email", 400)
						return
					}
					receipt.Store(&email.Content.Simple.Body.Text.Data)
					_ = json.NewEncoder(w).Encode(map[string]string{"MessageId": "fixture"})
				case r.Method == http.MethodPost && r.URL.Path == "/orders":
					orders.Add(1)
					var input struct {
						Receipt string
						Amount  int
					}
					if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
						http.Error(w, "invalid order", 400)
						return
					}
					if input.Amount != amount {
						http.Error(w, "incorrect gateway price", http.StatusBadRequest)
						return
					}
					_ = json.NewEncoder(w).Encode(map[string]any{"id": order, "amount": amount, "currency": currency, "receipt": input.Receipt})
				case r.URL.Path == "/orders/"+order+"/payments":
					items := []payment{}
					if p := current.Load(); p != nil {
						items = append(items, *p)
					}
					_ = json.NewEncoder(w).Encode(map[string]any{"items": items})
				case r.URL.Path == "/payments/"+payID && current.Load() != nil:
					_ = json.NewEncoder(w).Encode(current.Load())
				default:
					http.NotFound(w, r)
				}
			}))
			defer gatewayServer.Close()

			zipBytes := "fixture ZIP " + fixture.bundle
			shop := &Shop{db: db, mode: "test", origin: "https://example.test", firstWeddingDiscount: percent, acceptFamilyPass: true, linkSecret: rand.Text(), webhookSecret: rand.Text(),
				gateway: gateway{url: gatewayServer.URL, client: gatewayServer.Client()}, packages: make(map[string][]byte)}
			shop.mailer = receiptMailer{from: "receipts@example.test", client: sesv2.NewFromConfig(aws.Config{
				Region: "ap-south-1", Credentials: aws.AnonymousCredentials{}, HTTPClient: gatewayServer.Client(),
			}, func(o *sesv2.Options) { o.BaseEndpoint = aws.String(gatewayServer.URL) })}
			expectedOrders := int32(1)
			if fixture.bundle != allInOneID {
				expectedOrders = 0
				var bundle *string
				if fixture.bundle == completeID {
					bundle = &fixture.bundle
				}
				if _, err := db.ExecContext(ctx, `INSERT INTO excel_orders
					(razorpay_order_id, mode, buyer_email, product, amount_paise, currency, workspace_account_id, includes_essentials, bundle_product)
					VALUES ($1, 'test', 'checkout@example.test', $2, $3, $4, $5, $6, $7)`,
					order, familyPassID, amount, currency, account, fixture.bundle == essentialsID, bundle); err != nil {
					t.Fatal(err)
				}
			}
			shop.packages[allInOneID] = []byte("fixture ZIP " + allInOneID)
			shop.packages[completeID] = []byte("fixture ZIP " + completeID)
			shop.packages[essentialsID] = []byte("fixture ZIP " + essentialsID)
			checkout := func() string {
				t.Helper()
				req := httptest.NewRequest(http.MethodPost, "/api/workspace/family-pass", strings.NewReader(`{"email":"checkout@example.test"}`)).WithContext(ctx)
				req.Header.Set("Content-Type", "application/json")
				w := httptest.NewRecorder()
				shop.CreateFamilyPassOrder(w, req, account)
				var result familyPassStatus
				if w.Code != http.StatusCreated || json.Unmarshal(w.Body.Bytes(), &result) != nil || result.OrderCode == "" || result.BundleProduct != fixture.bundle {
					t.Fatalf("create order returned %d: %s", w.Code, w.Body)
				}
				return result.OrderCode
			}
			code := checkout()
			if checkout() != code || orders.Load() != expectedOrders {
				t.Fatal("retry must reuse the same pending Razorpay order")
			}
			status := func(want string) {
				t.Helper()
				req := httptest.NewRequest(http.MethodPost, "/api/excel/status", strings.NewReader(fmt.Sprintf(`{"code":%q}`, code))).WithContext(ctx)
				req.Header.Set("Content-Type", "application/json")
				w := httptest.NewRecorder()
				shop.status(w, req)
				var result purchaseStatus
				bundle := fixture.bundle
				if want == "refunded" {
					bundle = ""
				}
				if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &result) != nil || result.State != want ||
					result.BundleProduct != bundle {
					t.Fatalf("want status %s, got %d: %s", want, w.Code, w.Body)
				}
			}
			webhook := func(kind string, p payment) {
				t.Helper()
				body, err := json.Marshal(map[string]any{"event": kind, "payload": map[string]any{"payment": map[string]any{"entity": p}}})
				if err != nil {
					t.Fatal(err)
				}
				req := httptest.NewRequest(http.MethodPost, "/api/excel/webhook", strings.NewReader(string(body))).WithContext(ctx)
				req.Header.Set("X-Razorpay-Signature", hex.EncodeToString(digest(shop.webhookSecret, string(body))))
				w := httptest.NewRecorder()
				shop.webhook(w, req)
				if w.Code < 200 || w.Code >= 300 {
					t.Fatalf("%s returned %d: %s", kind, w.Code, w.Body)
				}
			}
			download := func(code string, want int) {
				t.Helper()
				req := httptest.NewRequest(http.MethodPost, "/api/excel/download", strings.NewReader(fmt.Sprintf(`{"code":%q}`, code))).WithContext(ctx)
				req.Header.Set("Content-Type", "application/json")
				w := httptest.NewRecorder()
				shop.download(w, req)
				if w.Code != want {
					t.Fatalf("download returned %d, want %d: %s", w.Code, want, w.Body)
				}
				if want == http.StatusOK && (w.Body.String() != zipBytes ||
					w.Header().Get("Content-Disposition") != releases[fixture.bundle].disposition() ||
					w.Header().Get("Cache-Control") != "private, no-store") {
					t.Fatal("download did not return the private bundle ZIP")
				}
			}
			status("pending")
			download(code, http.StatusForbidden)
			download(code+"invalid", http.StatusNotFound)
			captured := payment{ID: payID, OrderID: order, Amount: amount, Currency: currency, Status: "captured", Captured: true}
			current.Store(&captured)
			if activated {
				webhook("payment.captured", captured)
				status("paid")
			} else {
				status("paid") // Returning buyer recovers a capture without the browser callback or webhook.
			}
			webhook("payment.captured", captured)
			if fixture.bundle != "" {
				download(code, http.StatusOK)
			} else {
				download(code, http.StatusForbidden)
			}
			if sent, err := shop.sendReceipt(ctx); !sent || err != nil {
				t.Fatalf("could not send receipt: %v", err)
			}
			message := receipt.Load()
			link := shop.origin + "/shop/purchase#" + code
			if message == nil || !strings.Contains(*message, "/#workspace/setup") ||
				strings.Contains(*message, link) != (fixture.bundle != "") {
				t.Fatal("receipt did not match the order's bundle entitlement")
			}
			var grants int
			if err := db.QueryRowContext(ctx, "SELECT count(*) FROM family_passes WHERE account_id=$1 AND source=$2", account, order).Scan(&grants); err != nil || grants != 1 {
				t.Fatalf("expected one pass after replay, got %d: %v", grants, err)
			}
			if activated {
				if _, err := db.ExecContext(ctx, `WITH wedding AS (
     INSERT INTO weddings (name,wedding_date,time_zone) VALUES ('Refund fixture',current_date+10,'Asia/Kolkata') RETURNING id
    ) UPDATE family_passes SET wedding_id=wedding.id, consumed_at=now() FROM wedding WHERE source=$1`, order); err != nil {
					t.Fatal(err)
				}
			}

			partial := captured
			partial.Refunded = amount / 2
			current.Store(&partial)
			webhook("refund.processed", partial)
			status("paid")
			if fixture.bundle != "" {
				download(code, http.StatusOK)
			}
			refunded := captured
			refunded.Refunded, refunded.Status = amount, "refunded"
			current.Store(&refunded)
			webhook("refund.processed", refunded)
			webhook("refund.processed", refunded)
			webhook("payment.captured", captured)
			status("refunded")
			download(code, http.StatusForbidden)
			pass, err := shop.familyPassStatus(ctx, db, account)
			if err != nil || pass.Available || pass.OrderCode != "" {
				t.Fatalf("refund must leave no available or pending pass: %+v, %v", pass, err)
			}
			var revoked, exportWindow bool
			err = db.QueryRowContext(ctx, `SELECT p.revoked_at IS NOT NULL, COALESCE(a.delete_at = p.revoked_at + interval '720 hours',false)
    FROM family_passes p LEFT JOIN family_wedding_access a ON a.wedding_id=p.wedding_id WHERE p.source=$1`, order).Scan(&revoked, &exportWindow)
			if err != nil || !revoked || exportWindow != activated {
				t.Fatalf("revoked=%t, export window=%t, activated=%t: %v", revoked, exportWindow, activated, err)
			}
		})
	}
}

package commerce

import (
	"archive/zip"
	"bytes"
	"context"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"
)

func TestExcelPurchase(t *testing.T) {
	connection := os.Getenv("SHAADI_TEST_DATABASE_URL")
	packagePath := os.Getenv("SHAADI_TEST_WORKBOOK_PACKAGE")
	dir := os.Getenv("SHAADI_TEST_SHOP_PACKAGES")
	if connection == "" || packagePath == "" || dir == "" {
		t.Skip("set SHAADI_TEST_DATABASE_URL, SHAADI_TEST_WORKBOOK_PACKAGE and SHAADI_TEST_SHOP_PACKAGES")
	}
	kit, err := os.ReadFile(packagePath)
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("AWS_REGION", "ap-south-1")
	t.Setenv("AWS_ACCESS_KEY_ID", "checkout-test-key")
	t.Setenv("AWS_SECRET_ACCESS_KEY", "checkout-test-secret")
	t.Setenv("AWS_SESSION_TOKEN", "checkout-test-token")
	cfg, err := awsConfig()
	if err != nil {
		t.Fatal(err)
	}
	const objectKey = "excel-kit/en/v1.3.1/" + kitName
	files := map[string][]byte{"/paid-kits/" + objectKey: kit}
	selection := []string{product}
	{
		for id, release := range releases {
			if id == product {
				continue
			}
			data, err := os.ReadFile(filepath.Join(dir, release.filename))
			if err != nil {
				t.Fatal(err)
			}
			files["/paid-kits/shop/"+id+"/"+release.filename] = data
			selection = append(selection, id)
		}
		sort.Strings(selection)
	}
	s3Server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" || !strings.Contains(r.Header.Get("Authorization"), "Credential=checkout-test-key/") ||
			!strings.Contains(r.Header.Get("Authorization"), "/ap-south-1/s3/aws4_request") ||
			r.Header.Get("X-Amz-Security-Token") != "checkout-test-token" {
			t.Error("unexpected S3 authentication")
		}
		switch {
		case files[r.URL.Path] != nil:
			w.Write(files[r.URL.Path])
		case r.URL.Path == "/paid-kits/wrong.zip":
			w.Write([]byte("wrong package"))
		default:
			w.WriteHeader(404)
		}
	}))
	defer s3Server.Close()
	storage := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(s3Server.URL)
		o.UsePathStyle = true
	})
	if _, err := loadPackage(t.Context(), storage, "paid-kits", "wrong.zip", kitSHA256); err == nil || !strings.Contains(err.Error(), "does not match") {
		t.Fatalf("wrong kit was accepted: %v", err)
	}
	packages, err := loadPackages(t.Context(), storage, "paid-kits", objectKey, strings.Join(selection, ","))
	if err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("pgx", connection)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := migrate(ctx, db); err != nil {
		t.Fatal(err)
	}

	var mu sync.Mutex
	var receipt string
	var receiptCount, orders int
	var pay payment
	razorpay := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		if key, secret, ok := r.BasicAuth(); !ok || key != "rzp_test_fixture" || secret != "test-razorpay" {
			t.Error("missing Razorpay authentication")
			w.WriteHeader(401)
			return
		}
		switch {
		case r.Method == "POST" && r.URL.Path == "/orders":
			var body struct {
				Amount            int
				Currency, Receipt string
				Notes             map[string]string
				Partial           bool `json:"partial_payment"`
			}
			if json.NewDecoder(r.Body).Decode(&body) != nil || body.Amount != catalog[body.Notes["product"]].Amount || body.Currency != "INR" ||
				body.Partial || packages[body.Notes["product"]] == nil || len(body.Receipt) > 40 {
				t.Error("unexpected order parameters")
			}
			orders++
			json.NewEncoder(w).Encode(map[string]any{"id": fmt.Sprintf("order_Test%d", orders),
				"amount": body.Amount, "currency": body.Currency, "receipt": body.Receipt})
		case r.Method == "GET" && strings.HasPrefix(r.URL.Path, "/orders/"):
			result := []payment{}
			if pay.OrderID != "" {
				result = append(result, pay)
			}
			json.NewEncoder(w).Encode(map[string]any{"items": result})
		case r.Method == "GET" && r.URL.Path == "/payments/"+pay.ID:
			json.NewEncoder(w).Encode(pay)
		default:
			t.Errorf("unexpected Razorpay request %s %s", r.Method, r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	defer razorpay.Close()
	failReceipt := true
	ses := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		var body struct {
			FromEmailAddress string
			ReplyToAddresses []string
			Destination      struct{ ToAddresses []string }
			Content          struct {
				Simple struct {
					Body struct {
						Text struct{ Data, Charset string }
					}
				}
			}
			EmailTags []struct{ Name, Value string }
		}
		if r.Method != "POST" || r.URL.Path != "/v2/email/outbound-emails" ||
			!strings.Contains(r.Header.Get("Authorization"), "Credential=checkout-test-key/") ||
			!strings.Contains(r.Header.Get("Authorization"), "/ap-south-1/ses/aws4_request") ||
			r.Header.Get("X-Amz-Security-Token") != "checkout-test-token" ||
			json.NewDecoder(r.Body).Decode(&body) != nil || !slices.Equal(body.Destination.ToAddresses, []string{"buyer@example.com"}) ||
			body.FromEmailAddress != "receipts@example.com" || !slices.Equal(body.ReplyToAddresses, []string{"help@example.com"}) ||
			body.Content.Simple.Body.Text.Charset != "UTF-8" ||
			len(body.EmailTags) != 1 || body.EmailTags[0].Name != "receipt" || !strings.HasPrefix(body.EmailTags[0].Value, "excel-test-order_Test1-") {
			t.Error("unexpected receipt request")
		}
		w.Header().Set("Content-Type", "application/json")
		if failReceipt {
			failReceipt = false
			w.WriteHeader(429)
			io.WriteString(w, `{"message":"try again"}`)
			return
		}
		receipt, receiptCount = body.Content.Simple.Body.Text.Data, receiptCount+1
		io.WriteString(w, `{"MessageId":"fixture-accepted"}`)
	}))
	defer ses.Close()
	shop := &Shop{
		db: db, mode: "test", origin: "https://example.com", acceptOrders: true,
		linkSecret: "test-link", webhookSecret: "test-webhook", packages: packages,
		gateway: gateway{razorpay.URL, "rzp_test_fixture", "test-razorpay", razorpay.Client()},
		mailer: receiptMailer{
			client: sesv2.NewFromConfig(cfg, func(o *sesv2.Options) { o.BaseEndpoint = aws.String(ses.URL) }),
			from:   "receipts@example.com", replyTo: "help@example.com",
		},
	}
	const cleanup = `DELETE FROM excel_orders WHERE mode='test' AND buyer_email='buyer@example.com' AND razorpay_order_id ~ '^order_Test[0-9]+$'`
	if _, err := db.ExecContext(ctx, cleanup); err != nil {
		t.Fatal(err)
	}
	defer db.Exec(cleanup)
	mux := http.NewServeMux()
	shop.Register(mux)
	post := func(path string, body any, want int) *httptest.ResponseRecorder {
		t.Helper()
		data, _ := json.Marshal(body)
		r := httptest.NewRequest("POST", "/api/excel/"+path, bytes.NewReader(data))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("%s: got %d, want %d (%s)", path, w.Code, want, w.Body)
		}
		return w
	}
	setPayment := func(status, order string, paise int, code string) {
		mu.Lock()
		defer mu.Unlock()
		pay = payment{ID: code, OrderID: order, Amount: paise, Currency: "INR", Status: status}
	}
	order := func(id string) map[string]string {
		w := post("orders", map[string]string{"email": "buyer@example.com", "product": id}, 201)
		var out map[string]string
		json.Unmarshal(w.Body.Bytes(), &out)
		return out
	}
	checkStatus := func(body map[string]string, state string, retry bool) {
		t.Helper()
		var status purchaseStatus
		w := post("status", body, 200)
		if json.Unmarshal(w.Body.Bytes(), &status) != nil || status.State != state || (status.Checkout != nil) != retry {
			t.Fatalf("unexpected status: %s", w.Body)
		}
	}

	post("orders", map[string]any{"email": "buyer@example.com", "amount": 1}, 400)
	post("orders", map[string]string{"email": "buyer@example.com", "product": "wedding-pass"}, 404)
	post("orders", map[string]string{"email": "buyer@example.com", "product": product}, 404)
	post("orders", map[string]string{"email": "buyer@example.com"}, 404)
	pending := order(essentialsID)
	essentialsPrice := catalog[essentialsID].Amount
	checkStatus(pending, "pending", true)
	post("download", pending, 403)
	post("download", map[string]string{"code": "order_Test1.forged"}, 404)
	setPayment("failed", "order_Test1", essentialsPrice, "pay_Test1")
	checkStatus(pending, "pending", true)
	post("download", pending, 403)
	setPayment("authorized", "order_Test1", essentialsPrice, "pay_Test1")
	checkStatus(pending, "pending", false)
	post("download", pending, 403)

	confirmation := map[string]string{"code": pending["code"], "order": "order_Test1", "payment": "pay_Test1",
		"signature": hex.EncodeToString(digest(shop.gateway.secret, "order_Test1|pay_Test1"))}
	setPayment("captured", "order_Test1", 100, "pay_Test1")
	post("confirm", confirmation, 200)
	post("download", pending, 403)
	setPayment("captured", "order_Test2", essentialsPrice, "pay_Test1")
	post("confirm", confirmation, 200)
	post("download", pending, 403)
	setPayment("captured", "order_Test1", essentialsPrice, "pay_Test1")
	bad := map[string]string{"code": pending["code"], "order": "order_Test1", "payment": "pay_Test1", "signature": "deadbeef"}
	post("confirm", bad, 400)
	post("download", pending, 403)
	post("confirm", confirmation, 200)
	post("confirm", confirmation, 200)
	checkStatus(pending, "paid", false)
	first := post("download", pending, 200)
	if !bytes.Equal(first.Body.Bytes(), packages[essentialsID]) || first.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatal("download differs from the approved kit or may be cached")
	}
	archive, err := zip.NewReader(bytes.NewReader(first.Body.Bytes()), int64(first.Body.Len()))
	if err != nil {
		t.Fatalf("invalid launch ZIP: %v", err)
	}
	for _, file := range archive.File {
		if file.FileInfo().IsDir() {
			continue
		}
		f, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		n, err := io.Copy(io.Discard, f)
		f.Close()
		if err != nil || n == 0 {
			t.Fatalf("invalid ZIP member %s: %v", file.Name, err)
		}
	}
	var paid int
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM excel_orders WHERE razorpay_payment_id='pay_Test1'`).Scan(&paid); err != nil || paid != 1 {
		t.Fatalf("purchase count %d: %v", paid, err)
	}
	if worked, err := shop.sendReceipt(ctx); err == nil || !worked {
		t.Fatalf("expected SES delivery failure to be queued again: %v", err)
	}
	if worked, err := shop.sendReceipt(ctx); err != nil || worked {
		t.Fatalf("receipt retried before its due time: %v", err)
	}
	post("download", pending, 200)
	if _, err := db.ExecContext(ctx, `UPDATE excel_orders SET receipt_due_at=now() WHERE razorpay_order_id='order_Test1'`); err != nil {
		t.Fatal(err)
	}
	if worked, err := shop.sendReceipt(ctx); err != nil || !worked {
		t.Fatalf("receipt delivery: %v", err)
	}
	mu.Lock()
	_, link, _ := strings.Cut(receipt, "/shop/purchase#")
	recovered, _, _ := strings.Cut(link, "\n")
	count := receiptCount
	mu.Unlock()
	if count != 1 || recovered != pending["code"] {
		t.Fatal("receipt lacks the private purchase link or was sent twice")
	}
	// A fresh request uses only the emailed code, with no cookies or previous tab.
	post("download", map[string]string{"code": recovered}, 200)
	post("recover", map[string]string{"email": "unknown@example.com"}, 202)
	if _, err := db.ExecContext(ctx, `UPDATE excel_orders SET receipt_requested_at=now()-interval '11 minutes' WHERE razorpay_order_id='order_Test1'`); err != nil {
		t.Fatal(err)
	}
	post("recover", map[string]string{"email": "buyer@example.com"}, 202)
	post("recover", map[string]string{"email": "buyer@example.com"}, 202)
	if worked, err := shop.sendReceipt(ctx); err != nil || !worked {
		t.Fatalf("receipt recovery: %v", err)
	}
	if worked, err := shop.sendReceipt(ctx); err != nil || worked {
		t.Fatalf("duplicate delivery: %v", err)
	}

	second := order(essentialsID)
	setPayment("captured", "order_Test2", essentialsPrice, "pay_Test2")
	event := `{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_Test2","order_id":"order_Test2"}}}}`
	for _, valid := range []bool{false, true, true} {
		r := httptest.NewRequest("POST", "/api/excel/webhook", strings.NewReader(event))
		if valid {
			r.Header.Set("X-Razorpay-Signature", hex.EncodeToString(digest(shop.webhookSecret, event)))
		}
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		if (valid && w.Code/100 != 2) || (!valid && w.Code != 400) {
			t.Fatalf("unexpected webhook response %d: %s", w.Code, w.Body)
		}
		if !valid {
			post("download", second, 403)
		}
	}
	post("download", second, 200)
	if _, err := db.ExecContext(ctx, `INSERT INTO excel_orders
		(razorpay_order_id, mode, buyer_email, product, amount_paise, currency, razorpay_payment_id, paid_at)
		VALUES ('order_Test900', 'test', 'buyer@example.com', $1, 79900, 'INR', 'pay_Test900', now())`, product); err != nil {
		t.Fatal(err)
	}
	legacy := post("download", map[string]string{"code": shop.accessCode("order_Test900")}, 200)
	if !bytes.Equal(legacy.Body.Bytes(), kit) {
		t.Fatal("retired Excel Kit receipt did not recover its original package")
	}
	for _, sku := range selection {
		if sku == product {
			continue
		}
		code := order(sku)
		orderRef, _, _ := strings.Cut(code["code"], ".")
		paise := catalog[sku].Amount
		paymentRef := "pay_" + strings.TrimPrefix(orderRef, "order_")
		setPayment("captured", orderRef, 79900, paymentRef)
		checkStatus(code, "pending", false)
		post("download", code, 403)
		setPayment("captured", orderRef, paise, paymentRef)
		checkStatus(code, "paid", false)
		download := post("download", code, 200)
		if !bytes.Equal(download.Body.Bytes(), packages[sku]) || download.Header().Get("Content-Type") != releases[sku].contentType() ||
			!strings.Contains(download.Header().Get("Content-Disposition"), releases[sku].filename) {
			t.Fatalf("wrong download for %s", sku)
		}
	}
	shop.acceptOrders = false
	post("orders", map[string]string{"email": "buyer@example.com"}, 503)
	post("download", second, 200)
}

package commerce

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	_ "embed"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"net/mail"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/ajz007/shaadi-planner-pro/internal/httpx"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"
	_ "github.com/jackc/pgx/v5/stdlib"
)

const (
	familyPassID = "wedding-pass"
	product      = "excel-english-v1.3.1"
	currency     = "INR"
	kitName      = "Shaadi_Planner_Pro_V1_3_1_English_Launch_Package.zip"
	kitSHA256    = "db792ef5b7e0f49677b950a055cc9b4a864a142eb6202428a950f5d521c9dbdf"
)

//go:embed schema.sql
var schema string

var (
	orderID   = regexp.MustCompile(`^order_[A-Za-z0-9]{1,64}$`)
	paymentID = regexp.MustCompile(`^pay_[A-Za-z0-9]{1,64}$`)
)

type Shop struct {
	meta                                    *metaEvents
	db                                      *sql.DB
	gateway                                 gateway
	mode, origin, linkSecret, webhookSecret string
	testAccess                              string
	mailer                                  receiptMailer
	packages                                map[string][]byte
	acceptOrders, acceptFamilyPass          bool
	firstWeddingDiscount                    int
}

func Configure(ctx context.Context, origin string) (*Shop, error) {
	mode := os.Getenv("SHAADI_EXCEL_MODE")
	if os.Getenv("SHAADI_FAMILY_PASS_ACCEPT_ORDERS") == "1" && mode == "live" &&
		os.Getenv("SHAADI_FAMILY_PASS_POLICY_READY") != "1" {
		return nil, errors.New("confirm Family Pass launch policies before opening live orders")
	}
	if mode == "" {
		return nil, nil
	}
	if mode != "test" && (mode != "live" || origin == "") {
		return nil, errors.New("Excel checkout requires test mode or an HTTPS live origin")
	}
	discount, err := firstWeddingDiscount(os.Getenv("SHAADI_FIRST_WEDDING_DISCOUNT_PERCENT"), os.Getenv("SHAADI_FAMILY_PASS_REQUIRED") == "1")
	if err != nil {
		return nil, err
	}
	testAccess := os.Getenv("SHAADI_EXCEL_TEST_ACCESS")
	if mode == "test" && origin != "" && len(testAccess) < 32 {
		return nil, errors.New("hosted Excel test checkout requires a private SHAADI_EXCEL_TEST_ACCESS code")
	}
	if origin == "" {
		origin = "http://localhost:8080"
	}
	key, secret := os.Getenv("RAZORPAY_KEY_ID"), os.Getenv("RAZORPAY_KEY_SECRET")
	linkSecret, webhookSecret := os.Getenv("SHAADI_EXCEL_LINK_SECRET"), os.Getenv("RAZORPAY_WEBHOOK_SECRET")
	emailFrom := strings.TrimSpace(os.Getenv("SHAADI_EXCEL_RECEIPT_FROM"))
	replyTo := strings.TrimSpace(os.Getenv("SHAADI_EXCEL_RECEIPT_REPLY_TO"))
	connection := os.Getenv("SHAADI_DATABASE_URL")
	if !strings.HasPrefix(key, "rzp_"+mode+"_") || key == "rzp_"+mode+"_" || secret == "" ||
		len(linkSecret) < 32 || webhookSecret == "" || emailFrom == "" || connection == "" {
		return nil, errors.New("Excel checkout requires matching Razorpay keys, webhook and link secrets, receipt email settings, and a database")
	}
	if _, err := mail.ParseAddress(emailFrom); err != nil || (replyTo != "" && cleanEmail(replyTo) == "") {
		return nil, errors.New("set a valid SHAADI_EXCEL_RECEIPT_FROM and optional SHAADI_EXCEL_RECEIPT_REPLY_TO")
	}
	cfg, err := awsConfig()
	if err != nil {
		return nil, err
	}
	packages, err := loadPackages(ctx, s3.NewFromConfig(cfg), os.Getenv("SHAADI_EXCEL_S3_BUCKET"),
		os.Getenv("SHAADI_EXCEL_S3_KEY"), os.Getenv("SHAADI_SHOP_PRODUCTS"))
	if err != nil {
		return nil, err
	}
	db, err := sql.Open("pgx", connection)
	if err != nil {
		return nil, errors.New("could not open Excel checkout database")
	}
	db.SetMaxOpenConns(5)
	if err := migrate(ctx, db); err != nil {
		db.Close()
		return nil, errors.New("could not migrate Excel checkout database")
	}
	client := &http.Client{Timeout: 5 * time.Second}
	return &Shop{
		meta: configuredMeta(mode), db: db, mode: mode, origin: origin, linkSecret: linkSecret, webhookSecret: webhookSecret,
		gateway:    gateway{"https://api.razorpay.com/v1", key, secret, client},
		mailer:     receiptMailer{client: sesv2.NewFromConfig(cfg), from: emailFrom, replyTo: replyTo},
		testAccess: testAccess, firstWeddingDiscount: discount,
		packages: packages, acceptOrders: os.Getenv("SHAADI_EXCEL_ACCEPT_ORDERS") == "1",
		acceptFamilyPass: os.Getenv("SHAADI_FAMILY_PASS_REQUIRED") == "1" && os.Getenv("SHAADI_FAMILY_PASS_ACCEPT_ORDERS") == "1",
	}, nil
}

func migrate(ctx context.Context, db *sql.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, "SELECT pg_advisory_xact_lock(718035191)"); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, schema); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Shop) Close() { s.db.Close() }

func (s *Shop) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/excel/shop", func(w http.ResponseWriter, r *http.Request) {
		products := make(map[string]bool)
		if s != nil {
			for id := range s.packages {
				if id != product {
					products[id] = s.acceptOrders
				}
			}
		}
		httpx.Reply(w, 200, map[string]any{
			"metaPixelID":             browserMetaID(),
			"available":               false, // The retired Excel Kit cannot be ordered by older clients.
			"products":                products,
			"test":                    s != nil && s.mode == "test",
			"recovery":                s != nil,
			"testAccessRequired":      s != nil && s.mode == "test" && s.testAccess != "",
			"firstWeddingOffer":       s.publicFirstWeddingOffer(),
			"familyPassOnSale":        s.canSellFamilyPass() && s.mode == "live",
			"familyPassBundleProduct": s.availableFamilyPassBundle(),
		})
	})
	if s == nil {
		return
	}
	mux.HandleFunc("POST /api/excel/orders", s.createOrder)
	mux.HandleFunc("POST /api/excel/checkout-event", s.checkoutEvent)
	mux.HandleFunc("POST /api/excel/status", s.status)
	mux.HandleFunc("POST /api/excel/confirm", s.confirm)
	mux.HandleFunc("POST /api/excel/download", s.download)
	mux.HandleFunc("POST /api/excel/recover", s.recover)
	mux.HandleFunc("POST /api/excel/webhook", s.webhook)
}

func cleanEmail(input string) string {
	input = strings.TrimSpace(input)
	addr, err := mail.ParseAddress(input)
	_, domain, _ := strings.Cut(input, "@")
	if err != nil || addr.Address != input || len(input) > 254 || !strings.Contains(domain, ".") {
		return ""
	}
	return strings.ToLower(input)
}

func digest(secret, data string) []byte {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(data))
	return mac.Sum(nil)
}

func (s *Shop) accessCode(id string) string {
	return id + "." + base64.RawURLEncoding.EncodeToString(digest(s.linkSecret, "excel-purchase:"+s.mode+":"+id))
}

func (s *Shop) authorizedOrder(w http.ResponseWriter, code string) string {
	id, _, _ := strings.Cut(code, ".")
	if orderID.MatchString(id) && hmac.Equal([]byte(s.accessCode(id)), []byte(code)) {
		return id
	}
	httpx.Fail(w, 404, "Purchase link unavailable. Use the recovery form below.")
	return ""
}

func (s *Shop) fail(w http.ResponseWriter) {
	httpx.Fail(w, 503, "We couldn't check your purchase right now. Try again in a moment.")
}

func (s *Shop) createOrder(w http.ResponseWriter, r *http.Request) {
	if !s.acceptOrders {
		httpx.Fail(w, 503, "New orders are paused.")
		return
	}
	var input struct {
		Email, TestAccess, Product string
		Meta                       *metaAttribution
	}
	if !httpx.ReadJSON(w, r, &input) {
		return
	}
	if s.mode == "test" && s.testAccess != "" && !hmac.Equal([]byte(s.testAccess), []byte(input.TestAccess)) {
		httpx.Fail(w, 403, "Enter the private test checkout code.")
		return
	}
	item, ok := catalog[input.Product]
	if !ok || s.packages[item.ID] == nil {
		httpx.Fail(w, 404, "This product is currently unavailable for checkout.")
		return
	}
	email := cleanEmail(input.Email)
	if email == "" {
		httpx.Fail(w, 400, "Enter a valid email for your receipt.")
		return
	}
	id, err := s.openOrder(r.Context(), s.db, item, email, nil, s.orderAttribution(input.Meta, r.UserAgent()))
	if err != nil {
		s.fail(w)
		return
	}
	httpx.Reply(w, 201, map[string]string{"code": s.accessCode(id)})
}

type orderWriter interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func (s *Shop) openOrder(ctx context.Context, db orderWriter, item listing, email string, account *string, attribution *string) (string, error) {
	receipt := "excel_" + rand.Text()
	var order struct {
		ID, Currency, Receipt string
		Amount                int
	}
	err := s.gateway.request(ctx, "POST", "/orders", map[string]any{
		"amount": item.Amount, "currency": currency, "receipt": receipt,
		"partial_payment": false, "notes": map[string]string{"product": item.ID},
	}, &order)
	if err != nil || !orderID.MatchString(order.ID) || order.Amount != item.Amount || order.Currency != currency || order.Receipt != receipt {
		return "", errors.New("could not create Razorpay order")
	}
	var bundle *string
	if item.ID == familyPassID {
		id := allInOneID
		bundle = &id
	}
	_, err = db.ExecContext(ctx, `INSERT INTO excel_orders
		(razorpay_order_id, mode, buyer_email, product, amount_paise, currency, workspace_account_id, bundle_product, meta_attribution)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, order.ID, s.mode, email, item.ID, item.Amount, currency, account, bundle, attribution)
	return order.ID, err
}

type purchase struct {
	Email, Payment, Product, Currency string
	Amount                            int
	PaidAt, RefundedAt                sql.NullTime
	BundleProduct                     string
}

// The original Essentials orders used a boolean before we started recording the bundle product.
const familyBundleSQL = `COALESCE(bundle_product, CASE WHEN includes_essentials THEN '` + essentialsID + `' ELSE '' END)`

func (s *Shop) purchase(ctx context.Context, id string) (purchase, error) {
	var p purchase
	err := s.db.QueryRowContext(ctx, `SELECT buyer_email, COALESCE(razorpay_payment_id, ''), product,
		amount_paise, currency, paid_at, refunded_at, `+familyBundleSQL+` FROM excel_orders WHERE razorpay_order_id=$1 AND mode=$2`, id, s.mode).
		Scan(&p.Email, &p.Payment, &p.Product, &p.Amount, &p.Currency, &p.PaidAt, &p.RefundedAt, &p.BundleProduct)
	return p, err
}

func (s *Shop) markPaid(ctx context.Context, id string, p purchase, pay payment) (bool, error) {
	if !paymentID.MatchString(pay.ID) || pay.OrderID != id || pay.Amount != p.Amount ||
		pay.Currency != p.Currency || pay.Status != "captured" || pay.Refunded != 0 {
		return false, nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `UPDATE excel_orders SET razorpay_payment_id=$1, paid_at=now(), receipt_due_at=now()
		WHERE razorpay_order_id=$2 AND mode=$3 AND paid_at IS NULL AND refunded_at IS NULL`, pay.ID, id, s.mode)
	if err != nil {
		return false, err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	if updated == 1 && p.Product == familyPassID {
		_, err = tx.ExecContext(ctx, `INSERT INTO family_passes (account_id, source, mode)
			SELECT workspace_account_id, razorpay_order_id, mode FROM excel_orders WHERE razorpay_order_id=$1`, id)
		if err != nil {
			return false, err
		}
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	if updated == 1 {
		return true, nil
	}
	current, err := s.purchase(ctx, id)
	return current.PaidAt.Valid && !current.RefundedAt.Valid, err
}

func (s *Shop) download(w http.ResponseWriter, r *http.Request) {
	var input struct{ Code string }
	if !httpx.ReadJSON(w, r, &input) {
		return
	}
	id := s.authorizedOrder(w, input.Code)
	if id == "" {
		return
	}
	p, err := s.purchase(r.Context(), id)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && !p.PaidAt.Valid) {
		httpx.Fail(w, 403, "The download is available after payment is confirmed.")
		return
	}
	if err != nil {
		s.fail(w)
		return
	}
	downloadID := p.Product
	if p.Product == familyPassID {
		if p.RefundedAt.Valid || p.BundleProduct == "" {
			httpx.Fail(w, 403, "The bundled download is unavailable for this Family Pass order.")
			return
		}
		downloadID = p.BundleProduct
	}
	file, ok := releases[downloadID]
	data := s.packages[downloadID]
	if !ok || data == nil {
		httpx.Fail(w, 503, "Your payment is confirmed. This download is temporarily unavailable. Please contact support if it persists.")
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Content-Type", file.contentType())
	w.Header().Set("Content-Disposition", file.disposition())
	w.Header().Set("Content-Length", fmt.Sprint(len(data)))
	bytes.NewReader(data).WriteTo(w)
}

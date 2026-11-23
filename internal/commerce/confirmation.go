package commerce

import (
	"crypto/hmac"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"regexp"

	"github.com/ajz007/shaadi-planner-pro/internal/httpx"
)

type checkoutInfo struct {
	Key      string `json:"key"`
	Order    string `json:"order"`
	Email    string `json:"email"`
	Amount   int    `json:"amount"`
	Currency string `json:"currency"`
}

type purchaseStatus struct {
	State         string        `json:"state"`
	Test          bool          `json:"test"`
	Payment       string        `json:"payment,omitempty"`
	Product       string        `json:"product"`
	Checkout      *checkoutInfo `json:"checkout,omitempty"`
	BundleProduct string        `json:"bundleProduct,omitempty"`
}

func (s *Shop) purchaseState(p purchase, state, payment string) purchaseStatus {
	out := purchaseStatus{State: state, Test: s.mode == "test", Payment: payment, Product: p.Product}
	if p.Product == familyPassID && state != "refunded" {
		out.BundleProduct = p.BundleProduct
	}
	return out
}

func (s *Shop) readPurchase(w http.ResponseWriter, r *http.Request, code string) (string, purchase) {
	id := s.authorizedOrder(w, code)
	if id == "" {
		return "", purchase{}
	}
	p, err := s.purchase(r.Context(), id)
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Fail(w, 404, "Purchase link unavailable. Use the recovery form below.")
		return "", purchase{}
	}
	if err != nil {
		s.fail(w)
		return "", purchase{}
	}
	return id, p
}

func (s *Shop) status(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Code            string
		CheckoutLanding bool
	}
	if !httpx.ReadJSON(w, r, &input) {
		return
	}
	id, p := s.readPurchase(w, r, input.Code)
	if id == "" {
		return
	}
	if p.RefundedAt.Valid {
		httpx.Reply(w, 200, s.purchaseState(p, "refunded", p.Payment))
		return
	}
	if p.PaidAt.Valid {
		httpx.Reply(w, 200, s.purchaseState(p, "paid", p.Payment))
		return
	}
	if input.CheckoutLanding {
		// The purchase code was verified above. A reload can only mark an order once.
		if _, err := s.db.ExecContext(r.Context(), `UPDATE excel_orders SET checkout_landed_at=now()
			WHERE razorpay_order_id=$1 AND mode=$2 AND checkout_landed_at IS NULL
				AND paid_at IS NULL AND refunded_at IS NULL`, id, s.mode); err != nil {
			log.Print("could not record a checkout landing")
		}
	}

	// Reconcile directly with Razorpay when a buyer returns without a callback.
	var list struct{ Items []payment }
	if err := s.gateway.request(r.Context(), "GET", "/orders/"+id+"/payments", nil, &list); err != nil {
		s.fail(w)
		return
	}
	waiting := false
	for _, pay := range list.Items {
		if pay.OrderID != id {
			continue
		}
		if pay.Status == "authorized" || pay.Status == "created" || pay.Status == "captured" {
			waiting = true
		}
		if pay.Status != "captured" {
			continue
		}
		paid, err := s.markPaid(r.Context(), id, p, pay)
		if err != nil {
			s.fail(w)
			return
		}
		if paid {
			httpx.Reply(w, 200, s.purchaseState(p, "paid", pay.ID))
			return
		}
	}
	out := s.purchaseState(p, "pending", "")
	if !waiting && ((s.acceptOrders && p.Product != product && s.packages[p.Product] != nil) ||
		(p.Product == familyPassID && s.acceptFamilyPass && (p.BundleProduct == "" || s.packages[p.BundleProduct] != nil))) {
		out.Checkout = &checkoutInfo{Key: s.gateway.key, Order: id, Email: p.Email, Amount: p.Amount, Currency: p.Currency}
	}
	httpx.Reply(w, 200, out)
}

func (s *Shop) confirm(w http.ResponseWriter, r *http.Request) {
	var input struct{ Code, Order, Payment, Signature string }
	if !httpx.ReadJSON(w, r, &input) {
		return
	}
	id, p := s.readPurchase(w, r, input.Code)
	if id == "" {
		return
	}
	signature, err := hex.DecodeString(input.Signature)
	if input.Order != id || !paymentID.MatchString(input.Payment) || err != nil ||
		!hmac.Equal(signature, digest(s.gateway.secret, id+"|"+input.Payment)) {
		httpx.Fail(w, 400, "Payment confirmation could not be verified. Check your purchase status.")
		return
	}
	if p.RefundedAt.Valid {
		httpx.Reply(w, 200, s.purchaseState(p, "refunded", p.Payment))
		return
	}
	if p.PaidAt.Valid {
		httpx.Reply(w, 200, s.purchaseState(p, "paid", p.Payment))
		return
	}
	var pay payment
	if err := s.gateway.request(r.Context(), "GET", "/payments/"+input.Payment, nil, &pay); err != nil || pay.ID != input.Payment {
		s.fail(w)
		return
	}
	s.finishConfirmation(w, r, id, p, pay)
}

func (s *Shop) finishConfirmation(w http.ResponseWriter, r *http.Request, id string, p purchase, pay payment) {
	paid, err := s.markPaid(r.Context(), id, p, pay)
	if err != nil {
		s.fail(w)
		return
	}
	out := s.purchaseState(p, "pending", "")
	if paid {
		out.State, out.Payment = "paid", pay.ID
	}
	httpx.Reply(w, 200, out)
}

var checkoutAttemptID = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
var refundID = regexp.MustCompile(`^rfnd_[A-Za-z0-9]{1,64}$`)

func (s *Shop) checkoutEvent(w http.ResponseWriter, r *http.Request) {
	var input struct{ Code, Event, Attempt string }
	if !httpx.ReadJSON(w, r, &input) {
		return
	}
	if (input.Event != "checkout_opened" && input.Event != "checkout_dismissed") || !checkoutAttemptID.MatchString(input.Attempt) {
		httpx.Fail(w, 400, "Invalid checkout event.")
		return
	}
	order := s.authorizedOrder(w, input.Code)
	if order == "" {
		return
	}
	if s.recordEvent(w, r, order, input.Event, input.Attempt, nil) {
		w.WriteHeader(http.StatusNoContent)
	}
}

func (s *Shop) recordEvent(w http.ResponseWriter, r *http.Request, order, event, attempt string, amount *int) bool {
	_, err := s.db.ExecContext(r.Context(), `INSERT INTO excel_checkout_events(razorpay_order_id,event,attempt_id,amount_paise)
		SELECT razorpay_order_id,$3,$4,$5 FROM excel_orders WHERE razorpay_order_id=$1 AND mode=$2
		ON CONFLICT DO NOTHING`, order, s.mode, event, attempt, amount)
	if err != nil {
		s.fail(w)
		return false
	}
	return true
}

func (s *Shop) webhook(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 256<<10))
	signature, sigErr := hex.DecodeString(r.Header.Get("X-Razorpay-Signature"))
	if err != nil || sigErr != nil || !hmac.Equal(signature, digest(s.webhookSecret, string(body))) {
		httpx.Fail(w, 400, "Invalid webhook.")
		return
	}
	var event struct {
		Event   string
		Payload struct {
			Payment struct{ Entity payment }
			Refund  struct {
				Entity struct {
					ID        string
					PaymentID string `json:"payment_id"`
					Amount    int
				}
			}
		}
	}
	if json.Unmarshal(body, &event) != nil {
		httpx.Fail(w, 400, "Invalid webhook.")
		return
	}
	pay := event.Payload.Payment.Entity
	if event.Event == "payment.failed" && orderID.MatchString(pay.OrderID) && paymentID.MatchString(pay.ID) {
		if s.recordEvent(w, r, pay.OrderID, "payment_failed", pay.ID, nil) {
			w.WriteHeader(http.StatusNoContent)
		}
		return
	}
	if event.Event == "refund.processed" {
		refund := event.Payload.Refund.Entity
		if refundID.MatchString(refund.ID) && paymentID.MatchString(refund.PaymentID) && refund.Amount > 0 {
			// Refund notifications can contain the refund entity without a payment entity.
			if pay.OrderID == "" {
				if err := s.gateway.request(r.Context(), "GET", "/payments/"+refund.PaymentID, nil, &pay); err != nil {
					s.fail(w)
					return
				}
			}
			if pay.ID != refund.PaymentID || !orderID.MatchString(pay.OrderID) {
				httpx.Fail(w, 400, "Invalid refund payment.")
				return
			}
			if !s.recordEvent(w, r, pay.OrderID, "refund_processed", refund.ID, &refund.Amount) {
				return
			}
		}
		s.confirmFamilyRefund(w, r, pay)
		return
	}
	if event.Event != "payment.captured" || !orderID.MatchString(pay.OrderID) || !paymentID.MatchString(pay.ID) {
		w.WriteHeader(204)
		return
	}
	p, err := s.purchase(r.Context(), pay.OrderID)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && p.PaidAt.Valid) {
		w.WriteHeader(204)
		return
	}
	if err != nil {
		s.fail(w)
		return
	}
	var current payment
	if err := s.gateway.request(r.Context(), "GET", "/payments/"+pay.ID, nil, &current); err != nil || current.ID != pay.ID {
		s.fail(w)
		return
	}
	s.finishConfirmation(w, r, pay.OrderID, p, current)
}

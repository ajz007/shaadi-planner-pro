package commerce

import (
	"crypto/hmac"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"

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
	State              string        `json:"state"`
	Test               bool          `json:"test"`
	Payment            string        `json:"payment,omitempty"`
	Product            string        `json:"product"`
	Checkout           *checkoutInfo `json:"checkout,omitempty"`
	IncludesEssentials bool          `json:"includesEssentials,omitempty"`
}

func (s *Shop) purchaseState(p purchase, state, payment string) purchaseStatus {
	return purchaseStatus{
		State: state, Test: s.mode == "test", Payment: payment, Product: p.Product,
		IncludesEssentials: p.Product == familyPassID && p.IncludesEssentials && state != "refunded",
	}
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
	var input struct{ Code string }
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
		(p.Product == familyPassID && s.acceptFamilyPass && (!p.IncludesEssentials || s.packages[essentialsID] != nil))) {
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

func (s *Shop) webhook(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 256<<10))
	signature, sigErr := hex.DecodeString(r.Header.Get("X-Razorpay-Signature"))
	if err != nil || sigErr != nil || !hmac.Equal(signature, digest(s.webhookSecret, string(body))) {
		httpx.Fail(w, 400, "Invalid webhook.")
		return
	}
	var event struct {
		Event   string
		Payload struct{ Payment struct{ Entity payment } }
	}
	if json.Unmarshal(body, &event) != nil {
		httpx.Fail(w, 400, "Invalid webhook.")
		return
	}
	pay := event.Payload.Payment.Entity
	if event.Event == "refund.processed" {
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

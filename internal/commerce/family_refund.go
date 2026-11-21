package commerce

import (
	"database/sql"
	"errors"
	"net/http"
)

// The webhook has already passed signature verification. Use the current
// payment to confirm it was captured and refunded in full before revoking access.
func (s *Shop) confirmFamilyRefund(w http.ResponseWriter, r *http.Request, pay payment) {
	if !pay.Captured || !orderID.MatchString(pay.OrderID) || !paymentID.MatchString(pay.ID) {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	ctx := r.Context()
	p, err := s.purchase(ctx, pay.OrderID)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && (p.Product != familyPassID || p.RefundedAt.Valid ||
		(p.Payment != "" && p.Payment != pay.ID))) {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if err != nil {
		s.fail(w)
		return
	}
	var current payment
	err = s.gateway.request(ctx, "GET", "/payments/"+pay.ID, nil, &current)
	if err != nil {
		s.fail(w)
		return
	}
	if current.ID != pay.ID || current.OrderID != pay.OrderID || current.Amount != p.Amount ||
		current.Currency != p.Currency {
		s.fail(w)
		return
	}
	if current.Status != "refunded" || current.Refunded != p.Amount {
		if pay.Refunded == p.Amount {
			// Retry if Razorpay's payment API has not caught up with the webhook.
			s.fail(w)
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		s.fail(w)
		return
	}
	defer tx.Rollback()
	var refundedAt sql.NullTime
	err = tx.QueryRowContext(ctx, `UPDATE excel_orders SET refunded_at=now(), receipt_due_at=NULL
		WHERE razorpay_order_id=$1 AND mode=$2 AND refunded_at IS NULL
		  AND (razorpay_payment_id IS NULL OR razorpay_payment_id=$3)
		RETURNING refunded_at`, pay.OrderID, s.mode, pay.ID).Scan(&refundedAt)
	if errors.Is(err, sql.ErrNoRows) {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if err != nil {
		s.fail(w)
		return
	}
	_, err = tx.ExecContext(ctx, `UPDATE family_passes SET revoked_at=$3
		WHERE source=$1 AND mode=$2 AND revoked_at IS NULL`, pay.OrderID, s.mode, refundedAt)
	if err != nil || tx.Commit() != nil {
		s.fail(w)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

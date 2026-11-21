package commerce

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/ajz007/shaadi-planner-pro/internal/httpx"
)

func (s *Shop) recover(w http.ResponseWriter, r *http.Request) {
	var input struct{ Email string }
	if !httpx.ReadJSON(w, r, &input) {
		return
	}
	email := cleanEmail(input.Email)
	if email == "" {
		httpx.Fail(w, 400, "Enter the email you used at checkout.")
		return
	}
	// Re-use the delivery queue. The same email can request one batch of links
	// per ten minutes, including across browser sessions and server replicas.
	_, err := s.db.ExecContext(r.Context(), `UPDATE excel_orders SET receipt_due_at=now(),
		receipt_version=receipt_version+1, receipt_requested_at=now()
		WHERE mode=$1 AND buyer_email=$2 AND paid_at IS NOT NULL AND receipt_due_at IS NULL
		AND receipt_requested_at <= now()-interval '10 minutes'`, s.mode, email)
	if err != nil {
		s.fail(w)
		return
	}
	httpx.Reply(w, 202, map[string]bool{"accepted": true})
}

func (s *Shop) SendReceipts(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		for range 20 {
			work, err := s.sendReceipt(ctx)
			if err != nil {
				if ctx.Err() == nil {
					log.Printf("Shop receipt queue: %v", err)
				}
				break
			}
			if !work {
				break
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (s *Shop) sendReceipt(ctx context.Context) (bool, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()
	var id, email, payID, productID, currency string
	var version, amount int
	var paid time.Time
	err = tx.QueryRowContext(ctx, `SELECT razorpay_order_id, buyer_email, razorpay_payment_id, paid_at, receipt_version,
		product, amount_paise, currency
		FROM excel_orders WHERE mode=$1 AND receipt_due_at<=now()
		ORDER BY receipt_due_at LIMIT 1 FOR UPDATE SKIP LOCKED`, s.mode).
		Scan(&id, &email, &payID, &paid, &version, &productID, &amount, &currency)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	india := time.FixedZone("IST", 5*60*60+30*60)
	name := productName(productID)
	text := fmt.Sprintf("ShaadiPlannerPro · %s\nOne-time payment: %s %d.%02d\nDate: %s\nRazorpay payment: %s\n\nOpen your private purchase page to download your files again:\n%s/shop/purchase#%s\n\nKeep this link private. You can request your receipt again from Find a purchase in the shop.",
		name, currency, amount/100, amount%100, paid.In(india).Format("2 Jan 2006, 15:04 MST"), payID, s.origin, s.accessCode(id))
	if productID == familyPassID {
		text = fmt.Sprintf("Shaadi Planner Pro Family Pass\nOne-time payment: %s %d.%02d\nDate: %s\nRazorpay payment: %s\n\nSign in with the Google account you used to buy the pass:\n%s/#workspace/setup\n",
			currency, amount/100, amount%100, paid.In(india).Format("2 Jan 2006, 15:04 MST"), payID, s.origin)
	}
	if s.mode == "test" {
		text = "Test purchase. No money was charged.\n\n" + text
	}
	sendErr := s.mailer.send(ctx, email, text, fmt.Sprintf("excel-%s-%s-%d", s.mode, id, version))
	update := "UPDATE excel_orders SET receipt_due_at=NULL WHERE razorpay_order_id=$1"
	if sendErr != nil {
		update = "UPDATE excel_orders SET receipt_due_at=now()+interval '15 minutes' WHERE razorpay_order_id=$1"
	}
	if _, err := tx.ExecContext(ctx, update, id); err != nil {
		return false, err
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	return true, sendErr
}

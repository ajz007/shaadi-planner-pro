package commerce

import (
	"context"
	"crypto/hmac"
	"database/sql"
	"fmt"
	"net/http"
	"strconv"

	"github.com/ajz007/shaadi-planner-pro/internal/httpx"
)

type weddingQuote struct {
	ListAmount      int `json:"listAmount"`
	Amount          int `json:"amount"`
	DiscountPercent int `json:"discountPercent"`
}

func firstWeddingDiscount(raw string, required bool) (int, error) {
	if !required {
		return 0, nil
	}
	if raw == "" {
		return 100, nil
	}
	percent, err := strconv.Atoi(raw)
	if err != nil || percent < 0 || percent > 100 {
		return 0, fmt.Errorf("SHAADI_FIRST_WEDDING_DISCOUNT_PERCENT must be a whole number from 0 to 100")
	}
	return percent, nil
}

func weddingPrice(percent int) weddingQuote {
	list := catalog[familyPassID].Amount
	return weddingQuote{ListAmount: list, Amount: (list*(100-percent) + 50) / 100, DiscountPercent: percent}
}

func (s *Shop) publicFirstWeddingOffer() *weddingQuote {
	if s == nil || s.firstWeddingDiscount == 0 || (s.firstWeddingDiscount < 100 && !s.canSellFamilyPass()) {
		return nil
	}
	quote := weddingPrice(s.firstWeddingDiscount)
	return &quote
}

type familyPassStatus struct {
	Quote         weddingQuote `json:"quote"`
	Available     bool         `json:"available"`
	OnSale        bool         `json:"onSale"`
	TestCode      bool         `json:"testCodeRequired"`
	OrderCode     string       `json:"orderCode,omitempty"`
	BundleProduct string       `json:"bundleProduct,omitempty"`
}

type passReader interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func (s *Shop) canSellFamilyPass() bool {
	return s != nil && s.acceptFamilyPass && s.packages[allInOneID] != nil
}

func (s *Shop) availableFamilyPassBundle() string {
	if s.canSellFamilyPass() {
		return allInOneID
	}
	return ""
}

func (s *Shop) familyPassStatus(ctx context.Context, db passReader, account string) (familyPassStatus, error) {
	status := familyPassStatus{OnSale: s.canSellFamilyPass(), TestCode: s.mode == "test" && s.testAccess != ""}
	var order string
	var first bool
	var pendingAmount int
	err := db.QueryRowContext(ctx, `
		WITH pending AS (
			SELECT razorpay_order_id, amount_paise, `+familyBundleSQL+` AS bundle FROM excel_orders
			WHERE workspace_account_id=$1 AND mode=$2 AND product=$3 AND paid_at IS NULL AND refunded_at IS NULL
			ORDER BY created_at DESC LIMIT 1
		)
		SELECT EXISTS (
			SELECT 1 FROM family_passes WHERE account_id=$1 AND mode=$2
			  AND consumed_at IS NULL AND revoked_at IS NULL
		), COALESCE(p.razorpay_order_id, ''), COALESCE(p.bundle, $4), COALESCE(p.amount_paise,0),
       NOT EXISTS (SELECT 1 FROM family_passes WHERE account_id=$1 AND mode=$2
         AND (consumed_at IS NOT NULL OR source='first-wedding:' || $2 || ':' || $1::uuid::text))
       AND NOT EXISTS (SELECT 1 FROM wedding_memberships m WHERE m.account_id=$1 AND m.role='owner'
         AND NOT EXISTS (SELECT 1 FROM family_passes f WHERE f.wedding_id=m.wedding_id))
		FROM (SELECT 1) AS anchor LEFT JOIN pending p ON true`,
		account, s.mode, familyPassID, s.availableFamilyPassBundle()).Scan(&status.Available, &order, &status.BundleProduct, &pendingAmount, &first)
	if err != nil {
		return status, err
	}
	status.Quote = weddingPrice(0)
	if first && !status.Available {
		status.Quote = weddingPrice(s.firstWeddingDiscount)
	}
	if order != "" {
		// Resume an outstanding order at the amount already agreed with Razorpay.
		status.Quote.Amount = pendingAmount
		status.Quote.DiscountPercent = (100*(status.Quote.ListAmount-pendingAmount) + status.Quote.ListAmount/2) / status.Quote.ListAmount
		status.OrderCode = s.accessCode(order)
	}
	if status.Quote.Amount == 0 {
		status.BundleProduct = ""
	}
	return status, nil
}

func (s *Shop) FamilyPassStatus(w http.ResponseWriter, r *http.Request, account string) {
	if s == nil {
		httpx.Reply(w, 200, familyPassStatus{})
		return
	}
	status, err := s.familyPassStatus(r.Context(), s.db, account)
	if err != nil {
		s.fail(w)
		return
	}
	httpx.Reply(w, 200, status)
}

func (s *Shop) CreateFamilyPassOrder(w http.ResponseWriter, r *http.Request, account string) {
	if s == nil {
		httpx.Fail(w, 503, "New Family Pass orders are paused.")
		return
	}
	var input struct {
		Email, TestAccess string
		ExpectedAmount    *int
		ClaimFree         bool
		Meta              *metaAttribution
	}
	if !httpx.ReadJSON(w, r, &input) {
		return
	}
	ctx := r.Context()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		s.fail(w)
		return
	}
	defer tx.Rollback()
	// Serialize checkout starts for this account so two tabs reuse the same order.
	if _, err := tx.ExecContext(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", "family-pass:"+account); err != nil {
		s.fail(w)
		return
	}
	status, err := s.familyPassStatus(ctx, tx, account)
	if err != nil {
		s.fail(w)
		return
	}
	if input.ClaimFree && status.Available {
		httpx.Reply(w, 200, status)
		return
	}
	if status.Available {
		httpx.Fail(w, 409, "You already have a Family Pass available. Return to wedding setup.")
		return
	}
	if input.ExpectedAmount != nil && *input.ExpectedAmount != status.Quote.Amount {
		httpx.Fail(w, 409, "The wedding price has changed. Refresh to see the current price.")
		return
	}
	if input.ClaimFree {
		if status.OrderCode != "" || status.Quote.Amount != 0 {
			httpx.Fail(w, 409, "The first-wedding offer has changed. Refresh to see your price.")
			return
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO family_passes(account_id,source,mode)
   VALUES ($1,$2,$3)`, account, "first-wedding:"+s.mode+":"+account, s.mode)
		if err != nil {
			s.fail(w)
			return
		}
		status.Available = true
	} else {
		if status.Quote.Amount == 0 {
			httpx.Fail(w, 409, "Your first wedding is free. Refresh to start setup.")
			return
		}
		if s.mode == "test" && s.testAccess != "" && !hmac.Equal([]byte(s.testAccess), []byte(input.TestAccess)) {
			httpx.Fail(w, 403, "Enter the private test checkout code.")
			return
		}
		email := cleanEmail(input.Email)
		if email == "" {
			httpx.Fail(w, 400, "Enter a valid email for your receipt.")
			return
		}
		if status.OrderCode == "" {
			if !status.OnSale {
				httpx.Fail(w, http.StatusServiceUnavailable, "New Family Pass orders are paused.")
				return
			}
			item, ok := catalog[familyPassID]
			if !ok {
				s.fail(w)
				return
			}
			item.Amount = status.Quote.Amount
			order, err := s.openOrder(ctx, tx, item, email, &account, s.orderAttribution(input.Meta, r.UserAgent()))
			if err != nil {
				s.fail(w)
				return
			}
			status.OrderCode = s.accessCode(order)
		}
	}
	if err := tx.Commit(); err != nil {
		s.fail(w)
		return
	}
	httpx.Reply(w, 201, status)
}

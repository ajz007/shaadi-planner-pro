package commerce

import (
	"context"
	"crypto/hmac"
	"database/sql"
	"net/http"

	"github.com/ajz007/shaadi-planner-pro/internal/httpx"
)

type familyPassStatus struct {
	Available     bool   `json:"available"`
	OnSale        bool   `json:"onSale"`
	TestCode      bool   `json:"testCodeRequired"`
	OrderCode     string `json:"orderCode,omitempty"`
	BundleProduct string `json:"bundleProduct,omitempty"`
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
	err := db.QueryRowContext(ctx, `
		WITH pending AS (
			SELECT razorpay_order_id, `+familyBundleSQL+` AS bundle FROM excel_orders
			WHERE workspace_account_id=$1 AND mode=$2 AND product=$3 AND paid_at IS NULL AND refunded_at IS NULL
			ORDER BY created_at DESC LIMIT 1
		)
		SELECT EXISTS (
			SELECT 1 FROM family_passes WHERE account_id=$1 AND mode=$2
			  AND consumed_at IS NULL AND revoked_at IS NULL
		), COALESCE(p.razorpay_order_id, ''), COALESCE(p.bundle, $4)
		FROM (SELECT 1) AS anchor LEFT JOIN pending p ON true`,
		account, s.mode, familyPassID, s.availableFamilyPassBundle()).Scan(&status.Available, &order, &status.BundleProduct)
	if order != "" {
		status.OrderCode = s.accessCode(order)
	}
	return status, err
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
	if s == nil || !s.acceptFamilyPass {
		httpx.Fail(w, 503, "New Family Pass orders are paused.")
		return
	}
	var input struct {
		Email, TestAccess string
		Meta              *metaAttribution
	}
	if !httpx.ReadJSON(w, r, &input) {
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
	if status.Available {
		httpx.Fail(w, 409, "You already have a Family Pass available. Return to wedding setup.")
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
		order, err := s.openOrder(ctx, tx, item, email, &account, s.orderAttribution(input.Meta, r.UserAgent()))
		if err != nil {
			s.fail(w)
			return
		}
		status.OrderCode = s.accessCode(order)
	}
	if err := tx.Commit(); err != nil {
		s.fail(w)
		return
	}
	httpx.Reply(w, 201, status)
}

package workspace

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/ajz007/shaadi-planner-pro/internal/httpx"
)

type financeRecord struct {
	ID       string   `json:"id"`
	Values   []string `json:"values"`
	Revision int      `json:"revision"`
}

type vendorPayment struct {
	ID     string `json:"id"`
	Amount int64  `json:"amount"`
	Date   string `json:"date"`
	Method string `json:"method"`
	Notes  string `json:"notes"`
	Voided bool   `json:"voided"`
}

type vendorContract struct {
	financeRecord
	VendorID    string          `json:"vendorId"`
	Value       int64           `json:"value"`
	OpeningPaid int64           `json:"openingPaid"`
	Paid        int64           `json:"paid"`
	Payments    []vendorPayment `json:"payments"`
}

type weddingFinance struct {
	Vendors   []financeRecord  `json:"vendors"`
	Contracts []vendorContract `json:"contracts"`
	Budgets   []categoryBudget `json:"budgets"`
}

type categoryBudget struct {
	ID        string `json:"id"`
	Category  string `json:"category"`
	Budget    int64  `json:"budget"`
	Committed int64  `json:"committed"`
	Paid      int64  `json:"paid"`
	Revision  int    `json:"revision"`
}

// Category totals use the contract ledger, including opening balances and voids.
// Imported category paid totals are retained only where no contract exists.
func rollupBudgets(imported []importRow, saved []categoryBudget, contracts []vendorContract) []categoryBudget {
	byCategory := map[string]*categoryBudget{}
	key := func(category string) string { return strings.ToLower(strings.TrimSpace(category)) }
	get := func(category string) *categoryBudget {
		k := key(category)
		if byCategory[k] == nil {
			byCategory[k] = &categoryBudget{Category: strings.TrimSpace(category)}
		}
		return byCategory[k]
	}
	for _, row := range imported {
		if len(row.Values) < 3 || key(row.Values[0]) == "" {
			continue
		}
		item := get(row.Values[0])
		budget, _ := importPaise(row.Values[1])
		paid, _ := importPaise(row.Values[2])
		item.Budget += budget
		item.Paid += paid
	}
	for _, row := range saved {
		item := get(row.Category)
		item.ID, item.Revision, item.Budget = row.ID, row.Revision, row.Budget
	}
	seen := map[string]bool{}
	for _, contract := range contracts {
		item := get(contract.Values[0])
		k := key(item.Category)
		if !seen[k] {
			item.Paid = 0
			seen[k] = true
		}
		item.Committed += contract.Value
		item.Paid += contract.Paid
	}
	result := make([]categoryBudget, 0, len(byCategory))
	for _, item := range byCategory {
		result = append(result, *item)
	}
	sort.Slice(result, func(i, j int) bool { return key(result[i].Category) < key(result[j].Category) })
	return result
}

const financeOwner = `EXISTS (SELECT 1 FROM wedding_memberships
	WHERE wedding_id = $1 AND account_id = $2 AND role = 'owner')`

func listFinance(ctx context.Context, db workspaceRowsQueryer, wedding, actor string) (weddingFinance, error) {
	vendors, err := queryWorkspace(ctx, db, func(rows *sql.Rows, vendor *financeRecord) error {
		var payload []byte
		if err := rows.Scan(&vendor.ID, &vendor.Revision, &payload); err != nil {
			return err
		}
		return json.Unmarshal(payload, &vendor.Values)
	}, `SELECT id, revision, fields FROM wedding_vendors WHERE wedding_id = $1 AND `+financeOwner+
		` ORDER BY fields->>0, fields->>1, id`, wedding, actor)
	if err != nil {
		return weddingFinance{}, err
	}
	contracts, err := queryWorkspace(ctx, db, func(rows *sql.Rows, contract *vendorContract) error {
		var payload, payments []byte
		var category, vendor string
		if err := rows.Scan(&contract.ID, &contract.Revision, &contract.VendorID, &contract.Value,
			&contract.OpeningPaid, &contract.Paid, &payload, &payments, &category, &vendor); err != nil {
			return err
		}
		if err := json.Unmarshal(payload, &contract.Values); err != nil {
			return err
		}
		if err := json.Unmarshal(payments, &contract.Payments); err != nil {
			return err
		}
		status := "Booked"
		switch {
		case contract.Paid >= contract.Value && contract.Paid > 0:
			status = "Paid"
		case contract.Paid > 0:
			status = "Part Paid"
		}
		contract.Values[0], contract.Values[1], contract.Values[2] = category, vendor, status
		contract.Values[3], contract.Values[4], contract.Values[5] = financeAmount(contract.Value),
			financeAmount(contract.Paid), financeAmount(contract.Value-contract.Paid)
		return nil
	}, `SELECT c.id, c.revision, COALESCE(c.vendor_id::text, ''), c.value_paise, c.opening_paid_paise,
		c.opening_paid_paise + COALESCE(p.paid, 0), c.fields, COALESCE(p.items, '[]'::jsonb),
		COALESCE(v.fields->>0, c.fields->>0), COALESCE(v.fields->>1, c.fields->>1)
		FROM wedding_contracts c LEFT JOIN wedding_vendors v ON v.wedding_id = c.wedding_id AND v.id = c.vendor_id
		LEFT JOIN LATERAL (
			SELECT sum(amount_paise) FILTER (WHERE voided_at IS NULL) AS paid,
				jsonb_agg(jsonb_build_object('id', id, 'amount', amount_paise, 'date', paid_on, 'method', method,
					'notes', notes, 'voided', voided_at IS NOT NULL) ORDER BY paid_on, id) AS items
			FROM wedding_vendor_payments WHERE contract_id = c.id
		) p ON true
		WHERE c.wedding_id = $1 AND `+financeOwner+` ORDER BY 9, 10, c.id`, wedding, actor)
	if err != nil {
		return weddingFinance{}, err
	}
	sections, err := queryWorkspace(ctx, db, func(rows *sql.Rows, section *importSection) error {
		var payload []byte
		if err := rows.Scan(&payload); err != nil {
			return err
		}
		return json.Unmarshal(payload, section)
	}, `SELECT payload FROM wedding_imported_sections WHERE wedding_id = $1 AND section_name = 'Budget vs Actual' AND `+financeOwner, wedding, actor)
	if err != nil {
		return weddingFinance{}, err
	}
	saved, err := queryWorkspace(ctx, db, func(rows *sql.Rows, budget *categoryBudget) error {
		return rows.Scan(&budget.ID, &budget.Category, &budget.Budget, &budget.Revision)
	}, `SELECT id, category, budget_paise, revision FROM wedding_category_budgets WHERE wedding_id = $1 AND `+financeOwner, wedding, actor)
	if err != nil {
		return weddingFinance{}, err
	}
	var imported []importRow
	for _, section := range sections {
		imported = append(imported, section.Rows...)
	}
	return weddingFinance{Vendors: vendors, Contracts: contracts, Budgets: rollupBudgets(imported, saved, contracts)}, nil
}

func financeAmount(paise int64) string {
	return strconv.FormatFloat(float64(paise)/100, 'f', 2, 64)
}

type financeInput struct {
	Values      []string
	VendorID    string
	Revision    int
	Amount      string
	Date        string
	Method      string
	Notes       string
	VoidPayment string
	Category    string
	Budget      string
}

var decimalAmount = regexp.MustCompile(`^[0-9]+(\.[0-9]{1,2})?$`)

func parseFinanceAmount(value string) (int64, bool) {
	if value != "" && !decimalAmount.MatchString(value) {
		return 0, false
	}
	return importPaise(value)
}

func (a *workspaceHTTP) requireFinanceOwner(ctx context.Context, wedding, actor string) error {
	var allowed bool
	if err := a.store.db.QueryRowContext(ctx, "SELECT "+financeOwner, wedding, actor).Scan(&allowed); err != nil {
		return err
	}
	if !allowed {
		return errWorkspaceNotFound
	}
	return nil
}

func (a *workspaceHTTP) finance(w http.ResponseWriter, r *http.Request, actor string) {
	wedding := r.PathValue("wedding")
	if !workspaceUUID.MatchString(wedding) {
		workspaceFailure(w, errWorkspaceNotFound)
		return
	}
	if err := a.requireFinanceOwner(r.Context(), wedding, actor); err != nil {
		workspaceFailure(w, err)
		return
	}
	records, err := listFinance(r.Context(), a.store.db, wedding, actor)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	httpx.Reply(w, http.StatusOK, records)
}

func (a *workspaceHTTP) saveFinance(w http.ResponseWriter, r *http.Request, actor string) {
	wedding, kind, id := r.PathValue("wedding"), r.PathValue("kind"), r.PathValue("record")
	if !workspaceUUID.MatchString(wedding) || (id != "new" && !workspaceUUID.MatchString(id)) {
		workspaceFailure(w, errWorkspaceNotFound)
		return
	}
	ctx := r.Context()
	if err := a.requireFinanceOwner(ctx, wedding, actor); err != nil {
		workspaceFailure(w, err)
		return
	}
	var input financeInput
	if !httpx.ReadJSON(w, r, &input) {
		return
	}
	var err error
	switch kind {
	case "budgets":
		id, err = a.store.saveCategoryBudget(ctx, wedding, actor, id, input)
	case "vendors":
		id, err = a.store.saveVendor(ctx, wedding, actor, id, input)
	case "contracts":
		id, err = a.store.saveContract(ctx, wedding, actor, id, input)
	case "payments":
		err = a.store.changePayment(ctx, wedding, actor, id, input)
	default:
		err = errWorkspaceNotFound
	}
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	httpx.Reply(w, http.StatusOK, map[string]string{"id": id})
}

func (s *workspaceStore) saveCategoryBudget(ctx context.Context, wedding, actor, id string, input financeInput) (string, error) {
	category := strings.TrimSpace(input.Category)
	budget, valid := parseFinanceAmount(input.Budget)
	if category == "" || utf8.RuneCountInString(category) > 120 || input.Budget == "" || !valid {
		return "", errWorkspaceInput
	}
	var err error
	if id == "new" {
		err = scanWorkspace(s.db.QueryRowContext(ctx, `INSERT INTO wedding_category_budgets (wedding_id, category, budget_paise)
			SELECT $1, $3, $4 WHERE `+financeOwner+`
			ON CONFLICT (wedding_id, lower(trim(category))) DO NOTHING RETURNING id`, wedding, actor, category, budget), &id)
	} else {
		err = scanWorkspace(s.db.QueryRowContext(ctx, `UPDATE wedding_category_budgets SET budget_paise=$3, revision=revision+1
			WHERE wedding_id=$1 AND id=$4 AND revision=$5 AND lower(trim(category))=lower(trim($6::text)) AND `+financeOwner+`
			RETURNING id`, wedding, actor, budget, id, input.Revision, category), &id)
	}
	if err == errWorkspaceNotFound {
		err = errWorkspaceConflict
	}
	return id, err
}

func cleanFinanceFields(values []string, count int) bool {
	if len(values) != count {
		return false
	}
	for i := range values {
		values[i] = strings.TrimSpace(values[i])
		if utf8.RuneCountInString(values[i]) > 500 {
			return false
		}
	}
	return true
}

func (s *workspaceStore) saveVendor(ctx context.Context, wedding, actor, id string, input financeInput) (string, error) {
	values := input.Values
	if !cleanFinanceFields(values, 10) || values[0] == "" || values[1] == "" {
		return "", errWorkspaceInput
	}
	for _, index := range []int{2, 8} {
		if _, valid := parseFinanceAmount(values[index]); !valid {
			return "", errWorkspaceInput
		}
	}
	payload, err := json.Marshal(values)
	if err != nil {
		return "", err
	}
	if id == "new" {
		err = scanWorkspace(s.db.QueryRowContext(ctx, `INSERT INTO wedding_vendors (wedding_id, fields)
			SELECT $1, $3::jsonb WHERE `+financeOwner+` RETURNING id`, wedding, actor, payload), &id)
	} else {
		err = scanWorkspace(s.db.QueryRowContext(ctx, `UPDATE wedding_vendors SET fields = $3::jsonb, revision = revision + 1
			WHERE wedding_id = $1 AND id = $4 AND revision = $5 AND `+financeOwner+` RETURNING id`,
			wedding, actor, payload, id, input.Revision), &id)
		if err == errWorkspaceNotFound {
			err = errWorkspaceConflict
		}
	}
	return id, err
}

func (s *workspaceStore) saveContract(ctx context.Context, wedding, actor, id string, input financeInput) (string, error) {
	values := input.Values
	if !cleanFinanceFields(values, 10) || values[3] == "" || (input.VendorID == "" && id == "new") ||
		(input.VendorID != "" && !workspaceUUID.MatchString(input.VendorID)) {
		return "", errWorkspaceInput
	}
	value, valid := parseFinanceAmount(values[3])
	if !valid {
		return "", errWorkspaceInput
	}
	if values[6] != "" {
		if _, err := time.Parse(time.DateOnly, values[6]); err != nil {
			return "", errWorkspaceInput
		}
	}
	// Vendor labels and paid amounts are projected from the linked records.
	values[2], values[4], values[5] = "", "", ""
	payload, err := json.Marshal(values)
	if err != nil {
		return "", err
	}
	if id == "new" {
		err = scanWorkspace(s.db.QueryRowContext(ctx, `INSERT INTO wedding_contracts (wedding_id, vendor_id, fields, value_paise)
			SELECT $1, $3, $4::jsonb, $5 WHERE `+financeOwner+` RETURNING id`,
			wedding, actor, input.VendorID, payload, value), &id)
		return id, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	paid, err := lockContract(ctx, tx, wedding, actor, id, input.Revision)
	if err != nil {
		return "", err
	}
	if value < paid {
		return "", errWorkspaceInput
	}
	_, err = tx.ExecContext(ctx, `UPDATE wedding_contracts SET vendor_id = COALESCE(NULLIF($2, '')::uuid, vendor_id),
		fields = jsonb_set(jsonb_set($3::jsonb, '{0}', fields->0), '{1}', fields->1), value_paise = $4,
		revision = revision + 1 WHERE id = $1`, id, input.VendorID, payload, value)
	if err != nil {
		return "", err
	}
	return id, tx.Commit()
}

func lockContract(ctx context.Context, tx *sql.Tx, wedding, actor, id string, revision int) (int64, error) {
	var paid int64
	err := scanWorkspace(tx.QueryRowContext(ctx, `SELECT opening_paid_paise FROM wedding_contracts
		WHERE wedding_id = $1 AND id = $3 AND revision = $4 AND `+financeOwner+` FOR UPDATE`,
		wedding, actor, id, revision), &paid)
	if err == errWorkspaceNotFound {
		return 0, errWorkspaceConflict
	}
	if err != nil {
		return 0, err
	}
	var recorded int64
	err = tx.QueryRowContext(ctx, `SELECT COALESCE(sum(amount_paise), 0) FROM wedding_vendor_payments
		WHERE contract_id = $1 AND voided_at IS NULL`, id).Scan(&recorded)
	return paid + recorded, err
}

func (s *workspaceStore) changePayment(ctx context.Context, wedding, actor, id string, input financeInput) error {
	if id == "new" {
		return errWorkspaceInput
	}
	amount, valid := parseFinanceAmount(input.Amount)
	method, notes := strings.TrimSpace(input.Method), strings.TrimSpace(input.Notes)
	if input.VoidPayment == "" {
		_, dateErr := time.Parse(time.DateOnly, input.Date)
		if !valid || amount <= 0 || dateErr != nil || utf8.RuneCountInString(method) > 120 || utf8.RuneCountInString(notes) > 500 {
			return errWorkspaceInput
		}
	} else if !workspaceUUID.MatchString(input.VoidPayment) {
		return errWorkspaceInput
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	paid, err := lockContract(ctx, tx, wedding, actor, id, input.Revision)
	if err != nil {
		return err
	}
	if input.VoidPayment != "" {
		var voided string
		err = scanWorkspace(tx.QueryRowContext(ctx, `UPDATE wedding_vendor_payments SET voided_at = now()
			WHERE id = $1 AND contract_id = $2 AND voided_at IS NULL RETURNING id`, input.VoidPayment, id), &voided)
	} else {
		var value int64
		if err := tx.QueryRowContext(ctx, "SELECT value_paise FROM wedding_contracts WHERE id = $1", id).Scan(&value); err != nil {
			return err
		}
		if amount > value-paid {
			return errWorkspaceInput
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO wedding_vendor_payments (contract_id, amount_paise, paid_on, method, notes)
			VALUES ($1, $2, $3, $4, $5)`, id, amount, input.Date, method, notes)
	}
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "UPDATE wedding_contracts SET revision = revision + 1 WHERE id = $1", id); err != nil {
		return err
	}
	return tx.Commit()
}

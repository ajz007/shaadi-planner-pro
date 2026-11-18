package workspace

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"
)

func TestBudgetRollup(t *testing.T) {
	imported := []importRow{
		{Values: []string{"Decor", "300000", "50000"}},
		{Values: []string{"Travel", "10000", "2500"}},
	}
	saved := []categoryBudget{{ID: "saved", Category: "decor", Budget: 32000000, Revision: 2}}
	contracts := []vendorContract{
		{financeRecord: financeRecord{Values: []string{" DECOR "}}, Value: 29000000, Paid: 1000000},
		{financeRecord: financeRecord{Values: []string{"Decor"}}, Value: 2000000, Paid: 500000},
		{financeRecord: financeRecord{Values: []string{"Hotel/Villa"}}, Value: 4800000, Paid: 10000},
	}
	got := rollupBudgets(imported, saved, contracts)
	if len(got) != 3 {
		t.Fatalf("missing categories: %+v", got)
	}
	if got[0].ID != "saved" || got[0].Budget != 32000000 || got[0].Committed != 31000000 || got[0].Paid != 1500000 {
		t.Fatalf("category contracts, saved budget or imported payments counted incorrectly: %+v", got[0])
	}
	if got[1].Budget != 0 || got[1].Committed != 4800000 || got[1].Paid != 10000 {
		t.Fatalf("contract without budget missing: %+v", got[1])
	}
	if got[2].Paid != 250000 {
		t.Fatalf("unlinked imported actuals lost: %+v", got[2])
	}
}

func TestLiveCategoryBudget(t *testing.T) {
	connection := os.Getenv("SHAADI_TEST_DATABASE_URL")
	if connection == "" {
		t.Skip("set SHAADI_TEST_DATABASE_URL to a dedicated test database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	store, err := openWorkspace(ctx, connection)
	if err != nil {
		t.Fatal(err)
	}
	defer store.db.Close()
	actor, err := store.syncAccount(ctx, "budget-test:"+time.Now().Format(time.RFC3339Nano), "Budget tester")
	requireWorkspaceID(t, actor, err)
	wedding, err := store.createWedding(ctx, actor, "Budget test", "2027-02-15", "Asia/Kolkata")
	requireWorkspaceID(t, wedding, err)
	defer func() {
		cleanup, stop := context.WithTimeout(context.Background(), 5*time.Second)
		defer stop()
		store.db.ExecContext(cleanup, "DELETE FROM weddings WHERE id=$1", wedding)
		store.db.ExecContext(cleanup, "DELETE FROM workspace_accounts WHERE id=$1", actor)
	}()
	vendor, err := store.saveVendor(ctx, wedding, actor, "new", financeInput{Values: []string{"Decor", "Decorator", "290000", "", "", "", "", "", "", ""}})
	requireWorkspaceID(t, vendor, err)
	contract, err := store.saveContract(ctx, wedding, actor, "new", financeInput{VendorID: vendor, Values: []string{"", "", "", "290000", "", "", "", "", "", ""}})
	requireWorkspaceID(t, contract, err)
	read := func() weddingFinance {
		t.Helper()
		data, err := listFinance(ctx, store.db, wedding, actor)
		if err != nil {
			t.Fatal(err)
		}
		if len(data.Budgets) != 1 {
			t.Fatalf("missing category: %+v", data)
		}
		return data
	}
	if got := read().Budgets[0]; got.Committed != 29000000 || got.Paid != 0 || got.Budget != 0 {
		t.Fatalf("blank wedding: %+v", got)
	}
	budgetID, err := store.saveCategoryBudget(ctx, wedding, actor, "new", financeInput{Category: "Decor", Budget: "300000"})
	requireWorkspaceID(t, budgetID, err)
	if err := store.changePayment(ctx, wedding, actor, contract, financeInput{Revision: 1, Amount: "10000.25", Date: "2027-01-01"}); err != nil {
		t.Fatal(err)
	}
	data := read()
	if got := data.Budgets[0]; got.Paid != 1000025 || got.Budget != 30000000 {
		t.Fatalf("payment not reflected in budget: %+v", got)
	}
	if err := store.changePayment(ctx, wedding, actor, contract, financeInput{Revision: 2, VoidPayment: data.Contracts[0].Payments[0].ID}); err != nil {
		t.Fatal(err)
	}
	if got := read().Budgets[0].Paid; got != 0 {
		t.Fatalf("void not reflected: %d", got)
	}
	_, err = store.saveCategoryBudget(ctx, wedding, actor, budgetID, financeInput{Category: "Decor", Budget: "310000", Revision: 1})
	if err != nil {
		t.Fatal(err)
	}
	_, err = store.saveCategoryBudget(ctx, wedding, actor, budgetID, financeInput{Category: "Decor", Budget: "320000", Revision: 1})
	if !errors.Is(err, errWorkspaceConflict) {
		t.Fatalf("stale edit not rejected: %v", err)
	}
	_, err = store.saveCategoryBudget(ctx, wedding, actor, "new", financeInput{Category: " decor ", Budget: "1"})
	if !errors.Is(err, errWorkspaceConflict) {
		t.Fatalf("duplicate category not rejected: %v", err)
	}
	_, err = store.saveCategoryBudget(ctx, wedding, actor, "new", financeInput{Category: "Travel", Budget: "-1"})
	if !errors.Is(err, errWorkspaceInput) {
		t.Fatalf("negative budget accepted: %v", err)
	}
}

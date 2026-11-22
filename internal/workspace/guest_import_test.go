package workspace

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"os"
	"slices"
	"strings"
	"testing"
	"time"
)

func TestGuestImportCSVReview(t *testing.T) {
	const csv = "\ufeffGuest Name,Household,Guest ID,Arrival Date,Arrival Time,RSVP Status\r\n" +
		"  rajiv  SHARMA ,Sharma Family,G001,,,Declined\r\n" +
		"Different Person,Sharma Family,G001,,,\r\n" +
		"Rajiv Sharma,,,,,\r\n" +
		"\"Mina, Jr.\",My Family,G030,2027-02-15,8:30 AM,\r\n" +
		"\"mina, jr.\",MY FAMILY,,,,\r\n" +
		"A New Guest,Other Family,,tomorrow,,\r\n" +
		"Rajiv Sharma,Other Family,,,,\r\n"
	rows, err := readGuestImport([]byte(csv), "csv")
	if err != nil {
		t.Fatal(err)
	}
	review := reviewGuestRows(rows, []guestIdentity{{"G001", "Rajiv Sharma", "Sharma Family"}})
	var got []string
	for _, row := range review.Rows {
		got = append(got, row.Status)
	}
	want := []string{"duplicate", "conflict", "conflict", "new", "duplicate", "invalid", "new"}
	if !slices.Equal(got, want) || review.Ready != 2 {
		t.Fatalf("got statuses %v and %d ready, want %v and 2 ready", got, review.Ready, want)
	}
	if guest := review.Rows[3]; guest.Row != 5 || guest.Name != "Mina, Jr." ||
		guest.RSVP != "Pending" || guest.ArrivalDate != "2027-02-15" || guest.ArrivalTime != "08:30" {
		t.Fatalf("unexpected parsed guest: %+v", guest)
	}
}

func TestGuestImportEnglishLaunchWorkbook(t *testing.T) {
	rows, err := readGuestImport(launchWorkbook(t, "DEMO"), "xlsx")
	if err != nil || len(rows) != 14 {
		t.Fatalf("filled workbook returned %d guests: %v", len(rows), err)
	}
	for _, row := range rows {
		if row.Status != "new" {
			t.Fatalf("unexpected problem on row %d: %s", row.Row, row.Reason)
		}
	}
	if rows[0].Name != "Rajiv Sharma" || rows[0].ArrivalTime != "08:30" || rows[0].StayRequired != "Yes" {
		t.Fatalf("wrong first guest: %+v", rows[0])
	}
	_, err = readGuestImport(launchWorkbook(t, "BLANK"), "xlsx")
	if err == nil || !strings.Contains(err.Error(), "no guest rows") {
		t.Fatalf("expected blank workbook to have no guest rows, got %v", err)
	}
}

func TestGuestImportAddOnly(t *testing.T) {
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

	actor, err := store.syncAccount(ctx, "guest-import:"+time.Now().Format(time.RFC3339Nano), "Owner")
	if err != nil {
		t.Fatal(err)
	}
	defer store.db.ExecContext(ctx, "DELETE FROM workspace_accounts WHERE id=$1", actor)
	wedding, err := store.createWedding(ctx, actor, "Guest import test", "2027-02-15", "Asia/Kolkata")
	if err != nil {
		t.Fatal(err)
	}
	defer store.db.ExecContext(ctx, "DELETE FROM weddings WHERE id=$1", wedding)
	for _, statement := range []string{
		`INSERT INTO wedding_guests (wedding_id, workbook_id, name, household, wedding_rsvp, arrival_time)
			VALUES ($1, 'G001', 'Rajiv Sharma', 'Sharma Family', 'Confirmed', '08:30')`,
		`INSERT INTO wedding_logistics_records (wedding_id, section_name, payload) VALUES ($1, 'Accommodation',
			'{"values":["Hotel","101","","","","","","","","","","","","",""],"guestLinks":{"3":"G001"}}')`,
		`WITH pickup AS (INSERT INTO wedding_pickups (wedding_id, pickup_point, drop_point)
			VALUES ($1, 'Airport', 'Hotel') RETURNING id)
		INSERT INTO wedding_pickup_passengers (wedding_id, pickup_id, guest_id, position, arrival_time)
		SELECT g.wedding_id, pickup.id, g.id, 1, '08:30' FROM pickup, wedding_guests g
		WHERE g.wedding_id=$1 AND g.workbook_id='G001'`,
	} {
		if _, err := store.db.ExecContext(ctx, statement, wedding); err != nil {
			t.Fatal(err)
		}
	}

	app := workspaceHTTP{store: store}
	list := func() []liveGuest {
		t.Helper()
		req := httptest.NewRequest("GET", "/", nil).WithContext(ctx)
		req.SetPathValue("wedding", wedding)
		res := httptest.NewRecorder()
		app.guests(res, req, actor)
		var guests []liveGuest
		if res.Code != 200 || json.Unmarshal(res.Body.Bytes(), &guests) != nil {
			t.Fatalf("could not read guests: %s", res.Body)
		}
		return guests
	}
	upload := func(file, review string, want int) guestImportReview {
		t.Helper()
		req := httptest.NewRequest("POST", "/", strings.NewReader(file)).WithContext(ctx)
		req.SetPathValue("wedding", wedding)
		req.Header.Set("X-Guest-Import-Format", "csv")
		req.Header.Set("X-Guest-Import-Review", review)
		res := httptest.NewRecorder()
		app.importGuests(res, req, actor)
		var result guestImportReview
		if res.Code != want || json.Unmarshal(res.Body.Bytes(), &result) != nil {
			t.Fatalf("guest import returned %d, want %d: %s", res.Code, want, res.Body)
		}
		return result
	}
	before := list()
	if len(before) != 1 || before[0].RSVP != "Confirmed" || len(before[0].Links) != 2 {
		t.Fatalf("fixture guest is missing an RSVP or a link: %+v", before)
	}
	const file = "Guest Name,Household,Guest ID,RSVP Status\nChanged Name,,G001,Declined\nNew Guest,Another Family,,Pending\n"
	first := upload(file, "", 200)
	if first.Ready != 1 || first.Rows[0].Status != "conflict" || len(list()) != 1 {
		t.Fatalf("unexpected preview: %+v", first)
	}
	upload(strings.Replace(file, "New Guest", "Changed upload", 1), first.Review, 409)
	upload(file, first.Review, 200)
	if retry := upload(file, first.Review, 409); retry.Ready != 0 {
		t.Fatalf("repeat import would add duplicates: %+v", retry)
	}
	after := list()
	if len(after) != 2 || after[0].Name != "New Guest" || after[0].RSVP != "Pending" {
		t.Fatalf("only the new guest should be added: %+v", after)
	}
	original, _ := json.Marshal(before[0])
	current, _ := json.Marshal(after[1])
	if string(original) != string(current) {
		t.Fatal("import changed the original guest's RSVP, arrival or room and pickup links")
	}
}

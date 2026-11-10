package main

import (
	"archive/zip"
	"io"
	"os"
	"strings"
	"testing"
)

func launchWorkbook(t *testing.T, edition string) []byte {
	t.Helper()
	filename := os.Getenv("SHAADI_TEST_WORKBOOK_PACKAGE")
	if filename == "" {
		t.Skip("set SHAADI_TEST_WORKBOOK_PACKAGE to the original English v1.3.1 launch ZIP")
	}
	archive, err := zip.OpenReader(filename)
	if err != nil {
		t.Fatal(err)
	}
	defer archive.Close()
	for _, file := range archive.File {
		if !strings.HasSuffix(file.Name, "_"+edition+".xlsx") {
			continue
		}
		source, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		defer source.Close()
		content, err := io.ReadAll(source)
		if err != nil {
			t.Fatal(err)
		}
		return content
	}
	t.Fatalf("launch ZIP has no %s workbook", edition)
	return nil
}

func TestEnglishLaunchWorkbook(t *testing.T) {
	plan, issues, err := parseEnglishWorkbook(launchWorkbook(t, "DEMO"), "Asia/Kolkata")
	if err != nil || len(issues) > 0 {
		t.Fatalf("filled workbook rejected: %v %v", err, issues)
	}
	if plan.Name != "Aarav & Meera Wedding" || plan.Date != "2027-02-15" || len(plan.Sections) != 14 {
		t.Fatalf("unexpected wedding metadata: %s %s %d", plan.Name, plan.Date, len(plan.Sections))
	}
	totals := importedTotals(plan.Sections)
	if totals.Guests != 14 || totals.Confirmed != 9 || totals.Rooms != 4 ||
		totals.PaidPaise != 28700000 || totals.VendorDuePaise != 85500000 {
		t.Fatalf("unexpected totals: %+v", totals)
	}
	var found bool
	for _, section := range plan.Sections {
		if section.Name == "Accommodation" {
			found = section.Rows[0].Guests[3] == "G001" && section.Rows[0].Guests[4] == "G002"
		}
	}
	if !found {
		t.Fatal("room occupant links were not preserved")
	}
	blank, issues, err := parseEnglishWorkbook(launchWorkbook(t, "BLANK"), "Asia/Kolkata")
	if err != nil || len(issues) != 2 {
		t.Fatalf("blank workbook should need only a wedding name and date: %v %v", err, issues)
	}
	if total := importedTotals(blank.Sections); total.Guests != 0 || total.Rooms != 0 || total.PaidPaise != 0 {
		t.Fatalf("empty template rows were treated as data: %+v", total)
	}
}

func TestWorkbookValidationReportsDuplicateAndMissingGuest(t *testing.T) {
	guest := make([]string, 21)
	guest[0], guest[1] = "G001", "Guest"
	room := make([]string, 16)
	room[3] = "G099 | Unknown"
	plan := importedWorkbook{Sections: []importSection{
		{Name: "Settings", Rows: []importRow{{Number: 5, Values: []string{"Wedding Name", "Wedding"}}, {Number: 6, Values: []string{"Wedding Date", "2027-02-15"}}}},
		{Name: "Guest List", Rows: []importRow{{Number: 5, Values: guest}, {Number: 6, Values: guest}}},
		{Name: "Accommodation", Columns: []string{"Hotel", "Room", "Room Type", "Primary Guest"}, Rows: []importRow{{Number: 7, Values: room}}},
	}}
	issues := validateImportedWorkbook(&plan)
	if len(issues) != 2 || issues[0].Sheet != "Guest List" || issues[0].Row != 6 ||
		issues[1].Sheet != "Accommodation" || issues[1].Row != 7 {
		t.Fatalf("wrong row-level issues: %+v", issues)
	}
}

func TestGuestArrivalTimeValidation(t *testing.T) {
	rows := []importRow{}
	for i, value := range []string{"0.3541666666666666", "8:30am", "afternoon"} {
		guest := make([]string, 21)
		guest[0], guest[1], guest[12] = []string{"G001", "G002", "G003"}[i], "Guest", value
		rows = append(rows, importRow{Number: i + 5, Values: guest})
	}
	plan := importedWorkbook{Sections: []importSection{
		{Name: "Settings", Rows: []importRow{{Number: 5, Values: []string{"Wedding Name", "Wedding"}}, {Number: 6, Values: []string{"Wedding Date", "2027-02-15"}}}},
		{Name: "Guest List", Rows: rows},
	}}
	issues := validateImportedWorkbook(&plan)
	if len(issues) != 1 || issues[0].Sheet != "Guest List" || issues[0].Row != 7 ||
		rows[0].Values[12] != "08:30" || rows[1].Values[12] != "08:30" {
		t.Fatalf("incorrect arrival normalization or validation: %+v", issues)
	}
}

package main

import (
	"archive/zip"
	"bytes"
	_ "embed"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"math"
	"path"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
)

const workbookUploadLimit = 2 << 20
const workbookExpandedLimit = 24 << 20

// The published English sample supplies the column contract for v1.3.1.
//
//go:embed web/src/workbook-demo.json
var englishWorkbookContract []byte

type importedWorkbook struct {
	Name     string          `json:"name"`
	Date     string          `json:"date"`
	TimeZone string          `json:"timeZone"`
	Sections []importSection `json:"sections"`
}

type importSection struct {
	Name    string      `json:"name"`
	Columns []string    `json:"columns"`
	Rows    []importRow `json:"rows"`
}

type importRow struct {
	Number int            `json:"number"`
	Values []string       `json:"values"`
	Guests map[int]string `json:"guestLinks,omitempty"`
}

type importIssue struct {
	Sheet   string `json:"sheet"`
	Row     int    `json:"row"`
	Message string `json:"message"`
}

type sheetCell struct {
	Reference string   `xml:"r,attr"`
	Type      string   `xml:"t,attr"`
	Value     string   `xml:"v"`
	Formula   *string  `xml:"f"`
	Inline    richText `xml:"is"`
}

type richText struct {
	Text string `xml:"t"`
	Runs []struct {
		Text string `xml:"t"`
	} `xml:"r"`
}

func (t richText) value() string {
	var out strings.Builder
	out.WriteString(t.Text)
	for _, run := range t.Runs {
		out.WriteString(run.Text)
	}
	return out.String()
}

type xlsxReader struct {
	parts  map[string]*zip.File
	shared []richText
}

func newXLSX(content []byte) (*xlsxReader, error) {
	if len(content) == 0 || len(content) > workbookUploadLimit {
		return nil, errors.New("choose an .xlsx workbook smaller than 2 MB")
	}
	archive, err := zip.NewReader(bytes.NewReader(content), int64(len(content)))
	if err != nil || len(archive.File) > 200 {
		return nil, errors.New("could not read this .xlsx workbook")
	}
	book := &xlsxReader{parts: make(map[string]*zip.File)}
	var expanded uint64
	for _, part := range archive.File {
		if part.UncompressedSize64 > workbookExpandedLimit || expanded+part.UncompressedSize64 > workbookExpandedLimit {
			return nil, errors.New("the workbook expands beyond the import limit")
		}
		if _, exists := book.parts[part.Name]; exists {
			return nil, errors.New("the workbook contains duplicate parts")
		}
		expanded += part.UncompressedSize64
		book.parts[part.Name] = part
	}
	if _, exists := book.parts["xl/sharedStrings.xml"]; exists {
		var strings struct {
			Items []richText `xml:"si"`
		}
		if err := book.read("xl/sharedStrings.xml", &strings); err != nil {
			return nil, err
		}
		book.shared = strings.Items
	}
	return book, nil
}

func (b *xlsxReader) read(name string, output any) error {
	part := b.parts[name]
	if part == nil {
		return errors.New("a required workbook part is missing")
	}
	file, err := part.Open()
	if err != nil {
		return errors.New("a workbook part could not be opened")
	}
	defer file.Close()
	// Read through EOF so the ZIP checksum is verified.
	content, err := io.ReadAll(io.LimitReader(file, int64(part.UncompressedSize64)+1))
	if err != nil || uint64(len(content)) != part.UncompressedSize64 || xml.Unmarshal(content, output) != nil {
		return errors.New("a workbook part is invalid")
	}
	return nil
}

func (b *xlsxReader) value(cell sheetCell) (string, error) {
	value := cell.Value
	switch cell.Type {
	case "s":
		index, err := strconv.Atoi(value)
		if err != nil || index < 0 || index >= len(b.shared) {
			return "", errors.New("invalid shared text reference")
		}
		value = b.shared[index].value()
	case "inlineStr":
		value = cell.Inline.value()
	}
	value = strings.TrimSpace(value)
	if len(value) > 4000 {
		return "", errors.New("cell exceeds 4,000 bytes")
	}
	return value, nil
}

var cellAddress = regexp.MustCompile(`^([A-Z]{1,3})([1-9][0-9]*)$`)

func xlsxColumn(reference string, row int) (int, error) {
	match := cellAddress.FindStringSubmatch(reference)
	if match == nil || match[2] != strconv.Itoa(row) {
		return 0, errors.New("invalid worksheet cell address")
	}
	column := 0
	for _, char := range match[1] {
		column = column*26 + int(char-'A'+1)
	}
	return column - 1, nil
}

func readImportSection(book *xlsxReader, file string, section importSection) (importSection, []importIssue, error) {
	var data struct {
		Rows []struct {
			Number int         `xml:"r,attr"`
			Cells  []sheetCell `xml:"c"`
		} `xml:"sheetData>row"`
	}
	if err := book.read(file, &data); err != nil {
		return section, nil, err
	}
	if len(data.Rows) > 5000 {
		return section, nil, errors.New("a worksheet exceeds the row limit")
	}
	issues := []importIssue{}
	seen := make(map[int]bool)
	// Formula-derived output is rebuilt from imported source data.
	calculated := func(column int) bool {
		label := section.Columns[column]
		return strings.HasSuffix(label, "(Auto)") && label != "Guest ID (Auto)" && label != "Function ID (Auto)"
	}
	for _, row := range data.Rows {
		if row.Number < 4 {
			continue
		}
		if seen[row.Number] {
			return section, nil, errors.New("a worksheet contains duplicate row numbers")
		}
		seen[row.Number] = true
		values := make([]string, len(section.Columns))
		var rowIssues []importIssue
		var columnsSeen [40]bool
		for _, cell := range row.Cells {
			i, err := xlsxColumn(cell.Reference, row.Number)
			if err != nil {
				return section, nil, err
			}
			if i >= len(values) || (row.Number > 4 && calculated(i)) {
				continue
			}
			if columnsSeen[i] {
				return section, nil, errors.New("a worksheet contains duplicate cells")
			}
			columnsSeen[i] = true
			value, err := book.value(cell)
			if err != nil {
				rowIssues = append(rowIssues, importIssue{section.Name, row.Number, fmt.Sprintf("%s: %s.", section.Columns[i], err)})
				continue
			}
			if row.Number > 4 && (cell.Type == "e" || (cell.Formula != nil && value == "")) {
				rowIssues = append(rowIssues, importIssue{section.Name, row.Number, fmt.Sprintf("%s has no usable saved value.", section.Columns[i])})
				continue
			}
			values[i] = value
		}
		if section.Name == "Settings" && row.Number > 4 && values[0] == "Days Until Wedding" {
			continue
		}
		issues = append(issues, rowIssues...)
		if row.Number == 4 {
			if !slices.Equal(values, section.Columns) {
				issues = append(issues, importIssue{section.Name, 4, "Column headers differ from English v1.3.1."})
				return section, issues, nil
			}
			continue
		}
		firstInput := 0
		switch section.Name {
		case "Guest List", "Functions & Events", "Settings":
			firstInput = 1 // These tabs have prefilled IDs or setting labels.
		}
		if !slices.ContainsFunc(values[firstInput:], func(value string) bool { return value != "" }) {
			continue
		}
		if len(section.Rows) >= 1000 {
			return section, nil, errors.New("a worksheet exceeds 1,000 filled rows")
		}
		for i, heading := range section.Columns {
			if values[i] == "" {
				continue
			}
			if isDateColumn(heading, values[0]) {
				if date, ok := excelDate(values[i]); ok {
					values[i] = date
				} else {
					issues = append(issues, importIssue{section.Name, row.Number, heading + " is not a valid Excel date."})
				}
			}
		}
		section.Rows = append(section.Rows, importRow{Number: row.Number, Values: values})
	}
	if !seen[4] {
		issues = append(issues, importIssue{section.Name, 4, "Missing English v1.3.1 column headers."})
	}
	return section, issues, nil
}

func isDateColumn(heading, setting string) bool {
	switch heading {
	case "Date", "Arrival Date", "Departure Date", "Follow-up Date", "Last Contact", "Check-in", "Check-out", "Due Date", "Final Due":
		return true
	case "Value":
		return setting == "Wedding Date"
	}
	return false
}

func excelDate(value string) (string, bool) {
	if date, err := time.Parse(time.DateOnly, value); err == nil {
		return date.Format(time.DateOnly), true
	}
	number, err := strconv.ParseFloat(value, 64)
	if err != nil || math.IsNaN(number) || number < 61 || number >= 2958466 {
		return "", false
	}
	return time.Date(1899, 12, 30, 0, 0, 0, 0, time.UTC).AddDate(0, 0, int(number)).Format(time.DateOnly), true
}

func excelClock(value string) (string, bool) {
	for _, format := range []string{"15:04", "15:04:05", "3:04 PM", "3:04PM"} {
		if clock, err := time.Parse(format, strings.ToUpper(value)); err == nil {
			return clock.Format("15:04"), true
		}
	}
	number, err := strconv.ParseFloat(value, 64)
	if err != nil || math.IsNaN(number) || number < 0 || number >= 1 {
		return "", false
	}
	minutes := min(1439, int(math.Floor(number*1440+1e-7)))
	return fmt.Sprintf("%02d:%02d", minutes/60, minutes%60), true
}

func parseEnglishWorkbook(content []byte, zone string) (importedWorkbook, []importIssue, error) {
	result := importedWorkbook{TimeZone: zone}
	book, err := newXLSX(content)
	if err != nil {
		return result, nil, err
	}
	var index struct {
		Properties struct {
			Date1904 string `xml:"date1904,attr"`
		} `xml:"workbookPr"`
		Sheets []struct {
			Name     string `xml:"name,attr"`
			Relation string `xml:"http://schemas.openxmlformats.org/officeDocument/2006/relationships id,attr"`
		} `xml:"sheets>sheet"`
	}
	var relations struct {
		Items []struct {
			ID     string `xml:"Id,attr"`
			Target string `xml:"Target,attr"`
			Mode   string `xml:"TargetMode,attr"`
		} `xml:"Relationship"`
	}
	if err := book.read("xl/workbook.xml", &index); err != nil {
		return result, nil, err
	}
	if index.Properties.Date1904 == "1" || strings.EqualFold(index.Properties.Date1904, "true") {
		return result, nil, errors.New("the English launch template uses the Excel 1900 date system")
	}
	if err := book.read("xl/_rels/workbook.xml.rels", &relations); err != nil {
		return result, nil, err
	}
	paths := make(map[string]string)
	for _, item := range relations.Items {
		if item.Mode == "External" {
			continue
		}
		target := path.Join("xl", item.Target)
		if strings.HasPrefix(item.Target, "/") {
			target = path.Clean(strings.TrimPrefix(item.Target, "/"))
		}
		if strings.HasPrefix(target, "xl/worksheets/") {
			paths[item.ID] = target
		}
	}
	sheets := make(map[string]string)
	for _, sheet := range index.Sheets {
		if _, exists := sheets[sheet.Name]; exists {
			return result, nil, errors.New("the workbook contains duplicate sheet names")
		}
		sheets[sheet.Name] = paths[sheet.Relation]
	}
	// Load only the field definitions, then discard the embedded sample rows.
	var headerContract struct {
		Tables []struct {
			Name    string   `json:"name"`
			Columns []string `json:"columns"`
		} `json:"tables"`
	}
	if err := json.Unmarshal(englishWorkbookContract, &headerContract); err != nil {
		return result, nil, err
	}
	issues := []importIssue{}
	for _, entry := range headerContract.Tables {
		section := importSection{Name: entry.Name, Columns: entry.Columns, Rows: []importRow{}}
		file := sheets[section.Name]
		if file == "" {
			issues = append(issues, importIssue{section.Name, 4, "Required English v1.3.1 worksheet is missing."})
			continue
		}
		parsed, sheetIssues, err := readImportSection(book, file, section)
		if err != nil {
			return result, nil, fmt.Errorf("%s: %w", section.Name, err)
		}
		issues = append(issues, sheetIssues...)
		result.Sections = append(result.Sections, parsed)
	}
	return result, append(issues, validateImportedWorkbook(&result)...), nil
}

func validateImportedWorkbook(plan *importedWorkbook) []importIssue {
	issues := []importIssue{}
	report := func(sheet string, row int, message string) {
		issues = append(issues, importIssue{sheet, row, message})
	}
	guests := make(map[string]string)
	functions := make(map[string]bool)
	settings := make(map[string]bool)
	for _, section := range plan.Sections {
		for _, row := range section.Rows {
			v := row.Values
			switch section.Name {
			case "Settings":
				if settings[v[0]] {
					report(section.Name, row.Number, "This setting appears more than once.")
				}
				settings[v[0]] = true
				switch v[0] {
				case "Wedding Name":
					plan.Name = v[1]
				case "Wedding Date":
					plan.Date = v[1]
				}
			case "Guest List":
				key := strings.ToLower(v[0])
				if key == "" || v[1] == "" || guests[key] != "" {
					report(section.Name, row.Number, "Enter a guest name and a unique Guest ID.")
				}
				guests[key] = v[0]
				if v[12] != "" {
					if clock, ok := excelClock(v[12]); ok {
						v[12] = clock
					} else {
						report(section.Name, row.Number, "Arrival Time is not a valid Excel time. Enter a time or clear the cell.")
					}
				}
			case "Functions & Events":
				clock, ok := excelClock(v[3])
				id := strings.ToLower(v[0])
				if id == "" || !validLabel(v[1], 120) || functions[id] || v[2] == "" || !ok || len(v[4]) > 200 {
					report(section.Name, row.Number, "Enter a unique Function ID, name, date, and valid start time.")
				} else {
					v[3] = clock
				}
				if v[7] != "" && !validLabel(v[7], 120) {
					report(section.Name, row.Number, "Enter an owner name up to 120 characters.")
				}
				functions[id] = true
			case "Family Responsibilities":
				if !validLabel(v[0], 240) || (v[2] != "" && !validLabel(v[2], 120)) {
					report(section.Name, row.Number, "Enter a task name and a valid owner name, if assigned.")
				}
			}
		}
	}
	if !validLabel(plan.Name, 120) {
		report("Settings", 5, "Enter a wedding name.")
	}
	if _, err := time.Parse(time.DateOnly, plan.Date); err != nil {
		report("Settings", 6, "Enter a valid wedding date.")
	}
	linkColumns := map[string][]int{"RSVP Follow-up": {0}, "Accommodation": {3, 4, 5, 6}, "Transportation": {4, 5, 6, 7}}
	for si := range plan.Sections {
		section := &plan.Sections[si]
		for ri := range section.Rows {
			row := &section.Rows[ri]
			for _, column := range linkColumns[section.Name] {
				if row.Values[column] == "" {
					continue
				}
				id, _, _ := strings.Cut(row.Values[column], "|")
				guest := guests[strings.ToLower(strings.TrimSpace(id))]
				if guest == "" {
					report(section.Name, row.Number, section.Columns[column]+" refers to a guest missing from Guest List.")
					continue
				}
				if row.Guests == nil {
					row.Guests = make(map[int]string)
				}
				row.Guests[column] = guest
			}
			for _, column := range importAmountColumns(section.Name) {
				if _, ok := importPaise(row.Values[column]); !ok {
					report(section.Name, row.Number, section.Columns[column]+" must be a valid amount.")
				}
			}
		}
	}
	return issues
}

func importAmountColumns(section string) []int {
	switch section {
	case "Budget vs Actual":
		return []int{1, 2}
	case "Vendor Payments":
		return []int{3, 4}
	}
	return nil
}

func importPaise(text string) (int64, bool) {
	if text == "" {
		return 0, true
	}
	n, err := strconv.ParseFloat(text, 64)
	if err != nil || math.IsNaN(n) || math.IsInf(n, 0) || math.Abs(n) > 1e10 {
		return 0, false
	}
	return int64(math.Round(n * 100)), true
}

type importTotals struct {
	Guests         int   `json:"guests"`
	Confirmed      int   `json:"confirmed"`
	Rooms          int   `json:"rooms"`
	PlannedPaise   int64 `json:"plannedPaise"`
	PaidPaise      int64 `json:"paidPaise"`
	VendorDuePaise int64 `json:"vendorDuePaise"`
}

func importedTotals(sections []importSection) importTotals {
	var totals importTotals
	for _, section := range sections {
		for _, row := range section.Rows {
			switch section.Name {
			case "Guest List":
				totals.Guests++
				if strings.EqualFold(row.Values[7], "confirmed") {
					totals.Confirmed++
				}
			case "Accommodation":
				if row.Values[1] != "" {
					totals.Rooms++
				}
			case "Budget vs Actual":
				planned, _ := importPaise(row.Values[1])
				paid, _ := importPaise(row.Values[2])
				totals.PlannedPaise += planned
				totals.PaidPaise += paid
			case "Vendor Payments":
				contract, _ := importPaise(row.Values[3])
				paid, _ := importPaise(row.Values[4])
				totals.VendorDuePaise += contract - paid
			}
		}
	}
	return totals
}

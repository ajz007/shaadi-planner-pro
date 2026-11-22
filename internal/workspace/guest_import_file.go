package workspace

import (
	"bytes"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

const maxGuestImportRows = 3500

type guestImportRow struct {
	liveGuest
	Row    int    `json:"row"`
	Status string `json:"status"`
	Reason string `json:"reason,omitempty"`
}

type guestImportField int

const (
	importName guestImportField = iota + 1
	importID
	importHousehold
	importSide
	importRSVP
	importStay
	importTransport
	importArrivalDate
	importArrivalTime
	importArrivalMode
)

var guestImportHeaders = map[string]guestImportField{
	"name": importName, "guest name": importName, "full name": importName, "guest": importName,
	"guest id": importID, "guest id (auto)": importID,
	"household": importHousehold, "household / family": importHousehold, "family": importHousehold, "family name": importHousehold,
	"side": importSide, "wedding side": importSide,
	"rsvp": importRSVP, "rsvp status": importRSVP,
	"stay required": importStay, "stay required?": importStay,
	"transport required": importTransport, "transport required?": importTransport,
	"arrival date": importArrivalDate, "arrival time": importArrivalTime, "arrival mode": importArrivalMode,
}

type guestImportFile struct {
	columns  map[int]guestImportField
	rows     []guestImportRow
	excel    bool
	date1904 bool
	autoID   bool
}

func guestImportKey(value string) string {
	return strings.ToLower(strings.Join(strings.Fields(value), " "))
}

func readGuestImport(content []byte, format string) ([]guestImportRow, error) {
	file := guestImportFile{excel: format == "xlsx"}
	var err error
	if file.excel {
		err = file.readExcel(content)
	} else {
		err = file.readCSV(content)
	}
	if err != nil {
		return nil, err
	}
	if file.columns == nil {
		return nil, errors.New("Add a Guest Name column in the first 10 rows, or use the CSV template.")
	}
	if len(file.rows) == 0 {
		return nil, errors.New("The file has no guest rows.")
	}
	return file.rows, nil
}

func (f *guestImportFile) readCSV(content []byte) error {
	if !utf8.Valid(content) || bytes.IndexByte(content, 0) >= 0 {
		return errors.New("Save the CSV as UTF-8 and try again.")
	}
	reader := csv.NewReader(bytes.NewReader(bytes.TrimPrefix(content, []byte("\xef\xbb\xbf"))))
	reader.FieldsPerRecord = -1
	for {
		row, err := reader.Read()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return fmt.Errorf("Check the CSV format near row %d.", readerLine(err))
		}
		number, _ := reader.FieldPos(0)
		if err := f.addRow(number, func(visit func(int, string)) error {
			for index, value := range row {
				visit(index, strings.TrimSpace(value))
			}
			return nil
		}); err != nil {
			return err
		}
		if f.columns == nil && number >= 10 {
			return nil
		}
	}
}

func readerLine(err error) int {
	var parse *csv.ParseError
	if errors.As(err, &parse) {
		return parse.Line
	}
	return 1
}

func (f *guestImportFile) readExcel(content []byte) error {
	book, err := newXLSX(content)
	if err != nil {
		return err
	}
	sheets, date1904, err := book.sheets()
	if err != nil || len(sheets) == 0 {
		return errors.New("The workbook has no readable worksheets.")
	}
	f.date1904 = date1904
	sheet := sheets[0]
	for _, candidate := range sheets {
		name := guestImportKey(candidate.name)
		if name == "guest list" || name == "guest master" {
			sheet = candidate
			break
		}
	}
	var data struct {
		Rows []struct {
			Number int         `xml:"r,attr"`
			Cells  []sheetCell `xml:"c"`
		} `xml:"sheetData>row"`
	}
	if err := book.read(sheet.file, &data); err != nil {
		return err
	}
	for _, row := range data.Rows {
		if f.columns == nil && row.Number > 10 {
			break
		}
		err := f.addRow(row.Number, func(visit func(int, string)) error {
			for _, cell := range row.Cells {
				if cell.Formula != nil {
					continue
				}
				index, err := xlsxColumn(cell.Reference, row.Number)
				if err != nil {
					return err
				}
				if f.columns != nil && f.columns[index] == 0 {
					continue
				}
				value, err := book.value(cell)
				if err != nil {
					return err
				}
				visit(index, value)
			}
			return nil
		})
		if err != nil {
			return err
		}
	}
	return nil
}

func (f *guestImportFile) addRow(number int, cells func(func(int, string)) error) error {
	if f.columns == nil {
		columns := make(map[int]guestImportField)
		seen := make(map[guestImportField]bool)
		duplicate := false
		if err := cells(func(index int, value string) {
			if field := guestImportHeaders[guestImportKey(value)]; field != 0 {
				duplicate = duplicate || seen[field]
				columns[index], seen[field] = field, true
				if guestImportKey(value) == "guest id (auto)" {
					f.autoID = true
				}
			}
		}); err != nil {
			return err
		}
		if seen[importName] && number <= 10 {
			if duplicate {
				return fmt.Errorf("Row %d has duplicate guest column headings.", number)
			}
			f.columns = columns
		}
		return nil
	}
	values := make(map[guestImportField]string, len(f.columns))
	if err := cells(func(index int, value string) {
		if field := f.columns[index]; field != 0 && value != "" {
			values[field] = value
		}
	}); err != nil {
		return fmt.Errorf("Could not read guest values on row %d: %w", number, err)
	}
	// The Shaadi Planner workbook pre-fills Guest IDs on unused rows.
	if len(values) == 0 || (f.autoID && len(values) == 1 && values[importID] != "") {
		return nil
	}
	if len(f.rows) >= maxGuestImportRows {
		return fmt.Errorf("Upload up to %d guests at a time.", maxGuestImportRows)
	}
	item := guestImportRow{Row: number, Status: "new", liveGuest: liveGuest{
		Name: values[importName], WorkbookID: values[importID], Household: values[importHousehold],
		Side: values[importSide], RSVP: values[importRSVP], StayRequired: values[importStay],
		TransportRequired: values[importTransport], ArrivalDate: values[importArrivalDate],
		ArrivalTime: values[importArrivalTime], ArrivalMode: values[importArrivalMode],
	}}
	item.Reason = f.validate(&item.liveGuest)
	if item.Reason != "" {
		item.Status = "invalid"
	}
	f.rows = append(f.rows, item)
	return nil
}

func (f *guestImportFile) validate(guest *liveGuest) string {
	if guest.Name == "" {
		return "Enter the guest name."
	}
	for _, value := range []string{guest.Name, guest.WorkbookID, guest.Household, guest.Side, guest.RSVP,
		guest.StayRequired, guest.TransportRequired, guest.ArrivalDate, guest.ArrivalTime, guest.ArrivalMode} {
		if utf8.RuneCountInString(value) > 120 || strings.ContainsFunc(value, unicode.IsControl) {
			return "Use up to 120 characters per field and remove line breaks or control characters."
		}
	}
	for _, field := range []struct {
		value   *string
		label   string
		options []string
	}{
		{&guest.Side, "Side", []string{"Bride", "Groom", "Both"}},
		{&guest.RSVP, "RSVP Status", []string{"Pending", "Maybe", "Confirmed", "Declined"}},
		{&guest.StayRequired, "Stay Required", []string{"Yes", "No"}},
		{&guest.TransportRequired, "Transport Required", []string{"Yes", "No"}},
		{&guest.ArrivalMode, "Arrival Mode", []string{"Flight", "Train", "Car", "Bus", "Local", "Other"}},
	} {
		if *field.value == "" {
			continue
		}
		match := false
		for _, option := range field.options {
			if strings.EqualFold(option, *field.value) {
				*field.value, match = option, true
				break
			}
		}
		if !match {
			return field.label + " must be " + strings.Join(field.options, ", ") + "."
		}
	}
	if guest.RSVP == "" {
		guest.RSVP = "Pending"
	}
	if guest.ArrivalDate != "" {
		value := guest.ArrivalDate
		if f.date1904 {
			if number, err := strconv.ParseFloat(value, 64); err == nil {
				value = strconv.FormatFloat(number+1462, 'f', -1, 64)
			}
		}
		date, err := time.Parse(time.DateOnly, value)
		switch {
		case err == nil && date.Year() > 0:
			guest.ArrivalDate = date.Format(time.DateOnly)
		case f.excel && err != nil:
			var ok bool
			guest.ArrivalDate, ok = excelDate(value)
			if ok {
				break
			}
			fallthrough
		default:
			return "Use YYYY-MM-DD for Arrival Date."
		}
	}
	if guest.ArrivalTime != "" {
		var ok bool
		guest.ArrivalTime, ok = excelClock(guest.ArrivalTime)
		if !ok {
			return "Use HH:MM for Arrival Time."
		}
	}
	return ""
}

package workspace

import (
	"database/sql"
	"encoding/json"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/ajz007/shaadi-planner-pro/internal/workbook"
	"github.com/ajz007/shaadi-planner-pro/web"
)

var snapshotAmounts = regexp.MustCompile(`^(Occupancy \(Auto\)|Budget|Actual Paid|Quote|Negotiated Price|Contract Value|Paid|Expected Guests|Qty|Unit Cost|Passenger Count \(Auto\))$`)

func (a *workspaceHTTP) weddingSnapshot(w http.ResponseWriter, r *http.Request, actor string) {
	wedding := r.PathValue("wedding")
	if !workspaceUUID.MatchString(wedding) {
		workspaceFailure(w, errWorkspaceNotFound)
		return
	}
	ctx := r.Context()
	tx, err := a.store.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	defer tx.Rollback()
	var name, date, zone string
	err = scanWorkspace(tx.QueryRowContext(ctx, `
		SELECT w.name, w.wedding_date::text, w.time_zone FROM weddings w JOIN wedding_memberships m ON m.wedding_id = w.id
		WHERE w.id = $1 AND m.account_id = $2 AND m.role = 'owner'`, wedding, actor), &name, &date, &zone)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	location, err := time.LoadLocation(zone)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	sections, err := queryWorkspace(ctx, tx, func(rows *sql.Rows, section *importSection) error {
		var payload []byte
		if err := rows.Scan(&payload); err != nil {
			return err
		}
		return json.Unmarshal(payload, section)
	}, "SELECT payload FROM wedding_imported_sections WHERE wedding_id = $1 ORDER BY position", wedding)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	guests, err := listLiveGuests(ctx, tx, wedding, actor)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	pickups, err := listPickups(ctx, tx, wedding, actor)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	logistics, err := listLogistics(ctx, tx, wedding, actor, "")
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	finance, err := listFinance(ctx, tx, wedding, actor)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	planning, err := listPlanning(ctx, tx, wedding, actor)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	people, err := queryWorkspace(ctx, tx, func(rows *sql.Rows, person *workspacePerson) error {
		return rows.Scan(&person.ID, &person.Name)
	}, "SELECT id,name FROM wedding_people WHERE wedding_id=$1", wedding)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	documentRows, err := queryWorkspace(ctx, tx, func(rows *sql.Rows, row *[]any) error {
		var vendor, category, filename string
		err := rows.Scan(&vendor, &category, &filename)
		*row = []any{vendor, category, filename}
		return err
	}, `SELECT v.fields->>1,v.fields->>0,d.name FROM wedding_vendor_documents d
		JOIN wedding_vendors v ON v.wedding_id=d.wedding_id AND v.id=d.vendor_id
		WHERE d.wedding_id=$1 ORDER BY 1,2,3`, wedding)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	type savedFunction struct {
		ID, WorkbookID, Name, Venue, Owner string
		Start                              time.Time
	}
	functions, err := queryWorkspace(ctx, tx, func(rows *sql.Rows, event *savedFunction) error {
		return rows.Scan(&event.ID, &event.WorkbookID, &event.Name, &event.Venue, &event.Owner, &event.Start)
	}, `SELECT f.id, COALESCE(f.workbook_id, ''), f.name, concat_ws(' · ', place.name, NULLIF(f.venue,'')), COALESCE(p.name, ''), f.starts_at
		FROM wedding_functions f LEFT JOIN wedding_people p ON p.wedding_id = f.wedding_id AND p.id = f.owner_id
		LEFT JOIN wedding_places place ON place.wedding_id=f.wedding_id AND place.id=f.place_id
		WHERE f.wedding_id = $1 ORDER BY f.starts_at, f.id`, wedding)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	type savedTask struct {
		Title, Assignee, Due, Function string
		WorkbookRow                    int
		Claimable, Done                bool
	}
	tasks, err := queryWorkspace(ctx, tx, func(rows *sql.Rows, task *savedTask) error {
		return rows.Scan(&task.Title, &task.Assignee, &task.Due, &task.Function, &task.WorkbookRow, &task.Claimable, &task.Done)
	}, `SELECT t.title, COALESCE(p.name, ''), COALESCE(t.due_date::text, ''), COALESCE(f.name, ''),
		COALESCE(t.workbook_row, 0), t.claimable, t.done
		FROM wedding_tasks t
		LEFT JOIN wedding_people p ON p.wedding_id = t.wedding_id AND p.id = t.assignee_id
		LEFT JOIN wedding_functions f ON f.wedding_id = t.wedding_id AND f.id = t.function_id
		WHERE t.wedding_id = $1 ORDER BY t.due_date NULLS LAST, t.id`, wedding)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	if err := tx.Commit(); err != nil {
		workspaceFailure(w, err)
		return
	}
	byName := make(map[string]importSection)
	for _, section := range sections {
		byName[section.Name] = section
	}
	var contract struct {
		Tables []struct {
			Name    string
			Columns []string
		}
	}
	if err := json.Unmarshal(web.WorkbookContract, &contract); err != nil {
		workspaceFailure(w, err)
		return
	}
	liveSection := func(sectionName string, build func(importSection) []importRow) {
		section := byName[sectionName]
		if section.Name == "" {
			for _, item := range contract.Tables {
				if item.Name == sectionName {
					section = importSection{Name: item.Name, Columns: item.Columns}
					break
				}
			}
		}
		section.Rows = build(section)
		byName[sectionName] = section
	}
	liveSection("Settings", func(section importSection) []importRow {
		result := []importRow{{Values: []string{"Wedding Name", name}}, {Values: []string{"Wedding Date", date}}, {Values: []string{"Time Zone", zone}}}
		for _, row := range section.Rows {
			if row.Values[0] != "Wedding Name" && row.Values[0] != "Wedding Date" && row.Values[0] != "Time Zone" {
				result = append(result, row)
			}
		}
		return result
	})
	byGuest := make(map[string]liveGuest)
	guestPhones := make(map[string]string)
	liveSection("Guest List", func(section importSection) []importRow {
		originals := make(map[string][]string)
		for _, row := range section.Rows {
			originals[row.Values[0]] = row.Values
			guestPhones[row.Values[0]] = row.Values[6]
		}
		result := make([]importRow, 0, len(guests))
		for _, guest := range guests {
			values := make([]string, len(section.Columns))
			copy(values, originals[guest.WorkbookID])
			values[0], values[1], values[2], values[3] = guest.WorkbookID, guest.Name, guest.Household, guest.Side
			values[7], values[10], values[11], values[12], values[13] = guest.RSVP, guest.TransportRequired, guest.ArrivalDate, guest.ArrivalTime, guest.ArrivalMode
			values[9] = guest.StayRequired
			values[20] = guest.WorkbookID + " | " + guest.Name
			byGuest[guest.WorkbookID] = guest
			result = append(result, importRow{Values: values})
		}
		return result
	})
	for _, name := range []string{roomSection, followupSection} {
		liveSection(name, func(_ importSection) []importRow {
			result := []importRow{}
			for _, record := range logistics {
				if record.Section == name {
					result = append(result, importRow{Values: logisticsValues(record, byGuest, guestPhones)})
				}
			}
			return result
		})
	}
	liveSection("Vendor Comparison", func(_ importSection) []importRow {
		rows := make([]importRow, 0, len(finance.Vendors))
		for _, vendor := range finance.Vendors {
			rows = append(rows, importRow{Values: vendor.Values})
		}
		return rows
	})
	liveSection("Vendor Payments", func(_ importSection) []importRow {
		rows := make([]importRow, 0, len(finance.Contracts))
		for _, contract := range finance.Contracts {
			rows = append(rows, importRow{Values: contract.Values})
		}
		return rows
	})
	liveSection("Transportation", func(section importSection) []importRow {
		result := make([]importRow, 0, len(pickups))
		for _, pickup := range pickups {
			values := make([]string, len(section.Columns)+2)
			values[0], values[1], values[2], values[3] = pickup.Date, pickup.Time, pickup.PickupPoint, pickup.DropPoint
			values[10], values[11], values[12], values[13] = strconv.Itoa(len(pickup.Passengers)), pickup.Vehicle, pickup.VehicleNumber, pickup.Driver
			values[14], values[15], values[16], values[17] = pickup.Owner, pickup.Status, pickup.DriverConfirmed, pickup.Notes
			extra := []string{}
			for index, passenger := range pickup.Passengers {
				label := passenger.WorkbookID + " | " + passenger.Name
				if index == 0 {
					values[8], values[9] = passenger.Household, guestPhones[passenger.WorkbookID]
				}
				if index < 4 {
					values[4+index] = label
				} else {
					extra = append(extra, label)
				}
			}
			values[18] = strings.Join(extra, ", ")
			if pickup.NeedsReview {
				values[19] = "Needs review"
			}
			result = append(result, importRow{Values: values})
		}
		return result
	})
	liveSection("Functions & Events", func(section importSection) []importRow {
		originals := make(map[string][]string)
		for _, row := range section.Rows {
			originals[row.Values[0]] = row.Values
		}
		result := make([]importRow, 0, len(functions))
		for _, event := range functions {
			values := make([]string, len(section.Columns))
			copy(values, originals[event.WorkbookID])
			start := event.Start.In(location)
			id := event.WorkbookID
			if id == "" {
				id = "F-" + event.ID
			}
			values[0], values[1], values[2], values[3], values[4], values[7] = id, event.Name, start.Format(time.DateOnly), start.Format("15:04"), event.Venue, event.Owner
			result = append(result, importRow{Values: values})
		}
		return result
	})
	liveSection("Wedding Timeline", func(_ importSection) []importRow {
		result := make([]importRow, 0, len(planning.Timeline))
		for _, activity := range planning.Timeline {
			result = append(result, importRow{Values: append(activity.Fields[:], activity.Function)})
		}
		return result
	})
	timeline := byName["Wedding Timeline"]
	timeline.Columns = append(timeline.Columns, "Linked function")
	byName[timeline.Name] = timeline
	openTasks := 0
	liveSection("Family Responsibilities", func(section importSection) []importRow {
		originals := make(map[int][]string)
		for _, row := range section.Rows {
			originals[row.Number] = row.Values
		}
		result := make([]importRow, 0, len(tasks))
		for _, task := range tasks {
			values := make([]string, len(section.Columns)+1)
			copy(values, originals[task.WorkbookRow])
			values[0], values[2], values[4] = task.Title, task.Assignee, task.Due
			if task.Function != "" {
				values[7] = task.Function
			}
			if task.Done {
				values[5], values[6] = "Done", "100%"
			} else {
				openTasks++
				if values[5] == "" || values[5] == "Done" {
					values[5], values[6] = "Not Started", "0%"
				}
			}
			if task.Claimable && task.Assignee == "" && !task.Done {
				values[10] = "Yes"
			}
			result = append(result, importRow{Values: values})
		}
		return result
	})
	sectionList := make([]importSection, 0, len(byName))
	for _, item := range contract.Tables {
		if section, exists := byName[item.Name]; exists {
			sectionList = append(sectionList, section)
		}
	}
	totals := importedTotals(sectionList)
	sheets := []workbook.Sheet{{Name: "Dashboard", Rows: [][]any{
		{"Metric", "Value"}, {"Wedding", name}, {"Guests", float64(totals.Guests)}, {"Confirmed guests", float64(totals.Confirmed)},
		{"Rooms", float64(totals.Rooms)}, {"Functions", float64(len(functions))}, {"Open tasks", float64(openTasks)},
		{"Pickups", float64(len(pickups))},
		{"Planned budget", float64(totals.PlannedPaise) / 100}, {"Budget paid", float64(totals.PaidPaise) / 100},
		{"Vendor balance", float64(totals.VendorDuePaise) / 100},
	}}}
	for _, section := range sectionList {
		columns := section.Columns
		if section.Name == "Family Responsibilities" {
			columns = append(append([]string{}, columns...), "Open for claiming")
		}
		if section.Name == "Transportation" {
			columns = append(append([]string{}, columns...), "Additional passengers", "Arrival review")
		}
		header := make([]any, len(columns))
		for i, label := range columns {
			header[i] = label
		}
		sheet := workbook.Sheet{Name: section.Name, Rows: [][]any{header}}
		for _, row := range section.Rows {
			cells := make([]any, len(row.Values))
			for i, value := range row.Values {
				if guest, linked := byGuest[row.Guests[i]]; linked {
					value = guest.WorkbookID + " | " + guest.Name
				}
				cells[i] = value
				if snapshotAmounts.MatchString(columns[i]) && value != "" {
					if amount, err := strconv.ParseFloat(value, 64); err == nil && !math.IsNaN(amount) && !math.IsInf(amount, 0) {
						cells[i] = amount
					}
				}
			}
			sheet.Rows = append(sheet.Rows, cells)
		}
		sheets = append(sheets, sheet)
	}
	if len(finance.Contracts) > 0 {
		ledger := workbook.Sheet{Name: "Payment Ledger", Rows: [][]any{
			{"Vendor", "Category", "Contract ID", "Date", "Amount (INR)", "Method", "Status", "Notes"},
		}}
		for _, contract := range finance.Contracts {
			if contract.OpeningPaid != 0 {
				ledger.Rows = append(ledger.Rows, []any{contract.Values[1], contract.Values[0], contract.ID, "",
					float64(contract.OpeningPaid) / 100, contract.Values[8], "Imported opening balance", ""})
			}
			for _, payment := range contract.Payments {
				status := "Recorded"
				if payment.Voided {
					status = "Voided"
				}
				ledger.Rows = append(ledger.Rows, []any{contract.Values[1], contract.Values[0], contract.ID, payment.Date,
					float64(payment.Amount) / 100, payment.Method, status, payment.Notes})
			}
		}
		sheets = append(sheets, ledger)
	}
	sheets = append(sheets, planningSheets(planning, people)...)
	if len(documentRows) > 0 {
		sheets = append(sheets, workbook.Sheet{Name: "Vendor Documents",
			Rows: append([][]any{{"Vendor", "Category", "Filename"}}, documentRows...)})
	}
	content, err := workbook.Create(sheets)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", `attachment; filename="Shaadi-Planner-Current-Wedding.xlsx"`)
	w.Header().Set("Cache-Control", "no-store")
	w.Write(content)
}

func planningSheets(plan weddingPlanning, people []workspacePerson) []workbook.Sheet {
	var sheets []workbook.Sheet
	if len(plan.Places) > 0 {
		places := workbook.Sheet{Name: "Places", Rows: [][]any{{"Place", "Address", "Map link", "Arrival instructions"}}}
		for _, p := range plan.Places {
			places.Rows = append(places.Rows, []any{p.Name, p.Address, p.MapURL, p.Instructions})
		}
		sheets = append(sheets, places)
	}
	if len(plan.Functions) == 0 {
		return sheets
	}
	names := make(map[string]string, len(people))
	for _, person := range people {
		names[person.ID] = person.Name
	}
	attendance := workbook.Sheet{Name: "Required People", Rows: [][]any{{"Function", "Duration (minutes)", "Attendance", "Person", "Role", "Needed by"}}}
	items := workbook.Sheet{Name: "Required Items", Rows: [][]any{{"Function", "Item", "Category", "Quantity", "Unit", "Responsible person", "For", "Ready by", "Handoff", "Status"}}}
	for _, function := range plan.Functions {
		var duration any
		if function.Duration != nil {
			duration = float64(*function.Duration)
		}
		switch {
		case function.People == nil:
			attendance.Rows = append(attendance.Rows, []any{function.Name, duration, "Needs review", "", "", ""})
		case len(function.People) == 0:
			attendance.Rows = append(attendance.Rows, []any{function.Name, duration, "No required people", "", "", ""})
		default:
			for _, person := range function.People {
				attendance.Rows = append(attendance.Rows, []any{function.Name, duration, "Required", names[person.PersonID], person.Role, person.NeededBy})
			}
		}
		for _, item := range function.Items {
			items.Rows = append(items.Rows, []any{function.Name, item.Name, item.Category, item.Quantity, item.Unit,
				names[item.PersonID], item.For, item.NeededBy, item.Handoff, item.Status})
		}
	}
	return append(sheets, attendance, items)
}

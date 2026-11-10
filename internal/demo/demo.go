package demo

import (
	"crypto/rand"
	"encoding/csv"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"slices"
	"sort"
	"strings"
	"sync"
	"unicode/utf8"

	"github.com/ajz007/shaadi-planner-pro/internal/httpx"
)

var functions = []string{"Sangeet", "Reception"}
var columns = []string{"guest_id", "name", "household", "sangeet", "reception"}

const sampleCSV = `guest_id,name,household,sangeet,reception
G001,Mira Shah,Shah family,yes,yes
G002,Neel Shah,Shah family,no,yes
G003,Kavya Patel,Patel family,yes,yes
G004,Dev Patel,Patel family,no,yes
`

type guest struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Household string   `json:"household"`
	Functions []string `json:"functions"`
}

type invitation struct {
	GuestID  string `json:"guestId"`
	Name     string `json:"name"`
	Function string `json:"function"`
	Status   string `json:"status"`
	Revision int    `json:"revision"`
}

type inviteKey struct{ guestID, function string }

type group struct {
	Name        string       `json:"name"`
	Token       string       `json:"token,omitempty"`
	Invitations []invitation `json:"invitations"`
}

type demo struct {
	mu          sync.Mutex
	guests      map[string]guest
	tokens      map[string]string
	invitations map[inviteKey]invitation
}

func newDemo() *demo {
	return &demo{
		guests: make(map[string]guest), tokens: make(map[string]string),
		invitations: make(map[inviteKey]invitation),
	}
}

func Register(mux *http.ServeMux) {
	d := newDemo()
	mux.HandleFunc("GET /api/wedding", d.wedding)
	mux.HandleFunc("GET /api/sample.csv", func(w http.ResponseWriter, _ *http.Request) {
		writeCSVHeaders(w, "sample-guests.csv")
		fmt.Fprint(w, sampleCSV)
	})
	mux.HandleFunc("POST /api/import", d.importGuests)
	mux.HandleFunc("GET /api/headcounts.csv", d.headcounts)
	mux.HandleFunc("GET /api/rsvp/{token}", d.guestRSVP)
	mux.HandleFunc("PUT /api/rsvp/{token}", d.saveRSVP)
	mux.HandleFunc("PUT /api/responses", d.saveRSVP)
}
func parseGuests(content string) ([]guest, error) {
	if !utf8.ValidString(content) {
		return nil, errors.New("save the guest list as UTF-8 CSV")
	}
	reader := csv.NewReader(strings.NewReader(strings.TrimPrefix(content, "\uFEFF")))
	header, err := reader.Read()
	if err != nil || !slices.Equal(header, columns) {
		return nil, errors.New("use the column headings from the sample CSV")
	}
	var guests []guest
	seen := make(map[string]bool)
	for row := 2; ; row++ {
		fields, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("row %d: invalid CSV or incorrect number of columns", row)
		}
		if len(guests) >= 500 {
			return nil, errors.New("the demo supports up to 500 guests")
		}
		for i := range fields {
			fields[i] = strings.TrimSpace(fields[i])
			if len(fields[i]) > 300 {
				return nil, fmt.Errorf("row %d: a field exceeds the demo limit", row)
			}
		}
		entry := guest{ID: fields[0], Name: fields[1], Household: fields[2]}
		if entry.ID == "" || entry.Name == "" || seen[entry.ID] {
			return nil, fmt.Errorf("row %d: enter a unique guest ID and a name", row)
		}
		for i, function := range functions {
			switch strings.ToLower(fields[i+3]) {
			case "yes":
				entry.Functions = append(entry.Functions, function)
			case "no":
			default:
				return nil, fmt.Errorf("row %d: enter yes or no for %s", row, function)
			}
		}
		if len(entry.Functions) == 0 {
			return nil, fmt.Errorf("row %d: invite this guest to at least one function", row)
		}
		seen[entry.ID] = true
		guests = append(guests, entry)
	}
	if len(guests) == 0 {
		return nil, errors.New("add at least one guest to the CSV")
	}
	return guests, nil
}

func groupKey(g guest) string {
	if g.Household == "" {
		return "guest:" + g.ID
	}
	return "household:" + g.Household
}

func (d *demo) importGuests(w http.ResponseWriter, r *http.Request) {
	var request struct {
		CSV     string `json:"csv"`
		Confirm bool   `json:"confirm"`
	}
	if !httpx.ReadJSON(w, r, &request) {
		return
	}
	guests, err := parseGuests(request.CSV)
	if err != nil {
		httpx.Fail(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	added := make([]guest, 0, len(guests))
	for _, entry := range guests {
		existing, found := d.guests[entry.ID]
		if !found {
			added = append(added, entry)
			continue
		}
		if existing.Name != entry.Name || existing.Household != entry.Household ||
			!slices.Equal(existing.Functions, entry.Functions) {
			httpx.Fail(w, http.StatusConflict, "Existing guest "+entry.ID+" differs from the import. The demo only adds new guests.")
			return
		}
	}
	if len(d.guests)+len(added) > 500 {
		httpx.Fail(w, http.StatusUnprocessableEntity, "The demo supports up to 500 guests.")
		return
	}
	if request.Confirm {
		d.addGuests(added)
	}
	httpx.Reply(w, http.StatusOK, map[string]any{
		"guests": guests, "newGuests": len(added), "unchanged": len(guests) - len(added),
	})
}

func (d *demo) addGuests(guests []guest) {
	for _, entry := range guests {
		d.guests[entry.ID] = entry
		key := groupKey(entry)
		if d.tokens[key] == "" {
			var token [24]byte
			rand.Read(token[:])
			d.tokens[key] = hex.EncodeToString(token[:])
		}
		for _, function := range entry.Functions {
			d.invitations[inviteKey{entry.ID, function}] = invitation{
				GuestID: entry.ID, Name: entry.Name, Function: function, Status: "pending",
			}
		}
	}
}

func (d *demo) groups() []group {
	byKey := make(map[string]*group)
	for _, entry := range d.guests {
		key := groupKey(entry)
		if byKey[key] == nil {
			name := entry.Household
			if name == "" {
				name = entry.Name
			}
			byKey[key] = &group{Name: name, Token: d.tokens[key]}
		}
		for _, function := range entry.Functions {
			byKey[key].Invitations = append(byKey[key].Invitations, d.invitations[inviteKey{entry.ID, function}])
		}
	}
	groups := make([]group, 0, len(byKey))
	for _, entry := range byKey {
		sort.Slice(entry.Invitations, func(i, j int) bool {
			a, b := entry.Invitations[i], entry.Invitations[j]
			if a.GuestID == b.GuestID {
				return a.Function < b.Function
			}
			return a.GuestID < b.GuestID
		})
		groups = append(groups, *entry)
	}
	sort.Slice(groups, func(i, j int) bool {
		if groups[i].Name == groups[j].Name {
			return groups[i].Invitations[0].GuestID < groups[j].Invitations[0].GuestID
		}
		return groups[i].Name < groups[j].Name
	})
	return groups
}

type count struct {
	Function string `json:"function"`
	Accepted int    `json:"accepted"`
	Declined int    `json:"declined"`
	Pending  int    `json:"pending"`
}

func (d *demo) counts() []count {
	counts := make([]count, len(functions))
	for i, function := range functions {
		counts[i].Function = function
		for _, invite := range d.invitations {
			if invite.Function != function {
				continue
			}
			switch invite.Status {
			case "accepted":
				counts[i].Accepted++
			case "declined":
				counts[i].Declined++
			default:
				counts[i].Pending++
			}
		}
	}
	return counts
}

func (d *demo) wedding(w http.ResponseWriter, _ *http.Request) {
	d.mu.Lock()
	defer d.mu.Unlock()
	httpx.Reply(w, http.StatusOK, map[string]any{"groups": d.groups(), "counts": d.counts()})
}

func (d *demo) guestRSVP(w http.ResponseWriter, r *http.Request) {
	d.mu.Lock()
	defer d.mu.Unlock()
	for _, entry := range d.groups() {
		if entry.Token == r.PathValue("token") {
			entry.Token = ""
			httpx.Reply(w, http.StatusOK, entry)
			return
		}
	}
	httpx.Fail(w, http.StatusNotFound, "This RSVP link is unavailable.")
}

func (d *demo) saveRSVP(w http.ResponseWriter, r *http.Request) {
	var request struct {
		GuestID  string `json:"guestId"`
		Function string `json:"function"`
		Status   string `json:"status"`
		Revision *int   `json:"revision"`
	}
	if !httpx.ReadJSON(w, r, &request) {
		return
	}
	if request.Revision == nil || !slices.Contains([]string{"pending", "accepted", "declined"}, request.Status) {
		httpx.Fail(w, http.StatusUnprocessableEntity, "Choose a valid response and include its revision.")
		return
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	key := inviteKey{request.GuestID, request.Function}
	entry, exists := d.invitations[key]
	token := r.PathValue("token")
	if !exists || (token != "" && token != d.tokens[groupKey(d.guests[entry.GuestID])]) {
		httpx.Fail(w, http.StatusNotFound, "This invitation is unavailable.")
		return
	}
	if entry.Revision != *request.Revision {
		httpx.Fail(w, http.StatusConflict, "This RSVP changed. Refresh to see the latest response.")
		return
	}
	if entry.Status != request.Status {
		entry.Status = request.Status
		entry.Revision++
		d.invitations[key] = entry
	}
	httpx.Reply(w, http.StatusOK, entry)
}

func writeCSVHeaders(w http.ResponseWriter, filename string) {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	w.Header().Set("Cache-Control", "no-store")
	fmt.Fprint(w, "\uFEFF")
}

func (d *demo) headcounts(w http.ResponseWriter, _ *http.Request) {
	d.mu.Lock()
	counts := d.counts()
	d.mu.Unlock()
	writeCSVHeaders(w, "function-headcounts.csv")
	writer := csv.NewWriter(w)
	writer.Write([]string{"Function", "Invited", "Accepted", "Declined", "Pending"})
	for _, row := range counts {
		writer.Write([]string{
			row.Function, fmt.Sprint(row.Accepted + row.Declined + row.Pending),
			fmt.Sprint(row.Accepted), fmt.Sprint(row.Declined), fmt.Sprint(row.Pending),
		})
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		log.Print("could not write headcount export")
	}
}

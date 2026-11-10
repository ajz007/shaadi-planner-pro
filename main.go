package main

import (
	"crypto/rand"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
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
	"time"
	"unicode/utf8"
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

func main() {
	const address = "127.0.0.1:8080"
	server := &http.Server{
		Addr: address, Handler: localOnly(newDemo().routes(http.Dir("web/dist"))),
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second,
		WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second,
	}
	log.Printf("Shaadi Planner local demo: http://%s", address)
	log.Fatal(server.ListenAndServe())
}

func localOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Host != "127.0.0.1:8080" && r.Host != "localhost:8080" {
			http.Error(w, "Use the local demo address.", http.StatusForbidden)
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" && origin != "http://"+r.Host {
			http.Error(w, "Request origin does not match the demo.", http.StatusForbidden)
			return
		}
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		next.ServeHTTP(w, r)
	})
}

func (d *demo) routes(assets http.FileSystem) http.Handler {
	mux := http.NewServeMux()
	files := http.FileServer(assets)
	mux.Handle("GET /", files)
	mux.Handle("GET /r/{token}", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.URL.Path = "/"
		files.ServeHTTP(w, r)
	}))
	mux.HandleFunc("GET /api/wedding", d.wedding)
	mux.HandleFunc("GET /api/sample.csv", func(w http.ResponseWriter, _ *http.Request) {
		writeCSVHeaders(w, "sample-guests.csv")
		fmt.Fprint(w, sampleCSV)
	})
	mux.HandleFunc("POST /api/import", d.importGuests)
	mux.HandleFunc("GET /api/headcounts.csv", d.headcounts)
	mux.HandleFunc("POST /api/workbook-snapshot", workbookSnapshot)
	mux.HandleFunc("GET /api/rsvp/{token}", d.guestRSVP)
	mux.HandleFunc("PUT /api/rsvp/{token}", d.saveRSVP)
	mux.HandleFunc("PUT /api/responses", d.saveRSVP)
	return mux
}

func readJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	mediaType, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if mediaType != "application/json" {
		fail(w, http.StatusUnsupportedMediaType, "Expected a JSON request.")
		return false
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 256<<10))
	decoder.DisallowUnknownFields()
	if decoder.Decode(target) != nil || decoder.Decode(new(any)) != io.EOF {
		fail(w, http.StatusBadRequest, "Invalid request or request too large.")
		return false
	}
	return true
}

func reply(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Print("could not write JSON response")
	}
}

func fail(w http.ResponseWriter, status int, message string) {
	reply(w, status, map[string]string{"error": message})
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
	if !readJSON(w, r, &request) {
		return
	}
	guests, err := parseGuests(request.CSV)
	if err != nil {
		fail(w, http.StatusUnprocessableEntity, err.Error())
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
			fail(w, http.StatusConflict, "Existing guest "+entry.ID+" differs from the import. The demo only adds new guests.")
			return
		}
	}
	if len(d.guests)+len(added) > 500 {
		fail(w, http.StatusUnprocessableEntity, "The demo supports up to 500 guests.")
		return
	}
	if request.Confirm {
		d.addGuests(added)
	}
	reply(w, http.StatusOK, map[string]any{
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
	reply(w, http.StatusOK, map[string]any{"groups": d.groups(), "counts": d.counts()})
}

func (d *demo) guestRSVP(w http.ResponseWriter, r *http.Request) {
	d.mu.Lock()
	defer d.mu.Unlock()
	for _, entry := range d.groups() {
		if entry.Token == r.PathValue("token") {
			entry.Token = ""
			reply(w, http.StatusOK, entry)
			return
		}
	}
	fail(w, http.StatusNotFound, "This RSVP link is unavailable.")
}

func (d *demo) saveRSVP(w http.ResponseWriter, r *http.Request) {
	var request struct {
		GuestID  string `json:"guestId"`
		Function string `json:"function"`
		Status   string `json:"status"`
		Revision *int   `json:"revision"`
	}
	if !readJSON(w, r, &request) {
		return
	}
	if request.Revision == nil || !slices.Contains([]string{"pending", "accepted", "declined"}, request.Status) {
		fail(w, http.StatusUnprocessableEntity, "Choose a valid response and include its revision.")
		return
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	key := inviteKey{request.GuestID, request.Function}
	entry, exists := d.invitations[key]
	token := r.PathValue("token")
	if !exists || (token != "" && token != d.tokens[groupKey(d.guests[entry.GuestID])]) {
		fail(w, http.StatusNotFound, "This invitation is unavailable.")
		return
	}
	if entry.Revision != *request.Revision {
		fail(w, http.StatusConflict, "This RSVP changed. Refresh to see the latest response.")
		return
	}
	if entry.Status != request.Status {
		entry.Status = request.Status
		entry.Revision++
		d.invitations[key] = entry
	}
	reply(w, http.StatusOK, entry)
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

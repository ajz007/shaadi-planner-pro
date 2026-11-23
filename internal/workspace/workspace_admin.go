package workspace

import (
	"bytes"
	"context"
	_ "embed"
	"errors"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"sort"
	"time"

	"github.com/ajz007/shaadi-planner-pro/internal/commerce"
)

//go:embed admin_analytics.html
var analyticsHTML string

var analyticsPage = template.Must(template.New("analytics").Funcs(template.FuncMap{
	"rupees": func(paise int64) string { return fmt.Sprintf("₹%d.%02d", paise/100, paise%100) },
}).Parse(analyticsHTML))

var indiaTime = time.FixedZone("IST", 5*60*60+30*60)

type analyticsDay struct {
	Label                string
	NewAccounts, Signins int64
	commerce.AnalyticsCounts
}

type analyticsProduct struct {
	Label string
	commerce.AnalyticsCounts
}

type analyticsGoogleAccount struct {
	Name, Email string
	Weddings    int64
}

type analyticsReport struct {
	Range          string
	Period         string
	HasCommerce    bool
	Total          analyticsDay
	Days           []analyticsDay
	Products       []analyticsProduct
	GoogleAccounts []analyticsGoogleAccount
}

func (a *workspaceHTTP) RegisterAdmin(mux *http.ServeMux, shop *commerce.Shop) {
	mux.HandleFunc("GET /admin", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "private, no-store")
		w.Header().Set("X-Robots-Tag", "noindex, nofollow")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'")
		if a == nil || a.login == nil || a.adminEmail == "" || !a.matchesHost(r) {
			http.NotFound(w, r)
			return
		}
		cookie, err := r.Cookie(workspaceSessionCookie)
		if err != nil || len(cookie.Value) != 43 {
			http.Redirect(w, r, "/auth/google/start?admin=1", http.StatusSeeOther)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		var allowed bool
		err = scanWorkspace(a.store.db.QueryRowContext(ctx, `SELECT COALESCE(admin_email = $2, false)
			FROM workspace_sessions WHERE token_hash = $1 AND expires_at > now()`,
			inviteHash(cookie.Value), a.adminEmail), &allowed)
		switch {
		case errors.Is(err, errWorkspaceNotFound):
			http.Redirect(w, r, "/auth/google/start?admin=1", http.StatusSeeOther)
		case err != nil:
			http.Error(w, "Admin access could not be checked.", http.StatusServiceUnavailable)
		case !allowed:
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusForbidden)
			fmt.Fprint(w, `<!doctype html><html lang="en"><meta charset="utf-8"><title>Admin access</title><h1>Admin access</h1><p><a href="/auth/google/start?admin=1">Sign in with your admin Google account</a></p></html>`)
		default:
			a.renderAnalytics(ctx, w, r, shop)
		}
	})
}

func (a *workspaceHTTP) renderAnalytics(ctx context.Context, w http.ResponseWriter, r *http.Request, shop *commerce.Shop) {
	days := 30
	switch r.URL.Query().Get("days") {
	case "7":
		days = 7
	case "90":
		days = 90
	}
	report, err := a.store.analytics(ctx, shop, time.Now(), days)
	var body bytes.Buffer
	if err == nil {
		err = analyticsPage.Execute(&body, report)
	}
	if err != nil {
		log.Printf("could not load admin analytics: %v", err)
		http.Error(w, "Analytics could not be loaded. Please try again.", http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	body.WriteTo(w)
}

func (s *workspaceStore) analytics(ctx context.Context, shop *commerce.Shop, now time.Time, days int) (analyticsReport, error) {
	year, month, day := now.In(indiaTime).Date()
	today := time.Date(year, month, day, 0, 0, 0, 0, indiaTime)
	start, end := today.AddDate(0, 0, 1-days), today.AddDate(0, 0, 1)
	report := analyticsReport{
		Range: fmt.Sprint(days), HasCommerce: shop != nil,
		Period: start.Format("2 Jan 2006") + " – " + today.Format("2 Jan 2006"),
		Days:   make([]analyticsDay, days),
	}
	byDay := make(map[string]*analyticsDay, days)
	for i := range report.Days {
		date := today.AddDate(0, 0, -i)
		report.Days[i].Label = date.Format("2 Jan")
		byDay[date.Format(time.DateOnly)] = &report.Days[i]
	}
	if err := s.readAccountAnalytics(ctx, start, end, byDay, &report.Total); err != nil {
		return report, err
	}
	accounts, err := s.googleAccountAnalytics(ctx)
	if err != nil {
		return report, err
	}
	report.GoogleAccounts = accounts
	if shop == nil {
		return report, nil
	}
	sales, err := shop.Analytics(ctx, start, end)
	if err != nil {
		return report, err
	}
	byProduct := make(map[string]commerce.AnalyticsCounts)
	for _, row := range sales {
		report.Total.AnalyticsCounts.Add(row.AnalyticsCounts)
		byDay[row.Day].AnalyticsCounts.Add(row.AnalyticsCounts)
		counts := byProduct[row.Product]
		counts.Add(row.AnalyticsCounts)
		byProduct[row.Product] = counts
	}
	for label, counts := range byProduct {
		report.Products = append(report.Products, analyticsProduct{label, counts})
	}
	sort.Slice(report.Products, func(i, j int) bool {
		left, right := report.Products[i], report.Products[j]
		if left.Purchases != right.Purchases {
			return left.Purchases > right.Purchases
		}
		return left.Label < right.Label
	})
	return report, nil
}

func (s *workspaceStore) googleAccountAnalytics(ctx context.Context) ([]analyticsGoogleAccount, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT a.display_name, COALESCE(a.google_email, ''), COUNT(m.wedding_id)
		FROM workspace_accounts a
		LEFT JOIN wedding_memberships m ON m.account_id = a.id AND m.role IN ('owner', 'co-organizer')
		WHERE a.identity_subject LIKE $1
		GROUP BY a.id
		ORDER BY COUNT(m.wedding_id) DESC, lower(a.google_email) NULLS LAST, lower(a.display_name), a.id`, googleSubjectPrefix+"%")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var accounts []analyticsGoogleAccount
	for rows.Next() {
		var account analyticsGoogleAccount
		if err := rows.Scan(&account.Name, &account.Email, &account.Weddings); err != nil {
			return nil, err
		}
		accounts = append(accounts, account)
	}
	return accounts, rows.Err()
}

func (s *workspaceStore) readAccountAnalytics(ctx context.Context, start, end time.Time, byDay map[string]*analyticsDay, total *analyticsDay) error {
	rows, err := s.db.QueryContext(ctx, `WITH accounts AS (
		SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS day, COUNT(*) AS signups
		FROM workspace_accounts WHERE created_at >= $1 AND created_at < $2 AND identity_subject LIKE $3
		GROUP BY 1
	), logins AS (
		SELECT day, signins FROM workspace_daily_signins WHERE
			day >= ($1 AT TIME ZONE 'Asia/Kolkata')::date AND day < ($2 AT TIME ZONE 'Asia/Kolkata')::date
	)
	SELECT to_char(day, 'YYYY-MM-DD'), COALESCE(signups, 0), COALESCE(signins, 0)
	FROM accounts FULL JOIN logins USING (day)`, start, end, googleSubjectPrefix+"%")
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var date string
		var accounts, signins int64
		if err := rows.Scan(&date, &accounts, &signins); err != nil {
			return err
		}
		byDay[date].NewAccounts = accounts
		byDay[date].Signins = signins
		total.NewAccounts += accounts
		total.Signins += signins
	}
	return rows.Err()
}

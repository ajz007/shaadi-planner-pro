package workspace

import (
	"bytes"
	"context"
	"database/sql"
	"image/jpeg"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/ajz007/shaadi-planner-pro/internal/httpx"
)

type guestPageDesign struct {
	Heading    string `json:"heading"`
	Welcome    string `json:"welcome"`
	Theme      string `json:"theme"`
	CoverPhoto []byte `json:"coverPhoto,omitempty"`
}

type guestPageDetails struct {
	Name     string          `json:"name"`
	Date     string          `json:"date"`
	TimeZone string          `json:"timeZone"`
	Design   guestPageDesign `json:"design"`
}

const guestPageColumns = `w.name,w.wedding_date::text,w.time_zone,w.guest_page_heading,w.guest_page_welcome,w.guest_page_theme,w.guest_page_photo`

func scanGuestPage(row *sql.Row, page *guestPageDetails) error {
	return scanWorkspace(row, &page.Name, &page.Date, &page.TimeZone, &page.Design.Heading, &page.Design.Welcome,
		&page.Design.Theme, &page.Design.CoverPhoto)
}

func (a *workspaceHTTP) guestPageSettings(w http.ResponseWriter, r *http.Request, actor string) {
	if !a.rsvpOrganizer(w, r, actor) {
		return
	}
	var result struct {
		guestPageDetails
		Revision int `json:"revision"`
	}
	err := scanWorkspace(a.store.db.QueryRowContext(r.Context(), `SELECT `+guestPageColumns+`,w.guest_page_revision
		FROM weddings w WHERE w.id=$1 AND `+planningOrganizer, r.PathValue("wedding"), actor),
		&result.Name, &result.Date, &result.TimeZone, &result.Design.Heading, &result.Design.Welcome,
		&result.Design.Theme, &result.Design.CoverPhoto, &result.Revision)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	httpx.Reply(w, http.StatusOK, result)
}

func (a *workspaceHTTP) saveGuestPageSettings(w http.ResponseWriter, r *http.Request, actor string) {
	if !a.rsvpOrganizer(w, r, actor) {
		return
	}
	var input struct {
		guestPageDesign
		Revision    int  `json:"revision"`
		RemovePhoto bool `json:"removePhoto"`
	}
	if !httpx.ReadJSON(w, r, &input) {
		return
	}
	input.Heading, input.Welcome = strings.TrimSpace(input.Heading), strings.TrimSpace(input.Welcome)
	if input.Revision < 1 || utf8.RuneCountInString(input.Heading) > 120 || utf8.RuneCountInString(input.Welcome) > 600 ||
		(input.Theme != "marigold" && input.Theme != "rose") || (input.RemovePhoto && len(input.CoverPhoto) != 0) {
		workspaceFailure(w, errWorkspaceInput)
		return
	}
	if len(input.CoverPhoto) != 0 {
		config, err := jpeg.DecodeConfig(bytes.NewReader(input.CoverPhoto))
		if err != nil || len(input.CoverPhoto) > 160<<10 || config.Width > 1600 || config.Height > 1600 {
			httpx.Fail(w, http.StatusUnprocessableEntity, "Choose a JPEG cover photo up to 160 KB and 1,600 pixels on each side.")
			return
		}
		if _, err := jpeg.Decode(bytes.NewReader(input.CoverPhoto)); err != nil {
			workspaceFailure(w, errWorkspaceInput)
			return
		}
	}
	var revision int
	err := scanWorkspace(a.store.db.QueryRowContext(r.Context(), `
		UPDATE weddings SET guest_page_heading=$3,guest_page_welcome=$4,guest_page_theme=$5,
			guest_page_photo=CASE WHEN $8 THEN NULL WHEN $7::bytea IS NOT NULL THEN $7 ELSE guest_page_photo END,
			guest_page_revision=guest_page_revision+1
		WHERE id=$1 AND guest_page_revision=$6 AND `+planningOrganizer+` RETURNING guest_page_revision`,
		r.PathValue("wedding"), actor, input.Heading, input.Welcome, input.Theme, input.Revision, input.CoverPhoto, input.RemovePhoto), &revision)
	if err != nil {
		workspaceFailure(w, runSheetConflict(err))
		return
	}
	httpx.Reply(w, http.StatusOK, map[string]int{"revision": revision})
}

type guestScheduleLink struct {
	ID         string    `json:"id"`
	Date       string    `json:"date"`
	FunctionID string    `json:"functionId"`
	ExpiresAt  time.Time `json:"expiresAt"`
}

func (a *workspaceHTTP) guestScheduleLinks(w http.ResponseWriter, r *http.Request, actor string) {
	if !a.rsvpOrganizer(w, r, actor) {
		return
	}
	links, err := queryWorkspace(r.Context(), a.store.db, func(row *sql.Rows, link *guestScheduleLink) error {
		return row.Scan(&link.ID, &link.Date, &link.FunctionID, &link.ExpiresAt)
	}, `SELECT id,COALESCE(scope_date::text,''),COALESCE(function_id::text,''),expires_at FROM wedding_guest_schedule_links
		WHERE wedding_id=$1 AND revoked_at IS NULL AND expires_at>now() AND `+planningOrganizer+` ORDER BY expires_at DESC,id`,
		r.PathValue("wedding"), actor)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	httpx.Reply(w, http.StatusOK, links)
}

func (a *workspaceHTTP) createGuestScheduleLink(w http.ResponseWriter, r *http.Request, actor string) {
	if !a.rsvpOrganizer(w, r, actor) {
		return
	}
	var input struct{ Date, FunctionID string }
	if !httpx.ReadJSON(w, r, &input) {
		return
	}
	if input.Date != "" {
		if _, err := time.Parse(time.DateOnly, input.Date); err != nil || input.FunctionID != "" {
			workspaceFailure(w, errWorkspaceInput)
			return
		}
	}
	if input.FunctionID != "" && !workspaceUUID.MatchString(input.FunctionID) {
		workspaceFailure(w, errWorkspaceInput)
		return
	}
	token := newRSVPToken()
	var id string
	err := scanWorkspace(a.store.db.QueryRowContext(r.Context(), `
		INSERT INTO wedding_guest_schedule_links(wedding_id,scope_date,function_id,token_hash,expires_at)
		SELECT w.id,NULLIF($3,'')::date,NULLIF($4,'')::uuid,$5,GREATEST(now()+interval '30 days',max(f.starts_at)+interval '2 days')
		FROM weddings w JOIN wedding_functions f ON f.wedding_id=w.id
		WHERE w.id=$1 AND `+guestScheduleScope+` AND `+planningOrganizer+` GROUP BY w.id RETURNING id`,
		r.PathValue("wedding"), actor, input.Date, input.FunctionID, inviteHash(token)), &id)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	httpx.Reply(w, http.StatusCreated, map[string]string{"id": id, "url": a.origin + "/wedding-schedule#" + token})
}

const guestScheduleScope = `($3='' OR (f.starts_at AT TIME ZONE w.time_zone)::date=NULLIF($3,'')::date)
	AND ($4='' OR f.id=NULLIF($4,'')::uuid)`

func (a *workspaceHTTP) revokeGuestScheduleLink(w http.ResponseWriter, r *http.Request, actor string) {
	if !a.rsvpOrganizer(w, r, actor) {
		return
	}
	if !workspaceUUID.MatchString(r.PathValue("id")) {
		workspaceFailure(w, errWorkspaceNotFound)
		return
	}
	var id string
	err := scanWorkspace(a.store.db.QueryRowContext(r.Context(), `UPDATE wedding_guest_schedule_links SET revoked_at=now()
		WHERE wedding_id=$1 AND id=$3 AND revoked_at IS NULL AND `+planningOrganizer+` RETURNING id`,
		r.PathValue("wedding"), actor, r.PathValue("id")), &id)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type guestScheduleEvent struct {
	Name     string    `json:"name"`
	StartsAt time.Time `json:"startsAt"`
	Venue    string    `json:"venue"`
	MapURL   string    `json:"mapUrl"`
}

const guestVenue = `concat_ws(' · ', NULLIF(p.name,''), NULLIF(f.venue,''))`
const guestPlaceJoin = `LEFT JOIN wedding_places p ON p.wedding_id=f.wedding_id AND p.id=f.place_id`

func (a *workspaceHTTP) guestSchedule(w http.ResponseWriter, r *http.Request) {
	if !a.matchesHost(r) || r.Header.Get("Origin") != a.origin {
		httpx.Fail(w, http.StatusForbidden, "Open the schedule link from the wedding planner address.")
		return
	}
	var input struct{ Token string }
	if !httpx.ReadJSON(w, r, &input) {
		return
	}
	if !rsvpToken.MatchString(input.Token) {
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
	hash := inviteHash(input.Token)
	var page guestPageDetails
	err = scanGuestPage(tx.QueryRowContext(ctx, `SELECT `+guestPageColumns+` FROM weddings w JOIN wedding_guest_schedule_links l
		ON l.wedding_id=w.id WHERE l.token_hash=$1 AND l.revoked_at IS NULL AND l.expires_at>now()`, hash), &page)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	events, err := listGuestSchedule(ctx, tx, hash)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	httpx.Reply(w, http.StatusOK, struct {
		guestPageDetails
		Events []guestScheduleEvent `json:"events"`
	}{page, events})
}

func listGuestSchedule(ctx context.Context, db workspaceRowsQueryer, hash []byte) ([]guestScheduleEvent, error) {
	return queryWorkspace(ctx, db, func(row *sql.Rows, event *guestScheduleEvent) error {
		return row.Scan(&event.Name, &event.StartsAt, &event.Venue, &event.MapURL)
	}, `SELECT f.name,f.starts_at,`+guestVenue+`,COALESCE(p.map_url,'') FROM wedding_guest_schedule_links l
		JOIN weddings w ON w.id=l.wedding_id JOIN wedding_functions f ON f.wedding_id=l.wedding_id `+guestPlaceJoin+`
		WHERE l.token_hash=$1 AND (l.scope_date IS NULL OR (f.starts_at AT TIME ZONE w.time_zone)::date=l.scope_date)
		AND (l.function_id IS NULL OR f.id=l.function_id) ORDER BY f.starts_at,f.id`, hash)
}

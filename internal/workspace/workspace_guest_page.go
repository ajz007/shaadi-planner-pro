package workspace

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"image/jpeg"
	"net/http"
	"slices"
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
	ID                string    `json:"id"`
	Date              string    `json:"date"`
	FunctionID        string    `json:"functionId"`
	FamilyFunctionIDs []string  `json:"familyFunctionIds"`
	ExpiresAt         time.Time `json:"expiresAt"`
	URL               string    `json:"url"`
}

const activeSchedule = `revoked_at IS NULL AND expires_at>now()`

func (a *workspaceHTTP) scheduleURL(token string) string {
	return a.origin + "/wedding-schedule#" + token
}

func (a *workspaceHTTP) guestScheduleLinks(w http.ResponseWriter, r *http.Request, actor string) {
	if !a.rsvpOrganizer(w, r, actor) {
		return
	}
	links, err := queryWorkspace(r.Context(), a.store.db, func(row *sql.Rows, link *guestScheduleLink) error {
		var token string
		var familyIDs string
		if err := row.Scan(&link.ID, &link.Date, &link.FunctionID, &link.ExpiresAt, &token, &familyIDs); err != nil {
			return err
		}
		link.FamilyFunctionIDs = strings.Fields(familyIDs)
		link.URL = a.scheduleURL(token)
		return nil
	}, `SELECT id,COALESCE(scope_date::text,''),COALESCE(function_id::text,''),expires_at,share_token,
		COALESCE(array_to_string(family_function_ids,' '),'') FROM wedding_guest_schedule_links
		WHERE wedding_id=$1 AND `+activeSchedule+` AND `+planningOrganizer+` ORDER BY expires_at DESC,id`,
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
	var input struct {
		Date, FunctionID  string
		FamilyFunctionIDs []string
	}
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
	if len(input.FamilyFunctionIDs) > 1000 {
		workspaceFailure(w, errWorkspaceInput)
		return
	}
	for index, id := range input.FamilyFunctionIDs {
		if !workspaceUUID.MatchString(id) {
			workspaceFailure(w, errWorkspaceInput)
			return
		}
		input.FamilyFunctionIDs[index] = strings.ToLower(id)
	}
	slices.Sort(input.FamilyFunctionIDs)
	input.FamilyFunctionIDs = slices.Compact(input.FamilyFunctionIDs)
	familyIDs := strings.Join(input.FamilyFunctionIDs, ",")
	ctx := r.Context()
	tx, err := a.store.db.BeginTx(ctx, nil)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	defer tx.Rollback()
	var wedding string
	// Serialize creation for the wedding so simultaneous requests reuse the same scope.
	err = scanWorkspace(tx.QueryRowContext(ctx, `SELECT id FROM weddings WHERE id=$1 AND `+planningOrganizer+` FOR UPDATE`,
		r.PathValue("wedding"), actor), &wedding)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	var visibleCount, familyCount int
	err = tx.QueryRowContext(ctx, `SELECT count(*),count(*) FILTER (WHERE f.family_only)
		FROM weddings w JOIN wedding_functions f ON f.wedding_id=w.id
		WHERE w.id=$1 AND `+guestScheduleScope+guestScheduleVisibility,
		wedding, input.Date, input.FunctionID, familyIDs).Scan(&visibleCount, &familyCount)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	if visibleCount == 0 || familyCount != len(input.FamilyFunctionIDs) {
		httpx.Fail(w, http.StatusUnprocessableEntity, "Choose a schedule with guest functions or explicitly select the family-only functions to share.")
		return
	}
	var id, token string
	err = scanWorkspace(tx.QueryRowContext(ctx, `SELECT id,share_token FROM wedding_guest_schedule_links
		WHERE wedding_id=$1 AND scope_date IS NOT DISTINCT FROM NULLIF($2,'')::date
		AND function_id IS NOT DISTINCT FROM NULLIF($3,'')::uuid
		AND family_function_ids=string_to_array($4,',')::uuid[] AND `+activeSchedule+`
		ORDER BY expires_at DESC,id LIMIT 1 FOR UPDATE`, wedding, input.Date, input.FunctionID, familyIDs), &id, &token)
	status := http.StatusOK
	if errors.Is(err, errWorkspaceNotFound) {
		token = newRSVPToken()
		status = http.StatusCreated
		err = scanWorkspace(tx.QueryRowContext(ctx, `
			INSERT INTO wedding_guest_schedule_links(wedding_id,scope_date,function_id,family_function_ids,token_hash,share_token,expires_at)
			SELECT w.id,NULLIF($2,'')::date,NULLIF($3,'')::uuid,string_to_array($4,',')::uuid[],$5,$6,GREATEST(now()+interval '30 days',max(f.starts_at)+interval '2 days')
			FROM weddings w JOIN wedding_functions f ON f.wedding_id=w.id
			WHERE w.id=$1 AND `+guestScheduleScope+guestScheduleVisibility+` GROUP BY w.id RETURNING id`,
			wedding, input.Date, input.FunctionID, familyIDs, inviteHash(token), token), &id)
	}
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	if err := tx.Commit(); err != nil {
		workspaceFailure(w, err)
		return
	}
	httpx.Reply(w, status, map[string]string{"id": id, "url": a.scheduleURL(token)})
}

const guestScheduleScope = `($2='' OR (f.starts_at AT TIME ZONE w.time_zone)::date=NULLIF($2,'')::date)
	AND ($3='' OR f.id=NULLIF($3,'')::uuid)`
const guestScheduleVisibility = ` AND (NOT f.family_only OR f.id=ANY(string_to_array($4,',')::uuid[]))`

const guestScheduleToken = `(l.token_hash=$1 OR l.share_token=$2)`

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
		ON l.wedding_id=w.id WHERE `+guestScheduleToken+` AND `+activeSchedule, hash, input.Token), &page)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	events, err := listGuestSchedule(ctx, tx, hash, input.Token)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	httpx.Reply(w, http.StatusOK, struct {
		guestPageDetails
		Events []guestScheduleEvent `json:"events"`
	}{page, events})
}

func listGuestSchedule(ctx context.Context, db workspaceRowsQueryer, hash []byte, token string) ([]guestScheduleEvent, error) {
	return queryWorkspace(ctx, db, func(row *sql.Rows, event *guestScheduleEvent) error {
		return row.Scan(&event.Name, &event.StartsAt, &event.Venue, &event.MapURL)
	}, `SELECT f.name,f.starts_at,`+guestVenue+`,COALESCE(p.map_url,'') FROM wedding_guest_schedule_links l
		JOIN weddings w ON w.id=l.wedding_id JOIN wedding_functions f ON f.wedding_id=l.wedding_id `+guestPlaceJoin+`
		WHERE `+guestScheduleToken+` AND (l.scope_date IS NULL OR (f.starts_at AT TIME ZONE w.time_zone)::date=l.scope_date)
		AND (l.function_id IS NULL OR f.id=l.function_id)
		AND (NOT f.family_only OR f.id=ANY(l.family_function_ids)) ORDER BY f.starts_at,f.id`, hash, token)
}

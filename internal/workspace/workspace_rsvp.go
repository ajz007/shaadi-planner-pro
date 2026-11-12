package workspace

import (
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/ajz007/shaadi-planner-pro/internal/httpx"
	"github.com/jackc/pgx/v5/pgconn"
)

var rsvpToken = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)

type rsvpLink struct {
	ID        string     `json:"id"`
	Label     string     `json:"label"`
	ExpiresAt time.Time  `json:"expiresAt"`
	RevokedAt *time.Time `json:"revokedAt"`
	Revision  int        `json:"revision"`
}

type rsvpInvitation struct {
	ID          string     `json:"id"`
	Guest       string     `json:"guest"`
	Function    string     `json:"function"`
	StartsAt    time.Time  `json:"startsAt"`
	Status      string     `json:"status"`
	Revision    int        `json:"revision"`
	LinkID      string     `json:"linkId,omitempty"`
	FunctionID  string     `json:"functionId,omitempty"`
	ReplySource string     `json:"replySource,omitempty"`
	RepliedAt   *time.Time `json:"repliedAt,omitempty"`
}

type rsvpReply struct {
	Status   string `json:"status"`
	Revision int    `json:"revision"`
}

func (r rsvpReply) valid(organizer bool) bool {
	return r.Revision > 0 && (r.Status == "attending" || r.Status == "declined" || (organizer && r.Status == "pending"))
}

func newRSVPToken() string {
	var secret [32]byte
	rand.Read(secret[:])
	return base64.RawURLEncoding.EncodeToString(secret[:])
}

func (a *workspaceHTTP) rsvpOrganizer(w http.ResponseWriter, r *http.Request, actor string) bool {
	wedding := r.PathValue("wedding")
	if !workspaceUUID.MatchString(wedding) {
		workspaceFailure(w, errWorkspaceNotFound)
		return false
	}
	if err := a.store.requireOrganizer(r.Context(), wedding, actor); err != nil {
		workspaceFailure(w, err)
		return false
	}
	return true
}

const rsvpInvitationDetails = `JOIN wedding_guests g ON g.wedding_id=i.wedding_id AND g.id=i.guest_id
	JOIN wedding_functions f ON f.wedding_id=i.wedding_id AND f.id=i.function_id`

func (a *workspaceHTTP) organizerRSVP(w http.ResponseWriter, r *http.Request, actor string) {
	if !a.rsvpOrganizer(w, r, actor) {
		return
	}
	ctx, wedding := r.Context(), r.PathValue("wedding")
	links, err := queryWorkspace(ctx, a.store.db, func(row *sql.Rows, link *rsvpLink) error {
		return row.Scan(&link.ID, &link.Label, &link.ExpiresAt, &link.RevokedAt, &link.Revision)
	}, `SELECT id,label,expires_at,revoked_at,revision FROM wedding_rsvp_links
		WHERE wedding_id=$1 AND `+planningOrganizer+` ORDER BY label,id`, wedding, actor)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	invitations, err := queryWorkspace(ctx, a.store.db, func(row *sql.Rows, i *rsvpInvitation) error {
		return row.Scan(&i.ID, &i.Guest, &i.Function, &i.StartsAt, &i.Status, &i.Revision,
			&i.LinkID, &i.FunctionID, &i.ReplySource, &i.RepliedAt)
	}, `SELECT i.id,g.name,f.name,f.starts_at,i.status,i.revision,i.link_id,i.function_id,
		COALESCE(i.reply_source,''),i.replied_at FROM wedding_rsvp_invitations i `+rsvpInvitationDetails+`
		WHERE i.wedding_id=$1 AND `+planningOrganizer+` ORDER BY f.starts_at,g.name,i.id`, wedding, actor)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	httpx.Reply(w, http.StatusOK, map[string]any{"links": links, "invitations": invitations})
}

func (a *workspaceHTTP) createRSVP(w http.ResponseWriter, r *http.Request, actor string) {
	if !a.rsvpOrganizer(w, r, actor) {
		return
	}
	var input struct {
		Invitations []struct{ GuestID, FunctionID string }
	}
	if !httpx.ReadJSON(w, r, &input) {
		return
	}
	if len(input.Invitations) == 0 || len(input.Invitations) > 1000 {
		httpx.Fail(w, http.StatusUnprocessableEntity, "Select at least one guest for a function. Each link supports up to 1,000 guest and function pairs.")
		return
	}
	guests, functions := make([]string, 0, len(input.Invitations)), make([]string, 0, len(input.Invitations))
	seen := make(map[string]bool, len(input.Invitations))
	for _, invitation := range input.Invitations {
		pair := strings.ToLower(invitation.GuestID + invitation.FunctionID)
		if !workspaceUUID.MatchString(invitation.GuestID) || !workspaceUUID.MatchString(invitation.FunctionID) || seen[pair] {
			workspaceFailure(w, errWorkspaceInput)
			return
		}
		seen[pair] = true
		guests = append(guests, invitation.GuestID)
		functions = append(functions, invitation.FunctionID)
	}
	ctx, wedding := r.Context(), r.PathValue("wedding")
	token := newRSVPToken()
	var linkID string
	err := scanWorkspace(a.store.db.QueryRowContext(ctx, `
		WITH selected AS (
			SELECT g.id AS guest_id,f.id AS function_id,g.name,g.household
			FROM unnest($3::text[],$4::text[]) AS pairs(guest_id,function_id)
			JOIN wedding_guests g ON g.wedding_id=$1 AND g.id=pairs.guest_id::uuid
			JOIN wedding_functions f ON f.wedding_id=$1 AND f.id=pairs.function_id::uuid
		), link AS (
			INSERT INTO wedding_rsvp_links(wedding_id,label,token_hash,expires_at)
			SELECT $1,COALESCE(NULLIF(min(household),''),min(name)),$5,now()+interval '30 days' FROM selected
			HAVING count(*)=cardinality($3::text[]) AND (count(DISTINCT guest_id)=1 OR
				(count(DISTINCT lower(btrim(household)))=1 AND bool_and(btrim(household)<>'')))
				AND `+planningOrganizer+`
			RETURNING id,wedding_id
		), invitations AS (
			INSERT INTO wedding_rsvp_invitations(wedding_id,link_id,guest_id,function_id)
			SELECT link.wedding_id,link.id,selected.guest_id,selected.function_id FROM link CROSS JOIN selected
		)
		SELECT id FROM link`, wedding, actor, guests, functions, inviteHash(token)), &linkID)
	var dbError *pgconn.PgError
	switch {
	case errors.Is(err, errWorkspaceNotFound):
		httpx.Fail(w, http.StatusUnprocessableEntity, "Choose guests from one household and functions from this wedding.")
	case errors.As(err, &dbError) && dbError.Code == "23505":
		httpx.Fail(w, http.StatusConflict, "A selected guest already has an invitation for a selected function. Choose a different combination or manage the existing link.")
	case err != nil:
		workspaceFailure(w, err)
	default:
		a.sendRSVPLink(w, http.StatusCreated, linkID, token)
	}
}

func (a *workspaceHTTP) sendRSVPLink(w http.ResponseWriter, status int, id, token string) {
	httpx.Reply(w, status, map[string]string{"id": id, "url": a.origin + "/rsvp#" + token})
}

func (a *workspaceHTTP) changeRSVPLink(w http.ResponseWriter, r *http.Request, actor string) {
	if !a.rsvpOrganizer(w, r, actor) {
		return
	}
	id := r.PathValue("id")
	if !workspaceUUID.MatchString(id) {
		workspaceFailure(w, errWorkspaceNotFound)
		return
	}
	var input struct {
		Action   string
		Revision int
	}
	if !httpx.ReadJSON(w, r, &input) {
		return
	}
	if input.Revision < 1 || (input.Action != "revoke" && input.Action != "replace") {
		workspaceFailure(w, errWorkspaceInput)
		return
	}
	wedding := r.PathValue("wedding")
	token := newRSVPToken()
	var updated string
	err := scanWorkspace(a.store.db.QueryRowContext(r.Context(), `
		UPDATE wedding_rsvp_links SET revision=revision+1,
			revoked_at=CASE WHEN $5 THEN now() ELSE NULL END,
			token_hash=CASE WHEN $5 THEN token_hash ELSE $6 END,
			expires_at=CASE WHEN $5 THEN expires_at ELSE now()+interval '30 days' END
		WHERE wedding_id=$1 AND id=$3 AND revision=$4 AND `+planningOrganizer+` RETURNING id`,
		wedding, actor, id, input.Revision, input.Action == "revoke", inviteHash(token)), &updated)
	if errors.Is(err, errWorkspaceNotFound) {
		err = errWorkspaceConflict
	}
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	if input.Action == "revoke" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	a.sendRSVPLink(w, http.StatusOK, updated, token)
}

func (a *workspaceHTTP) organizerRSVPReply(w http.ResponseWriter, r *http.Request, actor string) {
	if !a.rsvpOrganizer(w, r, actor) {
		return
	}
	id := r.PathValue("id")
	if !workspaceUUID.MatchString(id) {
		workspaceFailure(w, errWorkspaceNotFound)
		return
	}
	var input rsvpReply
	if !httpx.ReadJSON(w, r, &input) {
		return
	}
	if !input.valid(true) {
		workspaceFailure(w, errWorkspaceInput)
		return
	}
	var updated string
	err := scanWorkspace(a.store.db.QueryRowContext(r.Context(), `
		UPDATE wedding_rsvp_invitations SET status=$4, revision=revision+1, reply_source='organizer', replied_at=now()
		WHERE wedding_id=$1 AND id=$3 AND revision=$5 AND `+planningOrganizer+` RETURNING id`,
		r.PathValue("wedding"), actor, id, input.Status, input.Revision), &updated)
	if errors.Is(err, errWorkspaceNotFound) {
		err = errWorkspaceConflict
	}
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *workspaceHTTP) guestRSVP(w http.ResponseWriter, r *http.Request) {
	if !a.matchesHost(r) || r.Header.Get("Origin") != a.origin {
		httpx.Fail(w, http.StatusForbidden, "Open the RSVP link from the wedding planner address.")
		return
	}
	var input struct {
		Token string
		ID    string
		Reply *rsvpReply
	}
	if !httpx.ReadJSON(w, r, &input) {
		return
	}
	if !rsvpToken.MatchString(input.Token) {
		workspaceFailure(w, errWorkspaceNotFound)
		return
	}
	ctx, hash := r.Context(), inviteHash(input.Token)
	if input.Reply != nil {
		if !workspaceUUID.MatchString(input.ID) || !input.Reply.valid(false) {
			workspaceFailure(w, errWorkspaceInput)
			return
		}
		var revision int
		err := scanWorkspace(a.store.db.QueryRowContext(ctx, `
			WITH link AS (
				SELECT id,wedding_id FROM wedding_rsvp_links WHERE token_hash=$1 AND revoked_at IS NULL
					AND expires_at>now() FOR UPDATE
			), updated AS (
				UPDATE wedding_rsvp_invitations i SET status=$3, revision=i.revision+1, reply_source='guest', replied_at=now()
				FROM link WHERE i.wedding_id=link.wedding_id AND i.link_id=link.id AND i.id=$2 AND i.revision=$4
				RETURNING i.revision
			)
			SELECT COALESCE((SELECT revision FROM updated),0) FROM link`,
			hash, input.ID, input.Reply.Status, input.Reply.Revision), &revision)
		if err == nil && revision == 0 {
			err = errWorkspaceConflict
		}
		if err != nil {
			workspaceFailure(w, err)
			return
		}
		httpx.Reply(w, http.StatusOK, rsvpReply{Status: input.Reply.Status, Revision: revision})
		return
	}
	var name, zone string
	invitations, err := queryWorkspace(ctx, a.store.db, func(row *sql.Rows, i *rsvpInvitation) error {
		return row.Scan(&name, &zone, &i.ID, &i.Guest, &i.Function, &i.StartsAt, &i.Status, &i.Revision)
	}, `SELECT w.name,w.time_zone,i.id,g.name,f.name,f.starts_at,i.status,i.revision
		FROM wedding_rsvp_invitations i `+rsvpInvitationDetails+`
		JOIN wedding_rsvp_links l ON l.wedding_id=i.wedding_id AND l.id=i.link_id
		JOIN weddings w ON w.id=i.wedding_id
		WHERE l.token_hash=$1 AND l.revoked_at IS NULL AND l.expires_at>now()
		ORDER BY g.name,f.starts_at,i.id`, hash)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	if len(invitations) == 0 {
		httpx.Fail(w, http.StatusNotFound, "This RSVP link has expired or is unavailable. Ask the organizer for a new link.")
		return
	}
	httpx.Reply(w, http.StatusOK, map[string]any{"name": name, "timeZone": zone, "invitations": invitations})
}

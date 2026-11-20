package workspace

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/ajz007/shaadi-planner-pro/internal/httpx"
)

// The digital invitation is presentation content layered over the wedding's
// existing functions, places and guest links. Functions keep their own names,
// times and venues; the invitation only adds an icon, a subtitle and an
// optional time label for each of them.

const maxInvitationMusic = 5 << 20

var (
	invitationSymbols = []string{"om", "shri", "swastik", "kalash"}
	invitationIcons   = []string{"", "diya", "kalash", "haldi", "mehendi", "sangeet", "baraat", "varmala", "pheras",
		"vidaai", "reception", "rings", "dinner"}
	invitationPhone = regexp.MustCompile(`^\+?[0-9][0-9 -]{6,18}[0-9]$`)
)

type invitationPerson struct {
	Honorific   string `json:"honorific"`
	Name        string `json:"name"`
	ShortName   string `json:"shortName"`
	ParentLabel string `json:"parentLabel"`
	Parents     string `json:"parents"`
}

type invitationFamilyLine struct {
	Relation string `json:"relation"`
	Names    string `json:"names"`
}

type invitationFamilyCard struct {
	Title string                 `json:"title"`
	Lines []invitationFamilyLine `json:"lines"`
}

type invitationFamily struct {
	Heading string                 `json:"heading"`
	Cards   []invitationFamilyCard `json:"cards"`
}

type invitationContact struct {
	Name  string `json:"name"`
	Role  string `json:"role"`
	Phone string `json:"phone"`
}

type invitationEventStyle struct {
	Icon      string `json:"icon"`
	Subtitle  string `json:"subtitle"`
	TimeLabel string `json:"timeLabel"`
}

type invitationContent struct {
	Groom         invitationPerson                `json:"groom"`
	Bride         invitationPerson                `json:"bride"`
	BrideFirst    bool                            `json:"brideFirst"`
	Symbols       []string                        `json:"symbols"`
	Invocation    string                          `json:"invocation"`
	Shloka        string                          `json:"shloka"`
	BlessingIntro string                          `json:"blessingIntro"`
	Deity         string                          `json:"deity"`
	EldersIntro   string                          `json:"eldersIntro"`
	Elders        string                          `json:"elders"`
	EldersNote    string                          `json:"eldersNote"`
	Intro         string                          `json:"intro"`
	Title         string                          `json:"title"`
	Events        map[string]invitationEventStyle `json:"events"`
	Families      []invitationFamily              `json:"families"`
	DressCode     string                          `json:"dressCode"`
	RSVPBy        string                          `json:"rsvpBy"`
	Contacts      []invitationContact             `json:"contacts"`
	Closing       string                          `json:"closing"`
	RegardsIntro  string                          `json:"regardsIntro"`
	Hosts         string                          `json:"hosts"`
}

type invitationEvent struct {
	ID              string    `json:"id"`
	Name            string    `json:"name"`
	StartsAt        time.Time `json:"startsAt"`
	DurationMinutes *int      `json:"durationMinutes,omitempty"`
	Place           string    `json:"place"`
	Address         string    `json:"address"`
	MapURL          string    `json:"mapUrl"`
	FamilyOnly      bool      `json:"familyOnly,omitempty"`
}

type publicInvitation struct {
	Template invitationDesign  `json:"template"`
	Content  invitationContent `json:"content"`
	HasMusic bool              `json:"hasMusic"`
	Events   []invitationEvent `json:"events"`
}

// cleanText trims a field and rejects it when it is too long or contains
// control characters. Line breaks are kept only where multiline is allowed.
func cleanText(value *string, max int, multiline bool) bool {
	text := strings.TrimSpace(strings.ReplaceAll(*value, "\r\n", "\n"))
	if utf8.RuneCountInString(text) > max || !utf8.ValidString(text) {
		return false
	}
	for _, r := range text {
		if r == '\n' && multiline {
			continue
		}
		if unicode.IsControl(r) {
			return false
		}
	}
	*value = text
	return true
}

func (p *invitationPerson) normalize() bool {
	return cleanText(&p.Honorific, 30, false) && cleanText(&p.Name, 80, false) && cleanText(&p.ShortName, 30, false) &&
		cleanText(&p.ParentLabel, 40, false) && cleanText(&p.Parents, 200, false)
}

func (c *invitationContent) normalize() bool {
	if !c.Groom.normalize() || !c.Bride.normalize() || len(c.Symbols) > 3 {
		return false
	}
	seen := map[string]bool{}
	for _, symbol := range c.Symbols {
		if !slices.Contains(invitationSymbols, symbol) || seen[symbol] {
			return false
		}
		seen[symbol] = true
	}
	for _, field := range []struct {
		value     *string
		max       int
		multiline bool
	}{
		{&c.Invocation, 80, false}, {&c.Shloka, 300, true}, {&c.BlessingIntro, 120, false}, {&c.Deity, 80, false},
		{&c.EldersIntro, 120, false}, {&c.Elders, 200, false}, {&c.EldersNote, 80, false}, {&c.Intro, 200, false},
		{&c.Title, 40, false}, {&c.DressCode, 200, false}, {&c.Closing, 120, false}, {&c.RegardsIntro, 60, false},
		{&c.Hosts, 200, false}, {&c.RSVPBy, 10, false},
	} {
		if !cleanText(field.value, field.max, field.multiline) {
			return false
		}
	}
	if c.RSVPBy != "" {
		if _, err := time.Parse(time.DateOnly, c.RSVPBy); err != nil {
			return false
		}
	}
	if len(c.Events) > 80 {
		return false
	}
	if c.Events == nil {
		c.Events = map[string]invitationEventStyle{}
	}
	for id, style := range c.Events {
		if !workspaceUUID.MatchString(id) || !slices.Contains(invitationIcons, style.Icon) ||
			!cleanText(&style.Subtitle, 80, false) || !cleanText(&style.TimeLabel, 60, false) {
			return false
		}
		if style == (invitationEventStyle{}) {
			delete(c.Events, id)
			continue
		}
		c.Events[id] = style
	}
	if len(c.Families) > 4 || len(c.Contacts) > 6 {
		return false
	}
	for i := range c.Families {
		family := &c.Families[i]
		if !cleanText(&family.Heading, 80, false) || len(family.Cards) > 6 {
			return false
		}
		for j := range family.Cards {
			card := &family.Cards[j]
			if !cleanText(&card.Title, 80, false) || len(card.Lines) > 12 {
				return false
			}
			for k := range card.Lines {
				line := &card.Lines[k]
				if !cleanText(&line.Relation, 80, false) || !cleanText(&line.Names, 600, true) {
					return false
				}
			}
			card.Lines = slices.DeleteFunc(card.Lines, func(line invitationFamilyLine) bool { return line.Names == "" })
			if card.Lines == nil {
				card.Lines = []invitationFamilyLine{}
			}
		}
		family.Cards = slices.DeleteFunc(family.Cards, func(card invitationFamilyCard) bool { return len(card.Lines) == 0 })
		if family.Cards == nil {
			family.Cards = []invitationFamilyCard{}
		}
	}
	c.Families = slices.DeleteFunc(c.Families, func(family invitationFamily) bool { return len(family.Cards) == 0 })
	for i := range c.Contacts {
		contact := &c.Contacts[i]
		if !cleanText(&contact.Name, 80, false) || !cleanText(&contact.Role, 60, false) || !cleanText(&contact.Phone, 20, false) {
			return false
		}
		if contact.Name == "" || !invitationPhone.MatchString(contact.Phone) {
			return false
		}
	}
	if c.Symbols == nil {
		c.Symbols = []string{}
	}
	if c.Families == nil {
		c.Families = []invitationFamily{}
	}
	if c.Contacts == nil {
		c.Contacts = []invitationContact{}
	}
	return true
}

func decodeInvitationContent(raw []byte) invitationContent {
	var content invitationContent
	if err := json.Unmarshal(raw, &content); err != nil || !content.normalize() {
		content = invitationContent{}
		content.normalize()
	}
	return content
}

const invitationEventColumns = `f.id,f.name,f.starts_at,f.duration_minutes,COALESCE(NULLIF(p.name,''),f.venue),
	COALESCE(p.address,''),COALESCE(p.map_url,''),f.family_only`

func scanInvitationEvent(row *sql.Rows, event *invitationEvent) error {
	var duration sql.NullInt64
	if err := row.Scan(&event.ID, &event.Name, &event.StartsAt, &duration, &event.Place, &event.Address, &event.MapURL,
		&event.FamilyOnly); err != nil {
		return err
	}
	if duration.Valid {
		minutes := int(duration.Int64)
		event.DurationMinutes = &minutes
	}
	return nil
}

// loadPublicInvitation returns nil when the wedding has no published
// invitation. Only the listed functions are included, so a guest never sees
// functions that are not on their own link.
func loadPublicInvitation(ctx context.Context, tx *sql.Tx, wedding string, functionIDs []string) (*publicInvitation, error) {
	var raw, options []byte
	var template string
	var version int
	var invitation publicInvitation
	// Guests always see the published snapshot, never the organizer's draft.
	err := tx.QueryRowContext(ctx, `SELECT published->'content',published->>'templateId',(published->>'templateVersion')::integer,
		published->'templateOptions',music IS NOT NULL
		FROM wedding_invitations WHERE wedding_id=$1 AND enabled AND published IS NOT NULL`, wedding).
		Scan(&raw, &template, &version, &options, &invitation.HasMusic)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	invitation.Content = decodeInvitationContent(raw)
	invitation.Template = storedDesign(template, version, options)
	invitation.Events, err = queryWorkspace(ctx, tx, scanInvitationEvent, `SELECT `+invitationEventColumns+`
		FROM wedding_functions f `+guestPlaceJoin+` WHERE f.wedding_id=$1 AND f.id=ANY($2::uuid[]) ORDER BY f.starts_at,f.id`,
		wedding, functionIDs)
	if err != nil {
		return nil, err
	}
	visible := map[string]bool{}
	for i := range invitation.Events {
		invitation.Events[i].FamilyOnly = false // guests never need the organizer's flag
		visible[invitation.Events[i].ID] = true
	}
	for id := range invitation.Content.Events {
		if !visible[id] {
			delete(invitation.Content.Events, id)
		}
	}
	return &invitation, nil
}

// The draft columns hold what organizers edit; published holds the same
// fields as a snapshot. A save changes only the draft.
const draftSnapshot = `jsonb_build_object('content',content,'templateId',template_id,'templateVersion',template_version,
	'templateOptions',template_options)`

type invitationSettings struct {
	Live               bool              `json:"live"`
	EverPublished      bool              `json:"everPublished"`
	PublishedAt        *time.Time        `json:"publishedAt,omitempty"`
	UnpublishedChanges bool              `json:"unpublishedChanges"`
	Template           invitationDesign  `json:"template"`
	Content            invitationContent `json:"content"`
	HasMusic           bool              `json:"hasMusic"`
	MusicName          string            `json:"musicName"`
	Revision           int               `json:"revision"`
	Events             []invitationEvent `json:"events"`
}

func (a *workspaceHTTP) invitationSettings(w http.ResponseWriter, r *http.Request, actor string) {
	if !a.rsvpOrganizer(w, r, actor) {
		return
	}
	ctx, wedding := r.Context(), r.PathValue("wedding")
	var settings invitationSettings
	var raw, options []byte
	var template string
	var version int
	var publishedAt sql.NullTime
	err := a.store.db.QueryRowContext(ctx, `SELECT enabled AND published IS NOT NULL,published IS NOT NULL,published_at,
		published IS NOT NULL AND published IS DISTINCT FROM `+draftSnapshot+`,
		content,template_id,template_version,template_options,music IS NOT NULL,music_name,revision
		FROM wedding_invitations WHERE wedding_id=$1`, wedding).
		Scan(&settings.Live, &settings.EverPublished, &publishedAt, &settings.UnpublishedChanges,
			&raw, &template, &version, &options, &settings.HasMusic, &settings.MusicName, &settings.Revision)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		workspaceFailure(w, err)
		return
	}
	if publishedAt.Valid {
		settings.PublishedAt = &publishedAt.Time
	}
	settings.Content = decodeInvitationContent(raw)
	settings.Template = storedDesign(template, version, options)
	settings.Events, err = queryWorkspace(ctx, a.store.db, scanInvitationEvent, `SELECT `+invitationEventColumns+`
		FROM wedding_functions f `+guestPlaceJoin+` WHERE f.wedding_id=$1 ORDER BY f.starts_at,f.id`, wedding)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	httpx.Reply(w, http.StatusOK, settings)
}

// Saving uses the same revision check for a first save (revision 0) and later
// saves, so two organizers editing at once cannot overwrite each other.
const saveInvitation = `INSERT INTO wedding_invitations AS saved(wedding_id,enabled,content,music,music_name,
		template_id,template_version,template_options)
	SELECT $1::uuid,$3::boolean,$4::jsonb,$6::bytea,$7::text,$8::text,$9::integer,$10::jsonb
	WHERE $5::integer=0 AND ` + planningOrganizer + `
	ON CONFLICT (wedding_id) DO NOTHING RETURNING revision`

func (a *workspaceHTTP) saveInvitationSettings(w http.ResponseWriter, r *http.Request, actor string) {
	if !a.rsvpOrganizer(w, r, actor) {
		return
	}
	var input struct {
		Content  invitationContent `json:"content"`
		Template struct {
			ID      string         `json:"id"`
			Options map[string]any `json:"options"`
		} `json:"template"`
		Revision int `json:"revision"`
	}
	if !httpx.ReadJSON(w, r, &input) {
		return
	}
	template, known := invitationTemplates[input.Template.ID]
	if !known {
		httpx.Fail(w, http.StatusUnprocessableEntity, "Choose an available invitation design.")
		return
	}
	options, valid := template.normalize(input.Template.Options, true)
	if input.Revision < 0 || !valid || !input.Content.normalize() {
		workspaceFailure(w, errWorkspaceInput)
		return
	}
	content, err := json.Marshal(input.Content)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	optionJSON, err := json.Marshal(options)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	ctx, wedding := r.Context(), r.PathValue("wedding")
	var revision int
	if input.Revision == 0 {
		err = scanWorkspace(a.store.db.QueryRowContext(ctx, saveInvitation, wedding, actor, false, string(content), 0, nil, "",
			template.ID, template.Version, string(optionJSON)), &revision)
	} else {
		// Saving updates only the draft and moves it to the template's current
		// version. Guests keep seeing the published snapshot until it is published.
		err = scanWorkspace(a.store.db.QueryRowContext(ctx, `UPDATE wedding_invitations
			SET content=$3::jsonb,template_id=$5,template_version=$6,template_options=$7::jsonb,
				revision=revision+1,updated_at=now()
			WHERE wedding_id=$1 AND revision=$4 AND `+planningOrganizer+` RETURNING revision`,
			wedding, actor, string(content), input.Revision, template.ID, template.Version, string(optionJSON)), &revision)
	}
	if err != nil {
		workspaceFailure(w, runSheetConflict(err))
		return
	}
	httpx.Reply(w, http.StatusOK, map[string]int{"revision": revision})
}

func validMP3(data []byte) bool {
	return len(data) > 4 && (string(data[:3]) == "ID3" || (data[0] == 0xFF && data[1]&0xE0 == 0xE0))
}

// saveInvitationMusic takes the raw MP3 as the request body. An empty body
// removes the music. The revision is passed in the query string.
func (a *workspaceHTTP) saveInvitationMusic(w http.ResponseWriter, r *http.Request, actor string) {
	if !a.rsvpOrganizer(w, r, actor) {
		return
	}
	revision, err := strconv.Atoi(r.URL.Query().Get("revision"))
	if err != nil || revision < 0 {
		workspaceFailure(w, errWorkspaceInput)
		return
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxInvitationMusic+1))
	if err != nil || len(data) > maxInvitationMusic {
		httpx.Fail(w, http.StatusRequestEntityTooLarge, "Choose an MP3 file up to 5 MB.")
		return
	}
	var music any
	name := ""
	if len(data) > 0 {
		mediaType, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if mediaType != "audio/mpeg" || !validMP3(data) {
			httpx.Fail(w, http.StatusUnprocessableEntity, "Choose an MP3 file up to 5 MB.")
			return
		}
		music = data
		name, _ = url.QueryUnescape(r.Header.Get("X-File-Name"))
		if !cleanText(&name, 120, false) {
			name = "Background music"
		}
	}
	ctx, wedding := r.Context(), r.PathValue("wedding")
	var saved int
	if revision == 0 {
		err = scanWorkspace(a.store.db.QueryRowContext(ctx, saveInvitation, wedding, actor, false, "{}", 0, music, name,
			defaultInvitationTemplate, invitationTemplates[defaultInvitationTemplate].Version, "{}"), &saved)
	} else {
		err = scanWorkspace(a.store.db.QueryRowContext(ctx, `UPDATE wedding_invitations
			SET music=$3::bytea,music_name=$4,revision=revision+1,updated_at=now()
			WHERE wedding_id=$1 AND revision=$5 AND `+planningOrganizer+` RETURNING revision`,
			wedding, actor, music, name, revision), &saved)
	}
	if err != nil {
		workspaceFailure(w, runSheetConflict(err))
		return
	}
	httpx.Reply(w, http.StatusOK, map[string]int{"revision": saved})
}

// guestInvitationMusic serves the music for an active RSVP or schedule link.
// The token travels in the POST body, like the other guest requests, so it
// never appears in a URL or a server log.
func (a *workspaceHTTP) guestInvitationMusic(w http.ResponseWriter, r *http.Request) {
	if !a.matchesHost(r) || r.Header.Get("Origin") != a.origin {
		httpx.Fail(w, http.StatusForbidden, "Open the invitation from the wedding planner address.")
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
	var music []byte
	err := scanWorkspace(a.store.db.QueryRowContext(r.Context(), `SELECT i.music FROM wedding_invitations i
		WHERE i.enabled AND i.published IS NOT NULL AND i.music IS NOT NULL AND i.wedding_id IN (
			SELECT wedding_id FROM wedding_rsvp_links WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()
			UNION ALL
			SELECT l.wedding_id FROM wedding_guest_schedule_links l WHERE `+guestScheduleToken+` AND `+activeSchedule+`)
		LIMIT 1`, inviteHash(input.Token), input.Token), &music)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	w.Header().Set("Content-Type", "audio/mpeg")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Length", strconv.Itoa(len(music)))
	_, _ = w.Write(music)
}

// invitationMusic lets organizers play the saved music in the preview.
func (a *workspaceHTTP) invitationMusic(w http.ResponseWriter, r *http.Request, actor string) {
	if !a.rsvpOrganizer(w, r, actor) {
		return
	}
	var music []byte
	err := scanWorkspace(a.store.db.QueryRowContext(r.Context(), `SELECT music FROM wedding_invitations
		WHERE wedding_id=$1 AND music IS NOT NULL`, r.PathValue("wedding")), &music)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	w.Header().Set("Content-Type", "audio/mpeg")
	w.Header().Set("Content-Length", strconv.Itoa(len(music)))
	_, _ = w.Write(music)
}

// publishInvitation changes what guests see:
//   - publish: copy the draft to the published snapshot and show it to guests
//   - unpublish: stop showing the invitation (guests see the simple page)
//   - discard: replace the draft with the published snapshot
func (a *workspaceHTTP) publishInvitation(w http.ResponseWriter, r *http.Request, actor string) {
	if !a.rsvpOrganizer(w, r, actor) {
		return
	}
	var input struct {
		Action   string `json:"action"`
		Revision int    `json:"revision"`
	}
	if !httpx.ReadJSON(w, r, &input) {
		return
	}
	changes := map[string]string{
		"publish":   `published=` + draftSnapshot + `,published_at=now(),enabled=true`,
		"unpublish": `enabled=false`,
		"discard": `content=published->'content',template_id=published->>'templateId',
			template_version=(published->>'templateVersion')::integer,template_options=published->'templateOptions'`,
	}
	change, ok := changes[input.Action]
	if !ok || input.Revision < 1 {
		workspaceFailure(w, errWorkspaceInput)
		return
	}
	condition := ""
	if input.Action != "publish" {
		condition = " AND published IS NOT NULL"
	}
	var revision int
	err := scanWorkspace(a.store.db.QueryRowContext(r.Context(), `UPDATE wedding_invitations SET `+change+`,
		revision=revision+1,updated_at=now()
		WHERE wedding_id=$1 AND revision=$3`+condition+` AND `+planningOrganizer+` RETURNING revision`,
		r.PathValue("wedding"), actor, input.Revision), &revision)
	if err != nil {
		workspaceFailure(w, runSheetConflict(err))
		return
	}
	httpx.Reply(w, http.StatusOK, map[string]int{"revision": revision})
}

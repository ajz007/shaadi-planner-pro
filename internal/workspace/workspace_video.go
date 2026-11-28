package workspace

import (
	"database/sql"
	"errors"
	"io"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/ajz007/shaadi-planner-pro/internal/httpx"
)

// WhatsApp videos are rendered on AWS Lambda (Remotion, see video/) from the
// published invitation. Organizers ask for a video; the studio then polls,
// and each poll checks the render's progress with Lambda and records the
// finished file. MP4s stay in Remotion's private S3 bucket and are served
// through short-lived links. Videos come with the Family Pass.

var videoCompositions = map[string]string{"save-the-date": "planner-save-the-date", "invite": "planner-invite"}
var videoFileNames = map[string]string{"save-the-date": "save-the-date", "invite": "invitation"}
var videoLanguages = map[string]bool{"english": true, "hindi": true, "tamil": true, "telugu": true}

// A render that has not finished in this long is treated as lost.
const videoRenderTimeout = 15 * time.Minute

var (
	retentionInterval     = strconv.Itoa(int(videoRetention/time.Second)) + " seconds"
	renderTimeoutInterval = strconv.Itoa(int(videoRenderTimeout/time.Second)) + " seconds"
)

// What the video needs to draw. It matches PlannerSnapshot in
// video/src/wedding/snapshot.ts.
type videoSnapshot struct {
	WeddingName     string            `json:"weddingName"`
	WeddingDate     string            `json:"weddingDate"`
	TimeZone        string            `json:"timeZone"`
	TemplateID      string            `json:"templateId"`
	TemplateOptions map[string]any    `json:"templateOptions"`
	Content         invitationContent `json:"content"`
	Events          []invitationEvent `json:"events"`
	// A one-time URL Lambda fetches the couple photo from, if there is one.
	Photo    string `json:"photo,omitempty"`
	Language string `json:"language"`
}

type weddingVideo struct {
	Kind        string     `json:"kind"`
	Language    string     `json:"language"`
	Status      string     `json:"status"`
	Progress    float64    `json:"progress"`
	HasFile     bool       `json:"hasFile"`
	Bytes       int64      `json:"bytes"`
	RequestedAt time.Time  `json:"requestedAt"`
	FinishedAt  *time.Time `json:"finishedAt,omitempty"`
	renderID    string
	bucket      string
	checkedAt   sql.NullTime
}

const weddingVideoColumns = `kind,language,status,progress,
	file_key IS NOT NULL AND file_finished_at > now() - $2::interval,COALESCE(file_bytes,0),requested_at,file_finished_at,
	COALESCE(render_id,''),COALESCE(render_bucket,''),checked_at`

func scanWeddingVideo(row interface{ Scan(...any) error }, video *weddingVideo) error {
	var finished sql.NullTime
	if err := row.Scan(&video.Kind, &video.Language, &video.Status, &video.Progress, &video.HasFile, &video.Bytes,
		&video.RequestedAt, &finished, &video.renderID, &video.bucket, &video.checkedAt); err != nil {
		return err
	}
	if finished.Valid && video.HasFile {
		video.FinishedAt = &finished.Time
	}
	return nil
}

func (a *workspaceHTTP) weddingVideos(w http.ResponseWriter, r *http.Request, actor string) {
	if !a.rsvpOrganizer(w, r, actor) {
		return
	}
	ctx, wedding := r.Context(), r.PathValue("wedding")
	var published bool
	err := a.store.db.QueryRowContext(ctx, `SELECT published IS NOT NULL FROM wedding_invitations WHERE wedding_id=$1`, wedding).Scan(&published)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		workspaceFailure(w, err)
		return
	}
	videos, err := queryWorkspace(ctx, a.store.db, func(rows *sql.Rows, video *weddingVideo) error { return scanWeddingVideo(rows, video) },
		`SELECT `+weddingVideoColumns+` FROM wedding_videos WHERE wedding_id=$1 ORDER BY kind DESC`, wedding, retentionInterval)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	for i := range videos {
		if err := a.checkVideo(r, wedding, &videos[i]); err != nil {
			log.Printf("could not check a video render: %v", err)
		}
	}
	if videos == nil {
		videos = []weddingVideo{}
	}
	httpx.Reply(w, http.StatusOK, map[string]any{"enabled": a.video != nil, "published": published, "videos": videos})
}

// checkVideo asks Lambda how a render is going, at most every few seconds,
// and records the result. Updates only apply to the render that was checked.
func (a *workspaceHTTP) checkVideo(r *http.Request, wedding string, video *weddingVideo) error {
	if video.Status != "rendering" || a.video == nil {
		return nil
	}
	ctx := r.Context()
	if time.Since(video.RequestedAt) > videoRenderTimeout {
		video.Status = "failed"
		_, err := a.store.db.ExecContext(ctx, `UPDATE wedding_videos SET status='failed',error='The render did not finish.',photo_token=NULL
			WHERE wedding_id=$1 AND kind=$2 AND status='rendering' AND requested_at=$3`, wedding, video.Kind, video.RequestedAt)
		return err
	}
	if video.renderID == "" || (video.checkedAt.Valid && time.Since(video.checkedAt.Time) < 3*time.Second) {
		return nil
	}
	progress, err := a.video.progress(ctx, video.renderID, video.bucket)
	if err != nil {
		return err
	}
	switch {
	case progress.Failed:
		video.Status = "failed"
		_, err = a.store.db.ExecContext(ctx, `UPDATE wedding_videos SET status='failed',error=$4,photo_token=NULL,checked_at=now()
			WHERE wedding_id=$1 AND kind=$2 AND render_id=$3`, wedding, video.Kind, video.renderID, truncate(progress.Error, 500))
	case progress.Done && progress.Key != "":
		now := time.Now()
		video.Status, video.Progress, video.HasFile, video.Bytes, video.FinishedAt = "ready", 1, true, progress.Bytes, &now
		_, err = a.store.db.ExecContext(ctx, `UPDATE wedding_videos SET status='ready',progress=1,photo_token=NULL,checked_at=now(),
			file_bucket=render_bucket,file_key=$4,file_bytes=$5,file_finished_at=now(),error=NULL
			WHERE wedding_id=$1 AND kind=$2 AND render_id=$3`, wedding, video.Kind, video.renderID, progress.Key, progress.Bytes)
	default:
		video.Progress = progress.Progress
		_, err = a.store.db.ExecContext(ctx, `UPDATE wedding_videos SET progress=$4,checked_at=now()
			WHERE wedding_id=$1 AND kind=$2 AND render_id=$3`, wedding, video.Kind, video.renderID, progress.Progress)
	}
	return err
}

func truncate(text string, limit int) string {
	if len(text) <= limit {
		return text
	}
	return strings.ToValidUTF8(text[:limit], "")
}

// requestWeddingVideo snapshots the published invitation and starts a render
// on Lambda. While a render is running, asking again is refused.
func (a *workspaceHTTP) requestWeddingVideo(w http.ResponseWriter, r *http.Request, actor string) {
	if !a.rsvpOrganizer(w, r, actor) {
		return
	}
	if a.video == nil {
		httpx.Fail(w, http.StatusServiceUnavailable, "WhatsApp videos aren’t switched on yet.")
		return
	}
	var input struct{ Kind, Language string }
	if !httpx.ReadJSON(w, r, &input) {
		return
	}
	if videoCompositions[input.Kind] == "" || !videoLanguages[input.Language] {
		workspaceFailure(w, errWorkspaceInput)
		return
	}
	ctx, wedding := r.Context(), r.PathValue("wedding")
	snapshot := videoSnapshot{Language: input.Language}
	var raw, options []byte
	var template string
	var version int
	var hasPhoto bool
	err := a.store.db.QueryRowContext(ctx, `SELECT w.name,w.wedding_date::text,w.time_zone,w.guest_page_photo IS NOT NULL,
		i.published->'content',i.published->>'templateId',(i.published->>'templateVersion')::integer,i.published->'templateOptions'
		FROM weddings w JOIN wedding_invitations i ON i.wedding_id=w.id
		WHERE w.id=$1 AND i.published IS NOT NULL`, wedding).
		Scan(&snapshot.WeddingName, &snapshot.WeddingDate, &snapshot.TimeZone, &hasPhoto, &raw, &template, &version, &options)
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Fail(w, http.StatusConflict, "Publish the invitation first. The video uses what guests see.")
		return
	}
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	snapshot.Content = decodeInvitationContent(raw)
	design := storedDesign(template, version, options)
	snapshot.TemplateID, snapshot.TemplateOptions = design.ID, design.Options
	token := newRSVPToken()
	if hasPhoto {
		snapshot.Photo = a.origin + "/api/video-photo/" + token
	}
	snapshot.Events, err = queryWorkspace(ctx, a.store.db, scanInvitationEvent, `SELECT `+invitationEventColumns+`
		FROM wedding_functions f `+guestPlaceJoin+` WHERE f.wedding_id=$1 AND NOT f.family_only ORDER BY f.starts_at,f.id`, wedding)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	var claimed bool
	err = a.store.db.QueryRowContext(ctx, `INSERT INTO wedding_videos (wedding_id,kind,language,status,photo_token,requested_by)
		VALUES ($1,$2,$3,'rendering',$4,$5)
		ON CONFLICT (wedding_id,kind) DO UPDATE SET language=excluded.language,status='rendering',photo_token=excluded.photo_token,
			render_id=NULL,render_bucket=NULL,progress=0,error=NULL,requested_by=excluded.requested_by,requested_at=now(),
			checked_at=NULL,renders=wedding_videos.renders+1
		WHERE wedding_videos.status<>'rendering' OR wedding_videos.requested_at < now() - $6::interval
		RETURNING true`, wedding, input.Kind, input.Language, token, actor, renderTimeoutInterval).Scan(&claimed)
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Fail(w, http.StatusConflict, "This video is already being made. It will be ready in a minute or two.")
		return
	}
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	renderID, bucket, err := a.video.start(ctx, videoCompositions[input.Kind], snapshot)
	if err != nil {
		log.Printf("could not start a video render: %v", err)
		if _, dbErr := a.store.db.ExecContext(ctx, `UPDATE wedding_videos SET status='failed',error=$2,photo_token=NULL
			WHERE photo_token=$1`, token, truncate(err.Error(), 500)); dbErr != nil {
			log.Printf("could not record the failed render: %v", dbErr)
		}
		httpx.Fail(w, http.StatusBadGateway, "We couldn’t start the video. Try again in a minute.")
		return
	}
	if _, err := a.store.db.ExecContext(ctx, `UPDATE wedding_videos SET render_id=$2,render_bucket=$3 WHERE photo_token=$1`,
		token, renderID, bucket); err != nil {
		workspaceFailure(w, err)
		return
	}
	httpx.Reply(w, http.StatusAccepted, map[string]string{"status": "rendering"})
}

// videoPhoto serves the couple photo to the Lambda render that holds the
// one-time token. Tokens stop working when the render finishes or after the
// render timeout.
func (a *workspaceHTTP) videoPhoto(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	token := r.PathValue("token")
	if len(token) != 43 {
		http.NotFound(w, r)
		return
	}
	var photo []byte
	err := a.store.db.QueryRowContext(r.Context(), `SELECT w.guest_page_photo FROM wedding_videos v JOIN weddings w ON w.id=v.wedding_id
		WHERE v.photo_token=$1 AND v.status='rendering' AND v.requested_at > now() - $2::interval AND w.guest_page_photo IS NOT NULL`,
		token, renderTimeoutInterval).Scan(&photo)
	if errors.Is(err, sql.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		http.Error(w, "unavailable", http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "image/jpeg")
	w.Write(photo)
}

var unsafeFileName = regexp.MustCompile(`[^\p{L}\p{N}]+`)

// weddingVideoFile sends the last finished MP4. Playing and downloading
// redirect to a short-lived S3 link; ?share=1 streams the file through the
// app so the browser can hand it to the phone's share sheet (S3 links are
// cross-origin, which fetch can't read).
func (a *workspaceHTTP) weddingVideoFile(w http.ResponseWriter, r *http.Request, actor string) {
	if !a.rsvpOrganizer(w, r, actor) {
		return
	}
	kind := r.PathValue("kind")
	if videoCompositions[kind] == "" || a.video == nil {
		workspaceFailure(w, errWorkspaceNotFound)
		return
	}
	ctx, wedding := r.Context(), r.PathValue("wedding")
	var bucket, key, name string
	err := scanWorkspace(a.store.db.QueryRowContext(ctx, `SELECT v.file_bucket,v.file_key,w.name
		FROM wedding_videos v JOIN weddings w ON w.id=v.wedding_id
		WHERE v.wedding_id=$1 AND v.kind=$2 AND v.file_key IS NOT NULL AND v.file_finished_at > now() - $3::interval`,
		wedding, kind, retentionInterval), &bucket, &key, &name)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	file := strings.Trim(unsafeFileName.ReplaceAllString(name, "-"), "-")
	if file == "" {
		file = "wedding"
	}
	file += "-" + videoFileNames[kind] + ".mp4"
	download, share := r.URL.Query().Get("download") == "1", r.URL.Query().Get("share") == "1"
	if download || share {
		if _, err := a.store.db.ExecContext(ctx, `UPDATE wedding_videos SET downloads=downloads+1 WHERE wedding_id=$1 AND kind=$2`, wedding, kind); err != nil {
			workspaceFailure(w, err)
			return
		}
	}
	link, err := a.video.fileURL(ctx, bucket, key, file, download)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	if !share {
		http.Redirect(w, r, link, http.StatusFound)
		return
	}
	// A 5 MB file can take longer than the server's default write timeout on
	// a slow phone connection.
	http.NewResponseController(w).SetWriteDeadline(time.Now().Add(5 * time.Minute))
	response, err := http.Get(link)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		workspaceFailure(w, errWorkspaceNotFound)
		return
	}
	w.Header().Set("Content-Type", "video/mp4")
	if response.ContentLength > 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(response.ContentLength, 10))
	}
	io.Copy(w, response.Body)
}

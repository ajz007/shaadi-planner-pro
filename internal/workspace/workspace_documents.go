package workspace

import (
	"database/sql"
	"io"
	"mime"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/ajz007/shaadi-planner-pro/internal/httpx"
)

const documentLimit = 5 << 20
const weddingDocumentLimit = 50 << 20

type vendorDocument struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Size int    `json:"size"`
}

func (a *workspaceHTTP) documentVendor(w http.ResponseWriter, r *http.Request, actor string) (wedding, vendor string, ok bool) {
	wedding, vendor = r.PathValue("wedding"), r.PathValue("vendor")
	if !workspaceUUID.MatchString(wedding) || !workspaceUUID.MatchString(vendor) {
		workspaceFailure(w, errWorkspaceNotFound)
		return "", "", false
	}
	var id string
	err := scanWorkspace(a.store.db.QueryRowContext(r.Context(), `SELECT id FROM wedding_vendors
		WHERE wedding_id=$1 AND id=$3 AND `+financeOwner, wedding, actor, vendor), &id)
	if err != nil {
		workspaceFailure(w, err)
		return "", "", false
	}
	return wedding, vendor, true
}

func (a *workspaceHTTP) vendorDocuments(w http.ResponseWriter, r *http.Request, actor string) {
	wedding, vendor, ok := a.documentVendor(w, r, actor)
	if !ok {
		return
	}
	documents, err := queryWorkspace(r.Context(), a.store.db, func(rows *sql.Rows, d *vendorDocument) error {
		return rows.Scan(&d.ID, &d.Name, &d.Size)
	}, `SELECT id,name,octet_length(contents) FROM wedding_vendor_documents
		WHERE wedding_id=$1 AND vendor_id=$3 AND `+financeOwner+` ORDER BY name,id`, wedding, actor, vendor)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	httpx.Reply(w, http.StatusOK, documents)
}

func (a *workspaceHTTP) uploadVendorDocuments(w http.ResponseWriter, r *http.Request, actor string) {
	wedding, vendor, ok := a.documentVendor(w, r, actor)
	if !ok {
		return
	}
	controller := http.NewResponseController(w)
	now := time.Now()
	_ = controller.SetReadDeadline(now.Add(75 * time.Second))
	_ = controller.SetWriteDeadline(now.Add(85 * time.Second))
	r.Body = http.MaxBytesReader(w, r.Body, 5*documentLimit+(64<<10))
	reader, err := r.MultipartReader()
	if err != nil {
		workspaceFailure(w, errWorkspaceInput)
		return
	}
	type upload struct {
		name, kind string
		data       []byte
	}
	var files []upload
	var size int
	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil || len(files) == 5 {
			httpx.Fail(w, http.StatusUnprocessableEntity, "Choose up to five PDF, JPG or PNG files, up to 5 MB each.")
			return
		}
		name := path.Base(strings.ReplaceAll(part.FileName(), `\`, "/"))
		data, err := io.ReadAll(io.LimitReader(part, documentLimit+1))
		if err != nil || !validLabel(name, 240) || name == "." || len(data) == 0 || len(data) > documentLimit {
			httpx.Fail(w, http.StatusUnprocessableEntity, "Choose PDF, JPG or PNG files up to 5 MB each.")
			return
		}
		kind := http.DetectContentType(data)
		switch kind {
		case "application/pdf", "image/jpeg", "image/png":
		default:
			httpx.Fail(w, http.StatusUnprocessableEntity, "Only PDF, JPG and PNG documents are supported.")
			return
		}
		files = append(files, upload{name, kind, data})
		size += len(data)
	}
	if len(files) == 0 {
		workspaceFailure(w, errWorkspaceInput)
		return
	}
	ctx := r.Context()
	tx, err := a.store.db.BeginTx(ctx, nil)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	defer tx.Rollback()
	var id string
	err = scanWorkspace(tx.QueryRowContext(ctx, `SELECT id FROM weddings WHERE id=$1 AND `+financeOwner+` FOR UPDATE`, wedding, actor), &id)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	var used, count int
	err = tx.QueryRowContext(ctx, `SELECT COALESCE(sum(octet_length(contents)),0),count(*) FILTER (WHERE vendor_id=$2)
		FROM wedding_vendor_documents WHERE wedding_id=$1`, wedding, vendor).Scan(&used, &count)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	if used+size > weddingDocumentLimit || count+len(files) > 10 {
		httpx.Fail(w, http.StatusUnprocessableEntity, "The limit is 10 documents per vendor and 50 MB per wedding.")
		return
	}
	for _, file := range files {
		_, err = tx.ExecContext(ctx, `INSERT INTO wedding_vendor_documents (wedding_id,vendor_id,name,media_type,contents)
			VALUES ($1,$2,$3,$4,$5)`, wedding, vendor, file.name, file.kind, file.data)
		if err != nil {
			workspaceFailure(w, err)
			return
		}
	}
	if err = tx.Commit(); err != nil {
		workspaceFailure(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *workspaceHTTP) downloadVendorDocument(w http.ResponseWriter, r *http.Request, actor string) {
	wedding, vendor, ok := a.documentVendor(w, r, actor)
	if !ok {
		return
	}
	document := r.PathValue("document")
	if !workspaceUUID.MatchString(document) {
		workspaceFailure(w, errWorkspaceNotFound)
		return
	}
	var name, kind string
	var data []byte
	err := scanWorkspace(a.store.db.QueryRowContext(r.Context(), `SELECT name,media_type,contents FROM wedding_vendor_documents
		WHERE wedding_id=$1 AND vendor_id=$3 AND id=$4 AND `+financeOwner, wedding, actor, vendor, document), &name, &kind, &data)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	w.Header().Set("Content-Type", kind)
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": name}))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Write(data)
}

func (a *workspaceHTTP) removeVendorDocument(w http.ResponseWriter, r *http.Request, actor string) {
	wedding, vendor, ok := a.documentVendor(w, r, actor)
	if !ok {
		return
	}
	document := r.PathValue("document")
	if !workspaceUUID.MatchString(document) {
		workspaceFailure(w, errWorkspaceNotFound)
		return
	}
	err := scanWorkspace(a.store.db.QueryRowContext(r.Context(), `DELETE FROM wedding_vendor_documents
		WHERE wedding_id=$1 AND vendor_id=$3 AND id=$4 AND `+financeOwner+` RETURNING id`, wedding, actor, vendor, document), &document)
	if err != nil {
		workspaceFailure(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

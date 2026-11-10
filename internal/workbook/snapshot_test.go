package workbook

import (
	"archive/zip"
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWorkbookSnapshotExportsTextAndNumbers(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/workbook-snapshot", strings.NewReader(
		`{"sheets":[{"name":"Functions & Events","rows":[["Name","Budget"],["=Sample & Meera",1500.25]]}]}`,
	))
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	SnapshotHandler(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("snapshot failed: %d %s", recorder.Code, recorder.Body)
	}
	archive, err := zip.NewReader(bytes.NewReader(recorder.Body.Bytes()), int64(recorder.Body.Len()))
	if err != nil {
		t.Fatal(err)
	}
	parts := make(map[string]string)
	for _, file := range archive.File {
		reader, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		content, err := io.ReadAll(reader)
		reader.Close()
		if err != nil {
			t.Fatal(err)
		}
		parts[file.Name] = string(content)
	}
	if !strings.Contains(parts["xl/workbook.xml"], `name="Functions &amp; Events"`) {
		t.Fatal("missing escaped sheet name")
	}
	data := parts["xl/worksheets/sheet1.xml"]
	if !strings.Contains(data, `<c r="A2" t="inlineStr"><is><t xml:space="preserve">=Sample &amp; Meera</t>`) ||
		!strings.Contains(data, `<c r="B2"><v>1500.25</v></c>`) {
		t.Fatalf("wrong cell types in export: %s", data)
	}
}

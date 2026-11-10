package workbook

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/ajz007/shaadi-planner-pro/internal/httpx"
)

const spreadsheetNS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
const documentRelNS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
const packageRelNS = "http://schemas.openxmlformats.org/package/2006/relationships"
const contentNS = "http://schemas.openxmlformats.org/package/2006/content-types"

type Sheet struct {
	Name string  `json:"name"`
	Rows [][]any `json:"rows"`
}

func SnapshotHandler(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Sheets []Sheet `json:"sheets"`
	}
	if !httpx.ReadJSON(w, r, &request) {
		return
	}
	if len(request.Sheets) == 0 || len(request.Sheets) > 24 {
		httpx.Fail(w, http.StatusBadRequest, "Invalid number of workbook sheets.")
		return
	}
	names := make(map[string]bool)
	for _, sheet := range request.Sheets {
		key := strings.ToLower(sheet.Name)
		if sheet.Name == "" || utf8.RuneCountInString(sheet.Name) > 31 || strings.ContainsAny(sheet.Name, ":\\/?*[]") || names[key] || len(sheet.Rows) > 1000 {
			httpx.Fail(w, http.StatusBadRequest, "Invalid workbook sheet.")
			return
		}
		names[key] = true
		for _, row := range sheet.Rows {
			if len(row) > 40 {
				httpx.Fail(w, http.StatusBadRequest, "Too many worksheet columns.")
				return
			}
			for _, cell := range row {
				switch cell.(type) {
				case string, float64, nil:
				default:
					httpx.Fail(w, http.StatusBadRequest, "Invalid worksheet cell.")
					return
				}
			}
		}
	}
	content, err := Create(request.Sheets)
	if err != nil {
		httpx.Fail(w, http.StatusInternalServerError, "Could not create the workbook.")
		return
	}
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", `attachment; filename="Shaadi-Planner-Current-Snapshot.xlsx"`)
	w.Header().Set("Cache-Control", "no-store")
	w.Write(content)
}

func Create(sheets []Sheet) ([]byte, error) {
	var buffer bytes.Buffer
	archive := zip.NewWriter(&buffer)
	write := func(path, body string) error {
		file, err := archive.Create(path)
		if err != nil {
			return err
		}
		_, err = file.Write([]byte(xml.Header + body))
		return err
	}
	var content, workbook, relationships strings.Builder
	fmt.Fprintf(&content, `<Types xmlns="%s"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`, contentNS)
	fmt.Fprintf(&workbook, `<workbook xmlns="%s" xmlns:r="%s"><sheets>`, spreadsheetNS, documentRelNS)
	fmt.Fprintf(&relationships, `<Relationships xmlns="%s">`, packageRelNS)
	for i, sheet := range sheets {
		path := fmt.Sprintf("worksheets/sheet%d.xml", i+1)
		fmt.Fprintf(&content, `<Override PartName="/xl/%s" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`, path)
		workbook.WriteString(`<sheet name="`)
		xml.EscapeText(&workbook, []byte(sheet.Name))
		fmt.Fprintf(&workbook, `" sheetId="%d" r:id="rId%d"/>`, i+1, i+1)
		fmt.Fprintf(&relationships, `<Relationship Id="rId%d" Type="%s/worksheet" Target="%s"/>`, i+1, documentRelNS, path)
		if err := write("xl/"+path, worksheetXML(sheet.Rows)); err != nil {
			return nil, err
		}
	}
	files := map[string]string{
		"[Content_Types].xml":        content.String() + "</Types>",
		"xl/workbook.xml":            workbook.String() + "</sheets></workbook>",
		"xl/_rels/workbook.xml.rels": relationships.String() + "</Relationships>",
		"_rels/.rels":                fmt.Sprintf(`<Relationships xmlns="%s"><Relationship Id="rId1" Type="%s/officeDocument" Target="xl/workbook.xml"/></Relationships>`, packageRelNS, documentRelNS),
	}
	for name, body := range files {
		if err := write(name, body); err != nil {
			return nil, err
		}
	}
	if err := archive.Close(); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func worksheetXML(rows [][]any) string {
	var sheet strings.Builder
	fmt.Fprintf(&sheet, `<worksheet xmlns="%s"><sheetData>`, spreadsheetNS)
	for i, row := range rows {
		fmt.Fprintf(&sheet, `<row r="%d">`, i+1)
		for j, cell := range row {
			column := string(rune('A' + j%26))
			if j >= 26 {
				column = "A" + column
			}
			reference := column + strconv.Itoa(i+1)
			switch value := cell.(type) {
			case string:
				if value != "" {
					fmt.Fprintf(&sheet, `<c r="%s" t="inlineStr"><is><t xml:space="preserve">`, reference)
					xml.EscapeText(&sheet, []byte(value))
					sheet.WriteString("</t></is></c>")
				}
			case float64:
				fmt.Fprintf(&sheet, `<c r="%s"><v>%s</v></c>`, reference, strconv.FormatFloat(value, 'g', -1, 64))
			}
		}
		sheet.WriteString("</row>")
	}
	sheet.WriteString("</sheetData></worksheet>")
	return sheet.String()
}

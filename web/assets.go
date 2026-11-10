package web

import _ "embed"

// WorkbookContract is shared with the frontend's filled workbook preview.
//
//go:embed src/workbook-demo.json
var WorkbookContract []byte

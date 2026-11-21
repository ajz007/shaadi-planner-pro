package web

import "embed"

// WorkbookContract is shared with the frontend's filled workbook preview.
//
//go:embed src/workbook-demo.json
var WorkbookContract []byte

//go:embed src/shop-catalog.json
var ShopCatalog []byte

// InvitationTemplates holds each template's manifest.json. The server
// validates saved template options against the same files the editor reads.
//
//go:embed src/invitation/templates/*/manifest.json
var InvitationTemplates embed.FS

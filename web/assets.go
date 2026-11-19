package web

import _ "embed"

// WorkbookContract is shared with the frontend's filled workbook preview.
//
//go:embed src/workbook-demo.json
var WorkbookContract []byte

//go:embed src/shop-catalog.json
var ShopCatalog []byte

// InvitationTemplates lists the invitation template manifests. The server
// validates saved template options against the same file the editor reads.
//
//go:embed src/invitation/templates.json
var InvitationTemplates []byte

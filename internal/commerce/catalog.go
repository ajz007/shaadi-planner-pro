package commerce

import (
	"context"
	"encoding/json"
	"fmt"
	"mime"
	"strings"

	"github.com/ajz007/shaadi-planner-pro/web"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type listing struct {
	ID     string
	Slug   string
	Name   string
	Amount int
}

const (
	essentialsID = "essentials-en-v1"
	completeID   = "complete-en-v1"
)

type packageRelease struct {
	filename string
	sha256   string
}

// Only these release files can be fulfilled by the download shop.
var releases = map[string]packageRelease{
	product:              {kitName, kitSHA256},
	essentialsID:         {"Shaadi_Planner_Pro_Essentials_English_v1.0.zip", "027effade209864c7bd0cb21dc2c5a71b6259b3ae1fc9bf7c62447facd435c23"},
	"planner-gu-v1.3.1":  {"Shaadi_Planner_Pro_V1_3_1_Gujarati_Launch_Package.zip", "6f4becb62bd91142c75b35a83de9dce3ed43b2f5b377c436eed8a9816cacf091"},
	completeID:           {"Shaadi_Planner_Pro_Complete_English_v1.0.zip", "91330ca1149e2a1daae841f1d9e16f4210504fad21ceb6f0db6ec4c0e3fa94bc"},
	"all-in-one-en-v1":   {"Shaadi_Planner_Pro_All_in_One_English_v1.0.zip", "1c34c5210b4b47ba3b1a194efcc1ee08d6d1e90ce1bd0f064ea6b6cbabf553eb"},
	"message-pack-en-v1": {"Shaadi_WhatsApp_Vendor_Message_Pack.pdf", "a993709a6889640ec42d98bf941280e488f76e09d9b88c83e4eee3f8c5213968"},
	"sangeet-core-v1":    {"Shaadi-Planner-Core-Sangeet-Host-Kit-FINAL.zip", "c02e25cfa7dac4e1c27be24116639074c48b05c8489f6582d58c6ff87677944b"},
	"sangeet-pro-v1":     {"Shaadi-Planner-Pro-Sangeet-Host-Kit-PRO-FINAL.zip", "7a763f3c422a534948552557152d19200a1584973cc65de31866a9e9c242ffc9"},
}

var catalog = func() map[string]listing {
	var rows []listing
	if err := json.Unmarshal(web.ShopCatalog, &rows); err != nil {
		panic("invalid shop catalog: " + err.Error())
	}
	byID := make(map[string]listing, len(rows))
	for _, row := range rows {
		if row.ID == "" || row.Name == "" || row.Amount <= 0 || byID[row.ID].ID != "" {
			panic("invalid shop listing: " + row.ID)
		}
		byID[row.ID] = row
	}
	for id := range releases {
		if id == product {
			continue // Retired release remains available to existing paid orders.
		}
		if _, ok := byID[id]; !ok {
			panic("missing shop listing: " + id)
		}
	}
	return byID
}()

func loadPackages(ctx context.Context, storage *s3.Client, bucket, excelKey, selection string) (map[string][]byte, error) {
	packages := make(map[string][]byte)
	if selection == "" {
		selection = essentialsID
	}
	for _, id := range strings.Split(selection, ",") {
		id = strings.TrimSpace(id)
		release, ok := releases[id]
		if !ok {
			return nil, fmt.Errorf("unknown download in SHAADI_SHOP_PRODUCTS: %q", id)
		}
		key := "shop/" + id + "/" + release.filename
		if id == product && excelKey != "" {
			key = excelKey
		}
		file, err := loadPackage(ctx, storage, bucket, key, release.sha256)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", id, err)
		}
		packages[id] = file
	}
	return packages, nil
}

// Protect the release names even if a paid file is accidentally placed in dist.
func IsPaidFilename(filename string) bool {
	for _, release := range releases {
		if strings.EqualFold(filename, release.filename) {
			return true
		}
	}
	return false
}

func HasShopPage(slug string) bool {
	if slug == "purchase" {
		return true
	}
	for _, item := range catalog {
		if item.Slug == slug {
			return true
		}
	}
	return false
}

func productName(id string) string {
	if id == product {
		return "Excel Kit"
	}
	if item, ok := catalog[id]; ok {
		return item.Name
	}
	return "Digital purchase"
}

func (f packageRelease) contentType() string {
	if strings.HasSuffix(f.filename, ".pdf") {
		return "application/pdf"
	}
	return "application/zip"
}

func (f packageRelease) disposition() string {
	return mime.FormatMediaType("attachment", map[string]string{"filename": f.filename})
}

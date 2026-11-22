package main

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/ajz007/shaadi-planner-pro/internal/workspace"
)

func grantFamilyPass() {
	if len(os.Args) != 5 {
		log.Fatal("Usage: shaadi-planner grant-family-pass <test|live> <account-uuid> <support-case>")
	}
	mode, account, supportCase := os.Args[2], os.Args[3], os.Args[4]
	if mode != os.Getenv("SHAADI_EXCEL_MODE") || (mode != "test" && mode != "live") {
		log.Fatal("The requested mode must match SHAADI_EXCEL_MODE in the target environment.")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	id, created, err := workspace.GrantFamilyPass(ctx, os.Getenv("SHAADI_DATABASE_URL"), mode, account, supportCase)
	if err != nil {
		log.Fatal(err)
	}
	if created {
		log.Printf("Granted Family Pass %s (mode=%s account=%s case=%s)", id, mode, account, supportCase)
		return
	}
	log.Printf("Family Pass %s already recorded for this case; no new pass granted.", id)
}

package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"net/url"
	"os"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/ajz007/shaadi-planner-pro/internal/commerce"
	"github.com/ajz007/shaadi-planner-pro/internal/demo"
	"github.com/ajz007/shaadi-planner-pro/internal/httpx"
	"github.com/ajz007/shaadi-planner-pro/internal/workbook"
	"github.com/ajz007/shaadi-planner-pro/internal/workspace"
)

func main() {
	if len(os.Args) > 1 {
		if len(os.Args) != 2 || os.Args[1] != "migrate-workspace" {
			log.Fatal("Usage: go run ./cmd/shaadi-planner [migrate-workspace]")
		}
		connection := os.Getenv("SHAADI_DATABASE_URL")
		if connection == "" {
			log.Fatal("Set SHAADI_DATABASE_URL to the workspace database.")
		}
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		err := workspace.Migrate(ctx, connection)
		if err != nil {
			log.Fatalf("Workspace migration failed: %T", err)
		}

		log.Print("Workspace database is up to date.")
		return
	}
	address, publicOrigin, err := serverSettings(os.Getenv("PORT"), os.Getenv("SHAADI_WORKSPACE_ORIGIN"))
	if err != nil {
		log.Fatal(err)
	}
	if publicOrigin != "" {
		if _, err := os.Stat("web/dist/index.html"); err != nil {
			log.Fatal("Build the frontend before starting the hosted planner.")
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	app, err := workspace.Configure(ctx, publicOrigin)
	cancel()
	if err != nil {
		log.Fatalf("Shared workspace configuration failed: %v", err)
	}
	ctx, cancel = context.WithTimeout(context.Background(), 45*time.Second)
	shop, err := commerce.Configure(ctx, publicOrigin)
	cancel()
	if err != nil {
		log.Fatalf("Excel Kit configuration failed: %v", err)
	}
	maintenance, stop := context.WithCancel(context.Background())
	defer stop()
	if app != nil {
		defer app.Close()
		go app.MaintainImportPreviews(maintenance)
	}
	if shop != nil {
		defer shop.Close()
		go shop.SendReceipts(maintenance)
	}
	mux := routes(http.Dir("web/dist"), publicOrigin == "")
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := httpx.LocalOnly(http.Handler(mux))
	if publicOrigin != "" {
		handler = httpx.HostedOnly(publicOrigin, mux)
	}
	app.Register(mux)
	shop.Register(mux)
	server := &http.Server{
		Addr: address, Handler: handler,
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second,
		WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second,
	}
	log.Printf("Shaadi Planner listening on %s", address)
	log.Fatal(server.ListenAndServe())
}

func serverSettings(port, origin string) (address, publicOrigin string, err error) {
	if port == "" {
		return "127.0.0.1:8080", "", nil
	}
	number, err := strconv.Atoi(port)
	if err != nil || number < 1 || number > 65535 || strconv.Itoa(number) != port {
		return "", "", errors.New("PORT must be a number between 1 and 65535")
	}
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Scheme != "https" || parsed.Hostname() == "" ||
		parsed.Host != parsed.Hostname() || !strings.Contains(parsed.Host, ".") ||
		origin != "https://"+parsed.Host {
		return "", "", errors.New("set SHAADI_WORKSPACE_ORIGIN to the HTTPS public origin without a path or port")
	}
	return ":" + port, origin, nil
}

func routes(assets http.FileSystem, sandbox bool) *http.ServeMux {
	mux := http.NewServeMux()
	files := http.FileServer(assets)
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if commerce.IsPaidFilename(path.Base(r.URL.Path)) {
			w.Header().Set("Cache-Control", "no-store")
			http.NotFound(w, r)
			return
		}
		switch strings.ToLower(path.Base(r.URL.Path)) {
		case "shaadi-planner-pro-english.zip", "shaadi-planner-pro-english-blank.xlsx",
			"shaadi_planner_pro_v1_3_1_english_blank.xlsx":
			w.Header().Set("Cache-Control", "no-store")
			http.NotFound(w, r)
			return
		}
		files.ServeHTTP(w, r)
	})
	mux.HandleFunc("GET /excel-kit", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/shop/essentials", http.StatusMovedPermanently)
	})
	for _, path := range []string{"/privacy", "/terms", "/contact", "/rsvp", "/wedding-schedule", "/invitation-preview", "/excel-kit/purchase", "/shop", "/shop/{page}"} {
		mux.HandleFunc("GET "+path, func(w http.ResponseWriter, r *http.Request) {
			if path == "/shop/{page}" && !commerce.HasShopPage(r.PathValue("page")) {
				http.NotFound(w, r)
				return
			}
			if path != "/shop" && (path != "/shop/{page}" || r.PathValue("page") == "purchase") {
				w.Header().Set("X-Robots-Tag", "noindex")
			}
			if path == "/rsvp" || path == "/wedding-schedule" || path == "/invitation-preview" || path == "/excel-kit/purchase" || r.PathValue("page") == "purchase" {
				w.Header().Set("Cache-Control", "no-store")
			}
			r.URL.Path = "/"
			files.ServeHTTP(w, r)
		})
	}
	mux.HandleFunc("POST /api/workbook-snapshot", workbook.SnapshotHandler)
	if sandbox {
		mux.Handle("GET /r/{token}", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			r.URL.Path = "/"
			files.ServeHTTP(w, r)
		}))
		demo.Register(mux)
	}
	return mux
}

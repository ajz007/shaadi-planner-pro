package httpx

import (
	"encoding/json"
	"io"
	"log"
	"mime"
	"net/http"
	"strings"
)

func HostedOnly(origin string, next http.Handler) http.Handler {
	host := strings.TrimPrefix(origin, "https://")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Railway terminates TLS. Use the configured origin and the request
		// authority rather than deriving either from forwarded headers.
		probe := r.Host == "healthcheck.railway.app" && r.Method == http.MethodGet && r.URL.Path == "/healthz"
		if r.Host != host && !probe {
			http.Error(w, "Use the configured planner address.", http.StatusForbidden)
			return
		}
		if source := r.Header.Get("Origin"); source != "" && source != origin {
			http.Error(w, "Request origin does not match the planner.", http.StatusForbidden)
			return
		}
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		next.ServeHTTP(w, r)
	})
}

func LocalOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Host != "127.0.0.1:8080" && r.Host != "localhost:8080" {
			http.Error(w, "Use the local demo address.", http.StatusForbidden)
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" && origin != "http://"+r.Host {
			http.Error(w, "Request origin does not match the demo.", http.StatusForbidden)
			return
		}
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		next.ServeHTTP(w, r)
	})
}

func ReadJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	mediaType, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if mediaType != "application/json" {
		Fail(w, http.StatusUnsupportedMediaType, "Expected a JSON request.")
		return false
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 256<<10))
	decoder.DisallowUnknownFields()
	if decoder.Decode(target) != nil || decoder.Decode(new(any)) != io.EOF {
		Fail(w, http.StatusBadRequest, "Invalid request or request too large.")
		return false
	}
	return true
}

func Reply(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Print("could not write JSON response")
	}
}

func Fail(w http.ResponseWriter, status int, message string) {
	Reply(w, status, map[string]string{"error": message})
}

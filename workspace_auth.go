package main

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"golang.org/x/oauth2"
)

const workspaceSessionCookie = "shaadi_session"
const workspaceFlowCookie = "shaadi_google_flow"
const workspaceSessionAge = 8 * time.Hour

type workspaceIdentity struct{ subject, name string }

type workspaceLogin interface {
	authorizationURL(state, verifier string) string
	identity(ctx context.Context, code, verifier string) (workspaceIdentity, error)
}

type googleWorkspaceLogin struct{ config oauth2.Config }

func (g googleWorkspaceLogin) authorizationURL(state, verifier string) string {
	return g.config.AuthCodeURL(state, oauth2.S256ChallengeOption(verifier))
}

func (g googleWorkspaceLogin) identity(ctx context.Context, code, verifier string) (workspaceIdentity, error) {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	token, err := g.config.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		return workspaceIdentity{}, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://openidconnect.googleapis.com/v1/userinfo", nil)
	if err != nil {
		return workspaceIdentity{}, err
	}
	response, err := g.config.Client(ctx, token).Do(request)
	if err != nil {
		return workspaceIdentity{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return workspaceIdentity{}, errors.New("Google profile unavailable")
	}
	var profile struct {
		Sub           string `json:"sub"`
		Name          string `json:"name"`
		EmailVerified bool   `json:"email_verified"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 64<<10)).Decode(&profile); err != nil {
		return workspaceIdentity{}, err
	}
	if profile.Sub == "" || !profile.EmailVerified {
		return workspaceIdentity{}, errors.New("Google account is unverified")
	}
	if !validLabel(profile.Name, 120) {
		profile.Name = "Wedding planner"
	}
	return workspaceIdentity{subject: "https://accounts.google.com:" + profile.Sub, name: profile.Name}, nil
}

type workspaceHTTP struct {
	store  *workspaceStore
	login  workspaceLogin
	origin string
}

func workspaceSecret() string {
	var random [32]byte
	rand.Read(random[:])
	return base64.RawURLEncoding.EncodeToString(random[:])
}

func (a *workspaceHTTP) cookie(w http.ResponseWriter, name, value, path string, age int) {
	http.SetCookie(w, &http.Cookie{
		Name: name, Value: value, Path: path, MaxAge: age, HttpOnly: true,
		Secure: strings.HasPrefix(a.origin, "https://"), SameSite: http.SameSiteLaxMode,
	})
}

func (a *workspaceHTTP) startLogin(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	state, verifier := workspaceSecret(), workspaceSecret()
	a.cookie(w, workspaceFlowCookie, state+"."+verifier, "/auth/google/callback", 300)
	http.Redirect(w, r, a.login.authorizationURL(state, verifier), http.StatusSeeOther)
}

func (a *workspaceHTTP) finishLogin(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	cookie, err := r.Cookie(workspaceFlowCookie)
	a.cookie(w, workspaceFlowCookie, "", "/auth/google/callback", -1)
	if err != nil {
		http.Redirect(w, r, "/#workspace?login=failed", http.StatusSeeOther)
		return
	}
	state, verifier, valid := strings.Cut(cookie.Value, ".")
	code := r.URL.Query().Get("code")
	if !valid || len(state) != 43 || len(verifier) != 43 || code == "" ||
		subtle.ConstantTimeCompare([]byte(state), []byte(r.URL.Query().Get("state"))) != 1 {
		http.Redirect(w, r, "/#workspace?login=failed", http.StatusSeeOther)
		return
	}
	identity, err := a.login.identity(r.Context(), code, verifier)
	if err != nil {
		http.Redirect(w, r, "/#workspace?login=failed", http.StatusSeeOther)
		return
	}
	account, err := a.store.syncAccount(r.Context(), identity.subject, identity.name)
	if err != nil {
		fail(w, http.StatusInternalServerError, "Could not open your workspace.")
		return
	}
	token := workspaceSecret()
	// Rotate an existing session and remove expired records as part of sign-in.
	tx, err := a.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		fail(w, http.StatusInternalServerError, "Could not open your workspace.")
		return
	}
	defer tx.Rollback()
	previous := ""
	if current, err := r.Cookie(workspaceSessionCookie); err == nil {
		previous = current.Value
	}
	if _, err := tx.ExecContext(r.Context(), "DELETE FROM workspace_sessions WHERE expires_at <= now() OR token_hash = $1", inviteHash(previous)); err != nil {
		fail(w, http.StatusInternalServerError, "Could not open your workspace.")
		return
	}
	if _, err := tx.ExecContext(r.Context(), "INSERT INTO workspace_sessions (token_hash, account_id, expires_at) VALUES ($1, $2, $3)",
		inviteHash(token), account, time.Now().Add(workspaceSessionAge)); err != nil || tx.Commit() != nil {
		fail(w, http.StatusInternalServerError, "Could not open your workspace.")
		return
	}
	a.cookie(w, workspaceSessionCookie, token, "/", int(workspaceSessionAge.Seconds()))
	http.Redirect(w, r, "/#workspace", http.StatusSeeOther)
}

func (a *workspaceHTTP) session(ctx context.Context, r *http.Request) (account, name string, err error) {
	cookie, err := r.Cookie(workspaceSessionCookie)
	if err != nil || len(cookie.Value) != 43 {
		return "", "", errWorkspaceNotFound
	}
	err = scanWorkspace(a.store.db.QueryRowContext(ctx, `
		SELECT a.id, a.display_name FROM workspace_sessions s JOIN workspace_accounts a ON a.id = s.account_id
		WHERE s.token_hash = $1 AND s.expires_at > now()`, inviteHash(cookie.Value)), &account, &name)
	return account, name, err
}

func (a *workspaceHTTP) logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(workspaceSessionCookie); err == nil {
		if _, err := a.store.db.ExecContext(r.Context(), "DELETE FROM workspace_sessions WHERE token_hash = $1", inviteHash(cookie.Value)); err != nil {
			fail(w, http.StatusInternalServerError, "Could not sign out. Try again.")
			return
		}
	}
	a.cookie(w, workspaceSessionCookie, "", "/", -1)
	w.WriteHeader(http.StatusNoContent)
}

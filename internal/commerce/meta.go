package commerce

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"
)

type metaEvents struct {
	id, token string
	client    *http.Client
}
type metaAttribution struct {
	UserAgent string `json:"client_user_agent,omitempty"`
	FBP      string `json:"fbp,omitempty"`
	FBC      string `json:"fbc,omitempty"`
	Campaign string `json:"utm_campaign,omitempty"`
	Source   string `json:"utm_source,omitempty"`
	Medium   string `json:"utm_medium,omitempty"`
	Content  string `json:"utm_content,omitempty"`
	Term     string `json:"utm_term,omitempty"`
}

var pixelNumber = regexp.MustCompile(`^[0-9]{5,24}$`)
var metaCookie = regexp.MustCompile(`^fb\.[0-9]+\.[0-9]{10,14}\.[A-Za-z0-9_.-]{1,500}$`)
var campaignLabel = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,120}$`)

func configuredMeta(mode string) *metaEvents {
	id, token := browserMetaID(), strings.TrimSpace(os.Getenv("META_CAPI_ACCESS_TOKEN"))
	if mode != "live" || !pixelNumber.MatchString(id) || token == "" {
		return nil
	}
	return &metaEvents{id, token, &http.Client{Timeout: 5 * time.Second}}
}
func browserMetaID() string {
	id := strings.TrimSpace(os.Getenv("META_PIXEL_ID"))
	if !pixelNumber.MatchString(id) {
		return ""
	}
	return id
}
func (s *Shop) orderAttribution(a *metaAttribution, userAgent string) *string {
	if a == nil || s.meta == nil {
		return nil
	}
	a.UserAgent = strings.ToValidUTF8(strings.TrimSpace(userAgent), "")
	if len(a.UserAgent) > 1024 {
		a.UserAgent = strings.ToValidUTF8(a.UserAgent[:1024], "")
	}
	for _, field := range []*string{&a.FBP, &a.FBC} {
		if !metaCookie.MatchString(*field) {
			*field = ""
		}
	}
	for _, field := range []*string{&a.Campaign, &a.Source, &a.Medium, &a.Content, &a.Term} {
		if !campaignLabel.MatchString(*field) {
			*field = ""
		}
	}
	b, _ := json.Marshal(a)
	value := string(b)
	return &value
}

func (s *Shop) sendMetaPurchases(ctx context.Context) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		for range 10 {
			work, err := s.sendMetaPurchase(ctx)
			if err != nil {
				if ctx.Err() == nil {
					log.Print("Shop Meta purchase queue unavailable")
				}
				break
			}
			if !work {
				break
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (s *Shop) sendMetaPurchase(ctx context.Context) (bool, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()
	var order, email, productID, currency string
	var attribution []byte
	var amount int
	var paid time.Time
	err = tx.QueryRowContext(ctx, `SELECT razorpay_order_id,buyer_email,product,currency,amount_paise,paid_at,meta_attribution
 FROM excel_orders WHERE mode='live' AND meta_attribution IS NOT NULL AND paid_at IS NOT NULL
 AND paid_at > now()-interval '7 days' AND refunded_at IS NULL AND meta_sent_at IS NULL
 AND meta_next_attempt<=now() ORDER BY meta_next_attempt LIMIT 1 FOR UPDATE SKIP LOCKED`).
		Scan(&order, &email, &productID, &currency, &amount, &paid, &attribution)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	var a metaAttribution
	if err = json.Unmarshal(attribution, &a); err != nil {
		return false, err
	}
	hash := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(email))))
	user := map[string]any{"em": []string{hex.EncodeToString(hash[:])}}
	if a.UserAgent != "" {
		user["client_user_agent"] = a.UserAgent
	}
	if a.FBP != "" {
		user["fbp"] = a.FBP
	}
	if a.FBC != "" {
		user["fbc"] = a.FBC
	}
	event := map[string]any{"event_name": "Purchase", "event_time": paid.Unix(), "event_id": "spp-" + order, "action_source": "website",
		"event_source_url": s.origin + "/shop/" + catalog[productID].Slug, "user_data": user,
		"custom_data": map[string]any{"currency": currency, "value": float64(amount) / 100, "content_ids": []string{productID}, "content_type": "product"}}
	body, err := json.Marshal(map[string]any{"data": []any{event}})
	if err != nil {
		return false, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://graph.facebook.com/v25.0/"+s.meta.id+"/events", bytes.NewReader(body))
	if err != nil {
		return false, err
	}
	req.Header.Set("Authorization", "Bearer "+s.meta.token)
	req.Header.Set("Content-Type", "application/json")
	response, err := s.meta.client.Do(req)
	accepted := false
	if err == nil {
		defer response.Body.Close()
		var result struct {
			Count int `json:"events_received"`
		}
		accepted = response.StatusCode/100 == 2 && json.NewDecoder(response.Body).Decode(&result) == nil && result.Count == 1
	}
	if accepted {
		_, err = tx.ExecContext(ctx, "UPDATE excel_orders SET meta_sent_at=now() WHERE razorpay_order_id=$1", order)
	} else {
		log.Print("Meta purchase delivery deferred; check dataset credentials and Events Manager")
		_, err = tx.ExecContext(ctx, "UPDATE excel_orders SET meta_next_attempt=now()+interval '15 minutes' WHERE razorpay_order_id=$1", order)
	}
	if err != nil {
		return false, err
	}
	return true, tx.Commit()
}

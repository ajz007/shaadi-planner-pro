package workspace

import (
	"context"
	"database/sql"
	"time"
)

type guestTravelReply struct {
	GuestID     string     `json:"guestId"`
	Guest       string     `json:"guest,omitempty"`
	ArrivalDate string     `json:"arrivalDate"`
	ArrivalTime string     `json:"arrivalTime"`
	Pickup      string     `json:"pickup"`
	Stay        string     `json:"stay"`
	Revision    int        `json:"revision"`
	UpdatedAt   *time.Time `json:"updatedAt,omitempty"`
}

func listRSVPTravel(ctx context.Context, db workspaceRowsQueryer, wedding, actor, link string) ([]guestTravelReply, error) {
	query := `SELECT g.id,g.name,COALESCE(t.arrival_date::text,''),COALESCE(to_char(t.arrival_time,'HH24:MI'),''),
		COALESCE(t.pickup,''),COALESCE(t.stay,''),COALESCE(t.revision,0),t.updated_at
		FROM wedding_guests g LEFT JOIN wedding_guest_travel_replies t ON t.wedding_id=g.wedding_id AND t.guest_id=g.id
		WHERE g.wedding_id=$1 AND `
	filter, actorOrLink := "t.guest_id IS NOT NULL AND "+planningOrganizer, actor
	if link != "" {
		filter, actorOrLink = `EXISTS (SELECT 1 FROM wedding_rsvp_invitations i
			JOIN wedding_functions f ON f.wedding_id=i.wedding_id AND f.id=i.function_id
			WHERE i.wedding_id=g.wedding_id AND i.guest_id=g.id AND i.link_id=$2 AND `+rsvpFunctionVisible+`)`, link
	}
	return queryWorkspace(ctx, db, func(row *sql.Rows, reply *guestTravelReply) error {
		return row.Scan(&reply.GuestID, &reply.Guest, &reply.ArrivalDate, &reply.ArrivalTime, &reply.Pickup, &reply.Stay, &reply.Revision, &reply.UpdatedAt)
	}, query+filter+" ORDER BY g.name,g.id", wedding, actorOrLink)
}

func (s *workspaceStore) saveRSVPTravel(ctx context.Context, hash []byte, reply guestTravelReply) error {
	if !workspaceUUID.MatchString(reply.GuestID) || reply.Revision < 0 {
		return errWorkspaceInput
	}
	for _, value := range []string{reply.Pickup, reply.Stay} {
		if value != "" && value != "yes" && value != "no" {
			return errWorkspaceInput
		}
	}
	if reply.ArrivalDate != "" {
		if _, err := time.Parse(time.DateOnly, reply.ArrivalDate); err != nil {
			return errWorkspaceInput
		}
	}
	if reply.ArrivalTime != "" {
		if _, err := time.Parse("15:04", reply.ArrivalTime); err != nil || reply.ArrivalDate == "" {
			return errWorkspaceInput
		}
	}
	return s.withRSVPLink(ctx, hash, func(tx *sql.Tx, wedding, link string) error {
		const invited = `EXISTS (SELECT 1 FROM wedding_rsvp_invitations i
			JOIN wedding_functions f ON f.wedding_id=i.wedding_id AND f.id=i.function_id
			WHERE i.wedding_id=$1 AND i.link_id=$2 AND i.guest_id=$3 AND ` + rsvpFunctionVisible + `)`
		if reply.Revision == 0 {
			result, err := tx.ExecContext(ctx, `INSERT INTO wedding_guest_travel_replies(wedding_id,guest_id,arrival_date,arrival_time,pickup,stay)
				SELECT $1,$3,NULLIF($4,'')::date,NULLIF($5,'')::time,$6,$7 WHERE `+invited+`
				ON CONFLICT (wedding_id,guest_id) DO NOTHING`, wedding, link, reply.GuestID, reply.ArrivalDate, reply.ArrivalTime, reply.Pickup, reply.Stay)
			if err != nil {
				return err
			}
			return checkRSVPRows(result, 1)
		}
		result, err := tx.ExecContext(ctx, `UPDATE wedding_guest_travel_replies SET arrival_date=NULLIF($4,'')::date,arrival_time=NULLIF($5,'')::time,
			pickup=$6,stay=$7,revision=revision+1,updated_at=now() WHERE wedding_id=$1 AND guest_id=$3 AND revision=$8 AND `+invited,
			wedding, link, reply.GuestID, reply.ArrivalDate, reply.ArrivalTime, reply.Pickup, reply.Stay, reply.Revision)
		if err != nil {
			return err
		}
		return checkRSVPRows(result, 1)
	})
}

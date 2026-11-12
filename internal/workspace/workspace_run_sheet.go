package workspace

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

type runSheetActivity struct {
	ID         string     `json:"id"`
	FunctionID string     `json:"functionId"`
	Function   string     `json:"function"`
	OwnerID    string     `json:"ownerId"`
	Fields     [10]string `json:"fields"`
	Revision   int        `json:"revision"`
}

type runSheetInput struct {
	FunctionID string     `json:"functionId"`
	OwnerID    string     `json:"ownerId"`
	Fields     [10]string `json:"fields"`
	Revision   int        `json:"revision"`
	Remove     bool       `json:"remove"`
}

func listRunSheet(ctx context.Context, db workspaceRowsQueryer, wedding, actor string) ([]runSheetActivity, error) {
	rows, err := queryWorkspace(ctx, db, func(row *sql.Rows, activity *runSheetActivity) error {
		var fields []byte
		var owner string
		if err := row.Scan(&activity.ID, &activity.FunctionID, &activity.Function, &activity.OwnerID, &owner,
			&fields, &activity.Revision); err != nil {
			return err
		}
		if err := json.Unmarshal(fields, &activity.Fields); err != nil {
			return err
		}
		if date, ok := excelDate(activity.Fields[0]); ok {
			activity.Fields[0] = date
		}
		if clock, ok := excelClock(activity.Fields[1]); ok {
			activity.Fields[1] = clock
		}
		if owner != "" {
			activity.Fields[4] = owner
		}
		return nil
	}, `SELECT a.id,COALESCE(a.function_id::text,''),COALESCE(f.name,''),COALESCE(a.owner_id::text,''),
		COALESCE(p.name,''),a.fields,a.revision FROM wedding_run_sheet a
		LEFT JOIN wedding_functions f ON f.wedding_id=a.wedding_id AND f.id=a.function_id
		LEFT JOIN wedding_people p ON p.wedding_id=a.wedding_id AND p.id=a.owner_id
		WHERE a.wedding_id=$1 AND `+planningOrganizer+` ORDER BY a.workbook_row NULLS LAST,a.id`, wedding, actor)
	sort.SliceStable(rows, func(i, j int) bool {
		left, right := rows[i].Fields, rows[j].Fields
		if left[0] != right[0] {
			return left[0] < right[0]
		}
		return left[1] < right[1]
	})
	return rows, err
}

func (s *workspaceStore) saveRunSheetActivity(ctx context.Context, wedding, actor, id string, input runSheetInput) error {
	if (id != "new" && input.Revision <= 0) || (id == "new" && input.Remove) {
		return errWorkspaceInput
	}
	var updated string
	if input.Remove {
		return runSheetConflict(scanWorkspace(s.db.QueryRowContext(ctx, `
			DELETE FROM wedding_run_sheet WHERE wedding_id=$1 AND id=$3 AND revision=$4 AND `+planningOrganizer+`
			RETURNING id`, wedding, actor, id, input.Revision), &updated))
	}
	for index, limit := range [10]int{10, 8, 200, 240, 120, 200, 120, 500, 32, 2000} {
		input.Fields[index] = strings.TrimSpace(input.Fields[index])
		if utf8.RuneCountInString(input.Fields[index]) > limit {
			return errWorkspaceInput
		}
	}
	if _, err := time.Parse(time.DateOnly, input.Fields[0]); err != nil || input.Fields[3] == "" {
		return errWorkspaceInput
	}
	clock, valid := excelClock(input.Fields[1])
	if !valid {
		return errWorkspaceInput
	}
	input.Fields[1] = clock
	if duration := input.Fields[8]; duration != "" {
		minutes, err := strconv.Atoi(strings.TrimSuffix(duration, " min"))
		if err != nil || minutes < 1 || minutes > 1440 {
			return errWorkspaceInput
		}
		input.Fields[8] = strconv.Itoa(minutes) + " min"
	}
	for _, reference := range []string{input.FunctionID, input.OwnerID} {
		if reference != "" && !workspaceUUID.MatchString(reference) {
			return errWorkspaceInput
		}
	}
	fields, err := json.Marshal(input.Fields)
	if err != nil {
		return err
	}
	if id == "new" {
		return scanWorkspace(s.db.QueryRowContext(ctx, `
			INSERT INTO wedding_run_sheet (wedding_id,function_id,owner_id,fields)
			SELECT $1,NULLIF($3,'')::uuid,NULLIF($4,'')::uuid,$5 WHERE `+planningOrganizer+`
			RETURNING id`, wedding, actor, input.FunctionID, input.OwnerID, fields), &updated)
	}
	return runSheetConflict(scanWorkspace(s.db.QueryRowContext(ctx, `
		UPDATE wedding_run_sheet SET function_id=NULLIF($5,'')::uuid,owner_id=NULLIF($6,'')::uuid,
			fields=$7,revision=revision+1 WHERE wedding_id=$1 AND id=$3 AND revision=$4 AND `+planningOrganizer+`
		RETURNING id`, wedding, actor, id, input.Revision, input.FunctionID, input.OwnerID, fields), &updated))
}

func runSheetConflict(err error) error {
	if errors.Is(err, errWorkspaceNotFound) {
		return errWorkspaceConflict
	}
	return err
}

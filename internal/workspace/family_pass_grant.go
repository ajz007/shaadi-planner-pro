package workspace

import (
	"context"
	"database/sql"
	"errors"
	"regexp"
	"strings"
)

var familyPassSupportCase = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$`)

// GrantFamilyPass records a complimentary pass against a support case. It
// requires direct workspace database access and does not configure checkout.
func GrantFamilyPass(ctx context.Context, connection, mode, account, supportCase string) (string, bool, error) {
	if connection == "" {
		return "", false, errors.New("set SHAADI_DATABASE_URL to the workspace database")
	}
	if !workspaceUUID.MatchString(account) || !familyPassSupportCase.MatchString(supportCase) ||
		(mode != "test" && mode != "live") {
		return "", false, errors.New("provide a workspace account UUID, test or live mode, and an alphanumeric support case reference")
	}
	db, err := sql.Open("pgx", connection)
	if err != nil {
		return "", false, errors.New("could not open the workspace database")
	}
	defer db.Close()
	source := "support:" + supportCase
	var id string
	err = db.QueryRowContext(ctx, `
		INSERT INTO family_passes (account_id, source, mode)
		SELECT id, $2, $3 FROM workspace_accounts WHERE id=$1
		ON CONFLICT (source) DO NOTHING RETURNING id`, account, source, mode).Scan(&id)
	if err == nil {
		return id, true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", false, errors.New("could not write the Family Pass grant; check database access and workspace migrations")
	}

	var existingAccount, existingMode string
	err = db.QueryRowContext(ctx, "SELECT id, account_id, mode FROM family_passes WHERE source=$1", source).
		Scan(&id, &existingAccount, &existingMode)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, errors.New("workspace account not found")
	}
	if err != nil {
		return "", false, errors.New("could not read the existing Family Pass grant")
	}
	if !strings.EqualFold(existingAccount, account) || existingMode != mode {
		return "", false, errors.New("this support case already belongs to another account or mode")
	}
	return id, false, nil
}

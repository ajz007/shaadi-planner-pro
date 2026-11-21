package workspace

import "context"

func (s *workspaceStore) purgeExpiredFamilyWeddings(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM weddings
		WHERE id IN (
			SELECT w.id FROM weddings w JOIN family_wedding_access a ON a.wedding_id=w.id
			WHERE a.delete_at <= now()
			ORDER BY a.delete_at,w.id LIMIT 20 FOR UPDATE OF w SKIP LOCKED
		)`)
	return err
}

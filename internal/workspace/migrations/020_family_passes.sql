CREATE TABLE family_passes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES workspace_accounts,
    source text NOT NULL UNIQUE,
    mode text NOT NULL CHECK (mode IN ('test', 'live')),
    granted_at timestamptz NOT NULL DEFAULT now(),
    wedding_id uuid UNIQUE REFERENCES weddings ON DELETE SET NULL,
    consumed_at timestamptz,
    revoked_at timestamptz
);

CREATE INDEX family_passes_available ON family_passes (account_id, mode, granted_at)
    WHERE consumed_at IS NULL AND revoked_at IS NULL;

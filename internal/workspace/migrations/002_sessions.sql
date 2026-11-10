CREATE TABLE workspace_sessions (
    token_hash bytea PRIMARY KEY CHECK (length(token_hash) = 32),
    account_id uuid NOT NULL REFERENCES workspace_accounts ON DELETE CASCADE,
    expires_at timestamptz NOT NULL
);

CREATE INDEX workspace_sessions_by_expiry ON workspace_sessions (expires_at);

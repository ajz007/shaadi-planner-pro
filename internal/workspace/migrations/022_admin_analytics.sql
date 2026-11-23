-- Older accounts have no known signup timestamp. Set the default separately.
ALTER TABLE workspace_accounts ADD COLUMN created_at timestamptz;
ALTER TABLE workspace_accounts ALTER COLUMN created_at SET DEFAULT now();
CREATE INDEX workspace_accounts_by_creation ON workspace_accounts (created_at);

ALTER TABLE workspace_sessions ADD COLUMN admin_email text;

CREATE TABLE workspace_daily_signins (
    day date PRIMARY KEY,
    signins bigint NOT NULL CHECK (signins > 0)
);

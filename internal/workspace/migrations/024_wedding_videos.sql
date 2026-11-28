-- WhatsApp videos rendered on AWS Lambda (Remotion) from a wedding's
-- published invitation. One row per wedding and kind; asking again starts a
-- new render but keeps the last finished file until the new one is ready.
-- The MP4 itself lives in Remotion's S3 bucket, not here.
CREATE TABLE wedding_videos (
    wedding_id uuid NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('save-the-date', 'invite')),
    language text NOT NULL CHECK (language IN ('english', 'hindi', 'tamil', 'telugu')),
    status text NOT NULL CHECK (status IN ('rendering', 'ready', 'failed')),
    render_id text,
    render_bucket text,
    progress real NOT NULL DEFAULT 0,
    -- Lambda fetches the couple photo through this one-time token while rendering.
    photo_token text UNIQUE,
    error text,
    -- The last finished file, kept while a newer render runs.
    file_bucket text,
    file_key text,
    file_bytes bigint,
    file_finished_at timestamptz,
    requested_by uuid REFERENCES workspace_accounts(id) ON DELETE SET NULL,
    requested_at timestamptz NOT NULL DEFAULT now(),
    checked_at timestamptz,
    renders integer NOT NULL DEFAULT 1,
    downloads integer NOT NULL DEFAULT 0,
    PRIMARY KEY (wedding_id, kind)
);

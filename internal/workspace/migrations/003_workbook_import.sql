ALTER TABLE wedding_functions ADD COLUMN workbook_id text;
ALTER TABLE wedding_functions ADD COLUMN owner_id uuid;
ALTER TABLE wedding_functions ADD FOREIGN KEY (wedding_id, owner_id) REFERENCES wedding_people (wedding_id, id);
CREATE UNIQUE INDEX wedding_functions_workbook_id ON wedding_functions (wedding_id, workbook_id)
    WHERE workbook_id IS NOT NULL;

CREATE TABLE wedding_guests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wedding_id uuid NOT NULL REFERENCES weddings ON DELETE CASCADE,
    workbook_id text NOT NULL,
    name text NOT NULL,
    wedding_rsvp text NOT NULL DEFAULT '',
    UNIQUE (wedding_id, workbook_id)
);

CREATE TABLE wedding_imported_sections (
    wedding_id uuid NOT NULL REFERENCES weddings ON DELETE CASCADE,
    section_name text NOT NULL,
    position integer NOT NULL,
    payload jsonb NOT NULL,
    PRIMARY KEY (wedding_id, section_name)
);

CREATE TABLE workspace_import_previews (
    token_hash bytea PRIMARY KEY CHECK (length(token_hash) = 32),
    account_id uuid NOT NULL REFERENCES workspace_accounts ON DELETE CASCADE,
    payload jsonb,
    expires_at timestamptz NOT NULL,
    wedding_id uuid REFERENCES weddings ON DELETE CASCADE,
    CHECK ((payload IS NULL) = (wedding_id IS NOT NULL))
);

CREATE INDEX workspace_import_previews_by_expiry ON workspace_import_previews (expires_at);

ALTER TABLE weddings ADD COLUMN guest_page_heading text NOT NULL DEFAULT '';
ALTER TABLE weddings ADD COLUMN guest_page_welcome text NOT NULL DEFAULT '';
ALTER TABLE weddings ADD COLUMN guest_page_theme text NOT NULL DEFAULT 'marigold'
    CHECK (guest_page_theme IN ('marigold', 'rose'));
ALTER TABLE weddings ADD COLUMN guest_page_photo bytea;
ALTER TABLE weddings ADD COLUMN guest_page_revision integer NOT NULL DEFAULT 1;

CREATE TABLE wedding_guest_travel_replies (
    wedding_id uuid NOT NULL,
    guest_id uuid NOT NULL,
    arrival_date date,
    arrival_time time,
    pickup text NOT NULL CHECK (pickup IN ('', 'yes', 'no')),
    stay text NOT NULL CHECK (stay IN ('', 'yes', 'no')),
    revision integer NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (wedding_id, guest_id),
    FOREIGN KEY (wedding_id, guest_id) REFERENCES wedding_guests (wedding_id, id) ON DELETE CASCADE
);

CREATE TABLE wedding_guest_schedule_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wedding_id uuid NOT NULL REFERENCES weddings ON DELETE CASCADE,
    token_hash bytea NOT NULL UNIQUE CHECK (length(token_hash) = 32),
    scope_date date,
    function_id uuid,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    CHECK (scope_date IS NULL OR function_id IS NULL),
    FOREIGN KEY (wedding_id, function_id) REFERENCES wedding_functions (wedding_id, id) ON DELETE CASCADE
);

CREATE INDEX wedding_guest_schedule_by_wedding ON wedding_guest_schedule_links(wedding_id);

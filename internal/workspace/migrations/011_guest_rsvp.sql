CREATE TABLE wedding_rsvp_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wedding_id uuid NOT NULL REFERENCES weddings ON DELETE CASCADE,
    label text NOT NULL,
    token_hash bytea NOT NULL UNIQUE CHECK (length(token_hash) = 32),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    revision integer NOT NULL DEFAULT 1,
    UNIQUE (wedding_id, id)
);

CREATE TABLE wedding_rsvp_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wedding_id uuid NOT NULL,
    link_id uuid NOT NULL,
    guest_id uuid NOT NULL,
    function_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'attending', 'declined')),
    reply_source text CHECK (reply_source IN ('guest', 'organizer')),
    replied_at timestamptz,
    revision integer NOT NULL DEFAULT 1,
    UNIQUE (wedding_id, guest_id, function_id),
    FOREIGN KEY (wedding_id, link_id) REFERENCES wedding_rsvp_links (wedding_id, id) ON DELETE CASCADE,
    FOREIGN KEY (wedding_id, guest_id) REFERENCES wedding_guests (wedding_id, id) ON DELETE CASCADE,
    FOREIGN KEY (wedding_id, function_id) REFERENCES wedding_functions (wedding_id, id) ON DELETE CASCADE
);

CREATE INDEX wedding_rsvp_invitations_by_link ON wedding_rsvp_invitations (wedding_id, link_id);

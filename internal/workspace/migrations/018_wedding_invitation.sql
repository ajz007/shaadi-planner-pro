CREATE TABLE wedding_invitations (
    wedding_id uuid PRIMARY KEY REFERENCES weddings ON DELETE CASCADE,
    enabled boolean NOT NULL DEFAULT false,
    -- Template-independent wedding content: couple, blessings, family, contacts.
    content jsonb NOT NULL DEFAULT '{}',
    -- The chosen design. Options are validated against the template manifest.
    template_id text NOT NULL DEFAULT 'blush-envelope' CHECK (template_id ~ '^[a-z0-9-]{1,40}$'),
    template_version integer NOT NULL DEFAULT 1 CHECK (template_version > 0),
    template_options jsonb NOT NULL DEFAULT '{}',
    music bytea CHECK (music IS NULL OR length(music) BETWEEN 1 AND 5242880),
    music_name text NOT NULL DEFAULT '' CHECK (length(music_name) <= 120),
    revision integer NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now()
);

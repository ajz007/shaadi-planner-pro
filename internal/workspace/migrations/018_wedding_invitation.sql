CREATE TABLE wedding_invitations (
    wedding_id uuid PRIMARY KEY REFERENCES weddings ON DELETE CASCADE,
    enabled boolean NOT NULL DEFAULT false,
    content jsonb NOT NULL DEFAULT '{}',
    music bytea CHECK (music IS NULL OR length(music) BETWEEN 1 AND 5242880),
    music_name text NOT NULL DEFAULT '' CHECK (length(music_name) <= 120),
    revision integer NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspace_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_subject text NOT NULL UNIQUE CHECK (length(identity_subject) > 0),
    display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 120)
);

CREATE TABLE weddings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    wedding_date date NOT NULL,
    time_zone text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wedding_people (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wedding_id uuid NOT NULL REFERENCES weddings ON DELETE CASCADE,
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    UNIQUE (wedding_id, id)
);

CREATE TABLE wedding_memberships (
    wedding_id uuid NOT NULL REFERENCES weddings ON DELETE CASCADE,
    account_id uuid NOT NULL REFERENCES workspace_accounts,
    person_id uuid NOT NULL,
    role text NOT NULL CHECK (role IN ('owner', 'co-organizer', 'family')),
    PRIMARY KEY (wedding_id, account_id),
    UNIQUE (wedding_id, person_id),
    FOREIGN KEY (wedding_id, person_id) REFERENCES wedding_people (wedding_id, id)
);

CREATE UNIQUE INDEX wedding_one_owner ON wedding_memberships (wedding_id) WHERE role = 'owner';

CREATE TABLE wedding_invites (
    token_hash bytea PRIMARY KEY CHECK (length(token_hash) = 32),
    wedding_id uuid NOT NULL REFERENCES weddings ON DELETE CASCADE,
    person_id uuid NOT NULL,
    role text NOT NULL CHECK (role IN ('co-organizer', 'family')),
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    revoked_at timestamptz,
    FOREIGN KEY (wedding_id, person_id) REFERENCES wedding_people (wedding_id, id)
);

CREATE TABLE wedding_functions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wedding_id uuid NOT NULL REFERENCES weddings ON DELETE CASCADE,
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    starts_at timestamptz NOT NULL,
    venue text NOT NULL DEFAULT '',
    UNIQUE (wedding_id, id)
);

CREATE TABLE wedding_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wedding_id uuid NOT NULL REFERENCES weddings ON DELETE CASCADE,
    function_id uuid,
    assignee_id uuid,
    title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 240),
    due_date date,
    claimable boolean NOT NULL DEFAULT false,
    done boolean NOT NULL DEFAULT false,
    revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
    claimed_at timestamptz,
    claimed_by uuid REFERENCES workspace_accounts,
    FOREIGN KEY (wedding_id, function_id) REFERENCES wedding_functions (wedding_id, id),
    FOREIGN KEY (wedding_id, assignee_id) REFERENCES wedding_people (wedding_id, id)
);

CREATE INDEX wedding_tasks_by_wedding ON wedding_tasks (wedding_id);

CREATE TABLE wedding_guest_labels (
    wedding_id uuid NOT NULL REFERENCES weddings ON DELETE CASCADE,
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
    PRIMARY KEY (wedding_id, id)
);

CREATE UNIQUE INDEX wedding_guest_label_name ON wedding_guest_labels (wedding_id, lower(name));

CREATE TABLE wedding_guest_label_assignments (
    wedding_id uuid NOT NULL,
    guest_id uuid NOT NULL,
    label_id uuid NOT NULL,
    PRIMARY KEY (wedding_id, guest_id, label_id),
    FOREIGN KEY (wedding_id, guest_id) REFERENCES wedding_guests (wedding_id, id) ON DELETE CASCADE,
    FOREIGN KEY (wedding_id, label_id) REFERENCES wedding_guest_labels (wedding_id, id) ON DELETE CASCADE
);

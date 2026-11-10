CREATE TABLE wedding_places (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wedding_id uuid NOT NULL REFERENCES weddings ON DELETE CASCADE,
    name text NOT NULL,
    address text NOT NULL,
    map_url text NOT NULL,
    instructions text NOT NULL,
    revision integer NOT NULL DEFAULT 1,
    UNIQUE (wedding_id, id)
);

ALTER TABLE wedding_functions
    ADD COLUMN place_id uuid,
    ADD COLUMN duration_minutes integer CHECK (duration_minutes BETWEEN 1 AND 1440),
    ADD COLUMN required_people jsonb,
    ADD COLUMN required_items jsonb NOT NULL DEFAULT '[]',
    ADD COLUMN revision integer NOT NULL DEFAULT 1,
    ADD FOREIGN KEY (wedding_id, place_id) REFERENCES wedding_places (wedding_id, id);

ALTER TABLE wedding_logistics_records ADD COLUMN place_id uuid,
    ADD FOREIGN KEY (wedding_id, place_id) REFERENCES wedding_places (wedding_id, id);

ALTER TABLE wedding_pickups ADD COLUMN pickup_place_id uuid, ADD COLUMN drop_place_id uuid,
    ADD FOREIGN KEY (wedding_id, pickup_place_id) REFERENCES wedding_places (wedding_id, id),
    ADD FOREIGN KEY (wedding_id, drop_place_id) REFERENCES wedding_places (wedding_id, id);

CREATE TABLE wedding_vendor_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wedding_id uuid NOT NULL REFERENCES weddings ON DELETE CASCADE,
    vendor_id uuid NOT NULL,
    name text NOT NULL,
    media_type text NOT NULL,
    contents bytea NOT NULL,
    FOREIGN KEY (wedding_id, vendor_id) REFERENCES wedding_vendors (wedding_id, id) ON DELETE CASCADE
);
CREATE INDEX wedding_vendor_documents_by_wedding ON wedding_vendor_documents (wedding_id, vendor_id);

ALTER TABLE wedding_guests ADD UNIQUE (wedding_id, id);

CREATE TABLE wedding_pickups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wedding_id uuid NOT NULL REFERENCES weddings ON DELETE CASCADE,
    workbook_row integer,
    pickup_date date,
    pickup_time text NOT NULL DEFAULT '',
    pickup_point text NOT NULL DEFAULT '',
    drop_point text NOT NULL DEFAULT '',
    vehicle text NOT NULL DEFAULT '',
    vehicle_number text NOT NULL DEFAULT '',
    driver text NOT NULL DEFAULT '',
    owner_id uuid,
    imported_owner text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT '',
    driver_confirmed text NOT NULL DEFAULT '',
    notes text NOT NULL DEFAULT '',
    revision integer NOT NULL DEFAULT 1,
    UNIQUE (wedding_id, id),
    UNIQUE (wedding_id, workbook_row),
    FOREIGN KEY (wedding_id, owner_id) REFERENCES wedding_people (wedding_id, id)
);

CREATE TABLE wedding_pickup_passengers (
    wedding_id uuid NOT NULL,
    pickup_id uuid NOT NULL,
    guest_id uuid NOT NULL,
    position integer NOT NULL,
    arrival_date date,
    arrival_time text NOT NULL DEFAULT '',
    arrival_mode text NOT NULL DEFAULT '',
    transport_required text NOT NULL DEFAULT '',
    PRIMARY KEY (pickup_id, guest_id),
    FOREIGN KEY (wedding_id, pickup_id) REFERENCES wedding_pickups (wedding_id, id) ON DELETE CASCADE,
    FOREIGN KEY (wedding_id, guest_id) REFERENCES wedding_guests (wedding_id, id) DEFERRABLE INITIALLY DEFERRED
);

CREATE FUNCTION shaadi_import_clock(value text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN value ~* '^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
          OR value ~* '^(0?[1-9]|1[0-2]):[0-5][0-9] ?(AM|PM)$'
            THEN to_char(date '2000-01-01' + value::time, 'HH24:MI')
        WHEN value ~ '^0(\.[0-9]+)?$'
            THEN to_char(timestamp '2000-01-01' + (floor(value::numeric * 1440) * interval '1 minute'), 'HH24:MI')
        ELSE '' END
$$;

CREATE FUNCTION shaadi_seed_pickups(target uuid) RETURNS void
LANGUAGE sql AS $$
    WITH source AS (
        SELECT i.wedding_id, r.number, r."values" AS cells, r."guestLinks" AS links
        FROM wedding_imported_sections i
        CROSS JOIN LATERAL jsonb_to_recordset(i.payload->'rows') AS r(number integer, "values" jsonb, "guestLinks" jsonb)
        WHERE i.wedding_id = target AND i.section_name = 'Transportation'
    ), inserted AS (
        INSERT INTO wedding_pickups (wedding_id, workbook_row, pickup_date, pickup_time, pickup_point, drop_point,
            vehicle, vehicle_number, driver, imported_owner, status, driver_confirmed, notes)
        SELECT wedding_id, number, NULLIF(cells->>0, '')::date, shaadi_import_clock(cells->>1), cells->>2, cells->>3,
            cells->>11, cells->>12, cells->>13, cells->>14, cells->>15, cells->>16, cells->>17
        FROM source ON CONFLICT (wedding_id, workbook_row) DO NOTHING RETURNING id, wedding_id, workbook_row
    )
    INSERT INTO wedding_pickup_passengers (wedding_id, pickup_id, guest_id, position, arrival_date, arrival_time, arrival_mode, transport_required)
    SELECT p.wedding_id, p.id, g.id, min(link.key::integer),
        NULLIF(original.cells->>11, '')::date, shaadi_import_clock(original.cells->>12),
        COALESCE(original.cells->>13, ''), COALESCE(original.cells->>10, '')
    FROM inserted p JOIN source s ON s.wedding_id = p.wedding_id AND s.number = p.workbook_row
    CROSS JOIN LATERAL jsonb_each_text(COALESCE(s.links, '{}'::jsonb)) link
    JOIN wedding_guests g ON g.wedding_id = p.wedding_id AND g.workbook_id = link.value
    LEFT JOIN LATERAL (
        SELECT row->'values' AS cells FROM wedding_imported_sections i
        CROSS JOIN LATERAL jsonb_array_elements(i.payload->'rows') row
        WHERE i.wedding_id = p.wedding_id AND i.section_name = 'Guest List' AND row->'values'->>0 = g.workbook_id
        LIMIT 1
    ) original ON true
    GROUP BY p.wedding_id, p.id, g.id, original.cells
$$;

SELECT shaadi_seed_pickups(wedding_id) FROM wedding_imported_sections WHERE section_name = 'Transportation';

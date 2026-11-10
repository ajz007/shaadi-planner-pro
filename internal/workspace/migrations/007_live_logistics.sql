CREATE TABLE wedding_logistics_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wedding_id uuid NOT NULL REFERENCES weddings ON DELETE CASCADE,
    section_name text NOT NULL CHECK (section_name IN ('Accommodation', 'RSVP Follow-up')),
    payload jsonb NOT NULL,
    revision integer NOT NULL DEFAULT 1
);

CREATE INDEX wedding_logistics_by_section ON wedding_logistics_records (wedding_id, section_name);

CREATE FUNCTION shaadi_seed_logistics(target_wedding uuid) RETURNS void LANGUAGE sql AS $$
    INSERT INTO wedding_logistics_records (wedding_id, section_name, payload)
    SELECT i.wedding_id, i.section_name, entry.row
    FROM wedding_imported_sections i
    CROSS JOIN LATERAL jsonb_array_elements(NULLIF(i.payload->'rows', 'null'::jsonb)) AS entry(row)
    WHERE i.wedding_id = target_wedding AND i.section_name IN ('Accommodation', 'RSVP Follow-up');
$$;

SELECT shaadi_seed_logistics(id) FROM weddings;

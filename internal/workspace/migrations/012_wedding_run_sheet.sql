CREATE TABLE wedding_run_sheet (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wedding_id uuid NOT NULL REFERENCES weddings ON DELETE CASCADE,
    function_id uuid,
    owner_id uuid,
    fields jsonb NOT NULL CHECK (jsonb_typeof(fields) = 'array'),
    workbook_row integer,
    revision integer NOT NULL DEFAULT 1,
    FOREIGN KEY (wedding_id, function_id) REFERENCES wedding_functions (wedding_id, id),
    FOREIGN KEY (wedding_id, owner_id) REFERENCES wedding_people (wedding_id, id)
);

CREATE INDEX wedding_run_sheet_by_wedding ON wedding_run_sheet (wedding_id);

CREATE FUNCTION shaadi_seed_run_sheet(target_wedding uuid) RETURNS void LANGUAGE sql AS $$
    INSERT INTO wedding_run_sheet (wedding_id, fields, workbook_row, owner_id)
    SELECT i.wedding_id, entry.row->'values', (entry.row->>'number')::integer,
        (SELECT (array_agg(p.id))[1] FROM wedding_people p
         WHERE p.wedding_id = i.wedding_id AND lower(p.name) = lower(entry.row->'values'->>4)
         HAVING count(*) = 1)
    FROM wedding_imported_sections i
    CROSS JOIN LATERAL jsonb_array_elements(NULLIF(i.payload->'rows', 'null'::jsonb)) AS entry(row)
    WHERE i.wedding_id = target_wedding AND i.section_name = 'Wedding Timeline';
$$;

SELECT shaadi_seed_run_sheet(id) FROM weddings;

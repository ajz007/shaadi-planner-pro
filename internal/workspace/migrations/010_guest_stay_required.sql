ALTER TABLE wedding_guests ADD COLUMN stay_required text NOT NULL DEFAULT '';

UPDATE wedding_guests g
SET stay_required = COALESCE(entry.row->'values'->>9, '')
FROM wedding_imported_sections i
CROSS JOIN LATERAL jsonb_array_elements(NULLIF(i.payload->'rows', 'null'::jsonb)) AS entry(row)
WHERE i.wedding_id = g.wedding_id AND i.section_name = 'Guest List'
  AND entry.row->'values'->>0 = g.workbook_id;

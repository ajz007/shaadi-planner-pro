ALTER TABLE wedding_guests ADD COLUMN household text NOT NULL DEFAULT '';
ALTER TABLE wedding_guests ADD COLUMN side text NOT NULL DEFAULT '';
ALTER TABLE wedding_guests ADD COLUMN arrival_date date;
ALTER TABLE wedding_guests ADD COLUMN arrival_time time;
ALTER TABLE wedding_guests ADD COLUMN arrival_mode text NOT NULL DEFAULT '';
ALTER TABLE wedding_guests ADD COLUMN transport_required text NOT NULL DEFAULT '';
ALTER TABLE wedding_guests ADD COLUMN revision integer NOT NULL DEFAULT 1;

UPDATE wedding_guests g
SET household = COALESCE(r.values->>2, ''),
    side = COALESCE(r.values->>3, ''),
    arrival_date = CASE WHEN r.values->>11 ~ '^\d{4}-\d{2}-\d{2}$' THEN (r.values->>11)::date END,
    arrival_time = CASE WHEN r.values->>12 ~ '^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$' THEN (r.values->>12)::time END,
    arrival_mode = COALESCE(r.values->>13, ''),
    transport_required = COALESCE(r.values->>10, '')
FROM wedding_imported_sections i,
LATERAL jsonb_to_recordset(i.payload->'rows') AS r("values" jsonb)
WHERE i.wedding_id = g.wedding_id AND i.section_name = 'Guest List' AND r.values->>0 = g.workbook_id;

ALTER TABLE wedding_tasks ADD COLUMN workbook_row integer;
WITH imported_tasks AS (
    SELECT i.wedding_id, r.values->>0 AS title, min(r.number) AS row_number
    FROM wedding_imported_sections i,
    LATERAL jsonb_to_recordset(i.payload->'rows') AS r(number integer, "values" jsonb)
    WHERE i.section_name = 'Family Responsibilities'
    GROUP BY i.wedding_id, r.values->>0 HAVING count(*) = 1
)
UPDATE wedding_tasks t SET workbook_row = i.row_number
FROM imported_tasks i
WHERE t.wedding_id = i.wedding_id AND t.title = i.title
AND (SELECT count(*) FROM wedding_tasks other WHERE other.wedding_id = t.wedding_id AND other.title = t.title) = 1;

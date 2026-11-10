CREATE OR REPLACE FUNCTION shaadi_import_clock(value text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN value ~* '^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
          OR value ~* '^(0?[1-9]|1[0-2]):[0-5][0-9] ?(AM|PM)$'
            THEN to_char(date '2000-01-01' + value::time, 'HH24:MI')
        WHEN length(value) <= 64 AND value ~ '^([0-9]+(\.[0-9]+)?|\.[0-9]+)([eE][+-]?[0-9]{1,2})?$'
            THEN CASE WHEN value::numeric >= 0 AND value::numeric < 1 THEN
                to_char(timestamp '2000-01-01' +
                    (least(1439, floor(value::numeric * 1440 + 0.0000001)) * interval '1 minute'), 'HH24:MI')
                ELSE '' END
        ELSE '' END
$$;

UPDATE wedding_guests g
SET arrival_time = source.clock::time, revision = g.revision + 1
FROM (
    SELECT i.wedding_id, r."values"->>0 AS workbook_id, shaadi_import_clock(r."values"->>12) AS clock
    FROM wedding_imported_sections i
    CROSS JOIN LATERAL jsonb_to_recordset(i.payload->'rows') AS r("values" jsonb)
    WHERE i.section_name = 'Guest List'
) source
WHERE source.wedding_id = g.wedding_id AND source.workbook_id = g.workbook_id
AND source.clock <> '' AND g.arrival_time IS NULL AND g.revision = 1;

WITH original_arrivals AS (
    SELECT i.wedding_id, r."values"->>0 AS workbook_id, shaadi_import_clock(r."values"->>12) AS clock
    FROM wedding_imported_sections i
    CROSS JOIN LATERAL jsonb_to_recordset(i.payload->'rows') AS r("values" jsonb)
    WHERE i.section_name = 'Guest List'
), repaired AS (
    UPDATE wedding_pickup_passengers l SET arrival_time = source.clock
    FROM wedding_pickups p, wedding_guests g, original_arrivals source
    WHERE p.id = l.pickup_id AND g.id = l.guest_id AND p.workbook_row IS NOT NULL AND p.revision = 1
    AND source.wedding_id = g.wedding_id AND source.workbook_id = g.workbook_id
    AND source.clock <> '' AND source.clock <> l.arrival_time
    RETURNING l.pickup_id
)
UPDATE wedding_pickups p SET revision = revision + 1
WHERE p.id IN (SELECT pickup_id FROM repaired);

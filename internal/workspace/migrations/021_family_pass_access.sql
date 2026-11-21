CREATE VIEW family_wedding_access AS
SELECT p.wedding_id, p.revoked_at,
    LEAST((w.wedding_date + 91)::timestamp AT TIME ZONE w.time_zone,
          p.revoked_at + interval '720 hours') AS delete_at
FROM family_passes p
JOIN weddings w ON w.id = p.wedding_id;

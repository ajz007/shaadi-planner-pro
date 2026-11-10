CREATE TABLE wedding_vendors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wedding_id uuid NOT NULL REFERENCES weddings ON DELETE CASCADE,
    fields jsonb NOT NULL,
    revision integer NOT NULL DEFAULT 1,
    UNIQUE (wedding_id, id)
);

CREATE TABLE wedding_contracts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wedding_id uuid NOT NULL REFERENCES weddings ON DELETE CASCADE,
    vendor_id uuid,
    fields jsonb NOT NULL,
    value_paise bigint NOT NULL,
    opening_paid_paise bigint NOT NULL DEFAULT 0,
    revision integer NOT NULL DEFAULT 1,
    FOREIGN KEY (wedding_id, vendor_id) REFERENCES wedding_vendors (wedding_id, id)
);

CREATE INDEX wedding_contracts_by_wedding ON wedding_contracts (wedding_id);

CREATE TABLE wedding_vendor_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id uuid NOT NULL REFERENCES wedding_contracts ON DELETE CASCADE,
    amount_paise bigint NOT NULL CHECK (amount_paise > 0),
    paid_on date NOT NULL,
    method text NOT NULL,
    notes text NOT NULL,
    voided_at timestamptz
);

CREATE INDEX wedding_vendor_payments_by_contract ON wedding_vendor_payments (contract_id);

CREATE FUNCTION shaadi_seed_finance(target_wedding uuid) RETURNS void LANGUAGE sql AS $$
    INSERT INTO wedding_vendors (wedding_id, fields)
    SELECT i.wedding_id, entry.row->'values'
    FROM wedding_imported_sections i
    CROSS JOIN LATERAL jsonb_array_elements(NULLIF(i.payload->'rows', 'null'::jsonb)) AS entry(row)
    WHERE i.wedding_id = target_wedding AND i.section_name = 'Vendor Comparison';

    INSERT INTO wedding_contracts (wedding_id, vendor_id, fields, value_paise, opening_paid_paise)
    SELECT i.wedding_id, v.id, cells,
        round(COALESCE(NULLIF(cells->>3, '')::numeric, 0) * 100)::bigint,
        round(COALESCE(NULLIF(cells->>4, '')::numeric, 0) * 100)::bigint
    FROM wedding_imported_sections i
    CROSS JOIN LATERAL jsonb_array_elements(NULLIF(i.payload->'rows', 'null'::jsonb)) AS entry(row)
    CROSS JOIN LATERAL (SELECT entry.row->'values' AS cells) AS source
    LEFT JOIN LATERAL (
        SELECT (array_agg(id))[1] AS id
        FROM wedding_vendors
        WHERE wedding_id = i.wedding_id
          AND lower(trim(fields->>0)) = lower(trim(cells->>0))
          AND lower(trim(fields->>1)) = lower(trim(cells->>1))
        HAVING count(*) = 1
    ) AS v ON true
    WHERE i.wedding_id = target_wedding AND i.section_name = 'Vendor Payments';
$$;

SELECT shaadi_seed_finance(id) FROM weddings;

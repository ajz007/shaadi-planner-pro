CREATE TABLE wedding_category_budgets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wedding_id uuid NOT NULL REFERENCES weddings ON DELETE CASCADE,
    category text NOT NULL CHECK (trim(category) <> ''),
    budget_paise bigint NOT NULL CHECK (budget_paise >= 0),
    revision integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX wedding_category_budget_key
    ON wedding_category_budgets (wedding_id, lower(trim(category)));

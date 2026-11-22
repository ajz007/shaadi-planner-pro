CREATE TABLE IF NOT EXISTS excel_orders (
    razorpay_order_id text PRIMARY KEY,
    mode text NOT NULL CHECK (mode IN ('test', 'live')),
    buyer_email text NOT NULL,
    product text NOT NULL,
    amount_paise integer NOT NULL CHECK (amount_paise > 0),
    currency text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    razorpay_payment_id text UNIQUE,
    paid_at timestamptz,
    receipt_due_at timestamptz,
    receipt_version integer NOT NULL DEFAULT 0,
    receipt_requested_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((razorpay_payment_id IS NULL) = (paid_at IS NULL))
);

CREATE INDEX IF NOT EXISTS excel_orders_buyer ON excel_orders (mode, buyer_email, paid_at DESC);
ALTER TABLE excel_orders ADD COLUMN IF NOT EXISTS workspace_account_id uuid;
ALTER TABLE excel_orders ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
ALTER TABLE excel_orders ADD COLUMN IF NOT EXISTS includes_essentials boolean NOT NULL DEFAULT false;
ALTER TABLE excel_orders ADD COLUMN IF NOT EXISTS bundle_product text;
CREATE INDEX IF NOT EXISTS family_pass_orders ON excel_orders (workspace_account_id, mode, created_at DESC)
    WHERE workspace_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS excel_orders_receipt ON excel_orders (receipt_due_at) WHERE receipt_due_at IS NOT NULL;

ALTER TABLE excel_orders ADD COLUMN IF NOT EXISTS meta_attribution jsonb;
ALTER TABLE excel_orders ADD COLUMN IF NOT EXISTS meta_next_attempt timestamptz NOT NULL DEFAULT now();
ALTER TABLE excel_orders ADD COLUMN IF NOT EXISTS meta_sent_at timestamptz;
CREATE INDEX IF NOT EXISTS excel_meta_pending ON excel_orders (meta_next_attempt)
    WHERE meta_attribution IS NOT NULL AND paid_at IS NOT NULL AND meta_sent_at IS NULL AND refunded_at IS NULL;

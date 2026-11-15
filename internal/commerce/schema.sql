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
CREATE INDEX IF NOT EXISTS excel_orders_receipt ON excel_orders (receipt_due_at) WHERE receipt_due_at IS NOT NULL;

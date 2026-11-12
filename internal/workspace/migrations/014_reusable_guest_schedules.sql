-- Previously shared addresses still resolve through token_hash. Give each
-- schedule a recoverable address on the same revocable record.
ALTER TABLE wedding_guest_schedule_links ADD COLUMN share_token text NOT NULL UNIQUE
    DEFAULT translate(rtrim(encode(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()), 'base64'), '='), '+/', '-_')
    CHECK (share_token ~ '^[A-Za-z0-9_-]{43}$');

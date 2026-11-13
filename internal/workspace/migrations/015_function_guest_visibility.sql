ALTER TABLE wedding_functions ADD COLUMN family_only boolean NOT NULL DEFAULT false;
ALTER TABLE wedding_rsvp_invitations ADD COLUMN allow_family_only boolean NOT NULL DEFAULT false;
ALTER TABLE wedding_guest_schedule_links ADD COLUMN family_function_ids uuid[] NOT NULL DEFAULT '{}';

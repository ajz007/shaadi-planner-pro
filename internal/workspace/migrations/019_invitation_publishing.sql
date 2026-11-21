-- Guests see the published snapshot; organizers edit the draft columns.
ALTER TABLE wedding_invitations
    ADD COLUMN published jsonb,
    ADD COLUMN published_at timestamptz;

-- Invitations already shown to guests keep showing exactly what they show today.
UPDATE wedding_invitations
SET published = jsonb_build_object('content', content, 'templateId', template_id,
        'templateVersion', template_version, 'templateOptions', template_options),
    published_at = updated_at
WHERE enabled;

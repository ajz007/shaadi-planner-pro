import { useCallback, useState } from 'react'
import { Invitation } from './Invitation'
import type { InvitationPage } from './Invitation'
import type { PublicInvitation } from './model'

type Saved = { page: InvitationPage; invitation: PublicInvitation; musicPath: string }
const previewKey = 'shaadi-invitation-preview'

// Opened in a new tab from the organizer's editor. Reads the unsaved draft
// from this browser's storage, so nothing is shared until the organizer saves.
export function InvitationPreview() {
  const [saved] = useState<Saved | undefined>(() => {
    try { return JSON.parse(localStorage.getItem(previewKey) ?? 'null') ?? undefined } catch { return undefined }
  })
  const music = useCallback(async () => {
    const response = await fetch(saved!.musicPath)
    if (!response.ok) throw new Error('Music is unavailable.')
    return response.blob()
  }, [saved])
  if (!saved) return <main className="guest-wedding-page"><h1>Preview unavailable</h1>
    <p>Open the preview again from “Design the digital invitation” in your planner.</p></main>
  return <Invitation page={saved.page} invitation={saved.invitation} loadMusic={music} preview greeting="Sharma family"
    rsvp={<div className="invite-panel"><h2>Your reply</h2><p>Each household confirms the functions on their own link here.
      Their replies arrive in your planner straight away.</p></div>} />
}

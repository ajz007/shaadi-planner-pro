import { useCallback, useEffect, useState } from 'react'
import { Invitation } from './Invitation'
import type { InvitationPage } from './Invitation'
import type { PublicInvitation, SectionKey } from './model'

export type PreviewDraft = { page: InvitationPage; invitation: PublicInvitation; musicPath: string; greeting?: string }

// Messages between the studio and the embedded preview. Both sides are on the
// same origin; anything else is ignored.
export type StudioMessage =
  | { source: 'shaadi-studio'; type: 'draft'; draft: PreviewDraft }
  | { source: 'shaadi-studio'; type: 'replay' }
  | { source: 'shaadi-studio'; type: 'focus'; section: SectionKey }
export type PreviewMessage = { source: 'shaadi-preview'; type: 'ready' }

const previewKey = 'shaadi-invitation-preview'
const sampleRsvp = <div className="invite-panel"><h2>Your reply</h2><p>Each household confirms the functions on their own link here.
  Their replies arrive in your planner straight away.</p></div>

function readStored(): PreviewDraft | undefined {
  try { return JSON.parse(localStorage.getItem(previewKey) ?? 'null') ?? undefined } catch { return undefined }
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
let opening = false
let target: SectionKey | undefined

// Every design marks its opening tap target with data-open and continues to
// the page on a second tap (see TEMPLATE-GUIDE.md). While the organizer edits
// a section, open the invitation that way, then scroll to the section. The
// latest request wins, even if it arrives while the opening is still playing.
async function showSection(section: SectionKey) {
  target = section
  const opener = document.querySelector<HTMLElement>('[data-open]')
  if (opening) return
  if (opener) {
    opening = true
    opener.click()
    await wait(2600)
    document.elementFromPoint(8, 8)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(1400)
    opening = false
  }
  // Reveal animations change the page height while it settles, so jump, then
  // correct the position once more.
  const jump = () => target && document.querySelector(`[data-section="${target}"]`)?.scrollIntoView({ block: 'start' })
  jump()
  await wait(700)
  jump()
}

// Two modes:
// - /invitation-preview opens in a new tab and reads the draft from this
//   browser's storage (the "Open full preview" button).
// - /invitation-preview?embed is the studio's live preview inside an iframe.
//   It receives the draft by postMessage and updates without reloading.
export function InvitationPreview() {
  const embedded = new URLSearchParams(window.location.search).has('embed')
  const [draft, setDraft] = useState<PreviewDraft | undefined>(() => embedded ? undefined : readStored())
  const [replay, setReplay] = useState(0)

  useEffect(() => {
    if (!embedded) return
    const receive = (event: MessageEvent<StudioMessage>) => {
      if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.source !== 'shaadi-studio') return
      const message = event.data
      if (message.type === 'draft') setDraft(message.draft)
      else if (message.type === 'replay') { window.scrollTo(0, 0); setReplay(value => value + 1) }
      else if (message.type === 'focus') void showSection(message.section)
    }
    window.addEventListener('message', receive)
    window.parent.postMessage({ source: 'shaadi-preview', type: 'ready' } satisfies PreviewMessage, window.location.origin)
    return () => window.removeEventListener('message', receive)
  }, [embedded])

  const musicPath = draft?.musicPath
  const music = useCallback(async () => {
    const response = await fetch(musicPath!)
    if (!response.ok) throw new Error('Music is unavailable.')
    return response.blob()
  }, [musicPath])

  if (!draft) return embedded ? <p className="guest-wedding-page" role="status">Loading preview…</p>
    : <main className="guest-wedding-page"><h1>Preview unavailable</h1>
      <p>Open the preview again from the Digital Invitation studio in your planner.</p></main>
  // A new design or a replay remounts the invitation so its opening plays again;
  // other edits update in place.
  return <Invitation key={draft.invitation.template.id + ':' + replay} page={draft.page} invitation={draft.invitation}
    loadMusic={draft.invitation.hasMusic ? music : undefined} preview={!embedded} greeting={draft.greeting ?? 'Sharma family'} rsvp={sampleRsvp} />
}

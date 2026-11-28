// What a wedding video needs. This mirrors the planner's invitation content
// (names, functions, venues, RSVP link) so the app can pass a snapshot of a
// published invitation straight in.
import type { EventIcon, InvitationSymbol } from '../../../web/src/invitation/model'

export type VideoEvent = {
  name: string
  icon: Exclude<EventIcon, ''>
  // Already formatted in the wedding's time zone, e.g. "Sat, 13 Feb · 7:00 PM".
  when: string
  venue: string
}

// Fixed wording in the video, so a whole video can be in one language.
export type VideoLabels = {
  saveTheDate: [string, string]
  toFollow: string
  celebrations: string
  blessings: string
  request: string
  rsvpTitle: string
  scan: string
  // Shown instead of a QR code when one video goes to every guest.
  replyNote: string
  replyBy: string
}

export type PaletteKey = 'rose-gold' | 'marigold' | 'royal'

export type WeddingVideoProps = {
  bride: string
  groom: string
  brideFirst: boolean
  // ISO date, e.g. "2027-02-14".
  date: string
  city: string
  // URL or a file in video/public. Optional: without it the art takes its place.
  photo?: string
  symbol: InvitationSymbol
  invocation: string
  intro: string
  events: VideoEvent[]
  hosts: string
  // With a URL the last screen shows a QR code; without one it asks guests
  // to use the personal link they were sent.
  rsvpUrl?: string
  rsvpBy: string
  palette: PaletteKey
  // BCP 47 locale for dates and month names, e.g. "en-IN", "hi-IN".
  locale: string
  labels: VideoLabels
  // Free exports carry a small "Made with Shaadi Planner Pro" line.
  watermark: boolean
}

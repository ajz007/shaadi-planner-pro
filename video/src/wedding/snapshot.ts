// Turns a published invitation from the planner into video props. The Go app
// stores this snapshot with each render job; the worker passes it to the
// planner compositions, which map it here. Dates are formatted in the
// wedding's time zone and the chosen language.
import type { InvitationContent, InvitationEvent } from '../../../web/src/invitation/model'
import { coupleNames, iconFor } from '../../../web/src/invitation/names'
import { labels } from './labels'
import type { PaletteKey, WeddingVideoProps } from './types'

export type VideoLanguage = keyof typeof labels

export type PlannerSnapshot = {
  weddingName: string
  // ISO date of the wedding, e.g. "2027-02-14".
  weddingDate: string
  timeZone: string
  templateId: string
  templateOptions: Record<string, unknown>
  content: InvitationContent
  // Guest-visible functions, in date order.
  events: InvitationEvent[]
  // A data: URL of the couple photo, if the wedding has one.
  photo?: string
  language: VideoLanguage
}

const locales: Record<VideoLanguage, string> = { english: 'en-IN', hindi: 'hi-IN', tamil: 'ta-IN', telugu: 'te-IN' }

// Picks the video palette closest to the invitation's design and colours.
const darkPalettes = /royal|midnight|dusk|maroon|indigo|night|temple-red|laal/
const warmPalettes = /marigold|saffron|terracotta|kasavu|silk-gold|magenta|emerald|rani|pink-city|shola/
export function paletteFor(templateId: string, options: Record<string, unknown>): PaletteKey {
  const palette = String(options.palette ?? '')
  if (darkPalettes.test(palette)) return 'royal'
  if (warmPalettes.test(palette)) return 'marigold'
  if (palette) return 'rose-gold'
  return /royal|celestial/.test(templateId) ? 'royal' : /marigold|kasavu|haveli|phulkari|alpona|kolam/.test(templateId) ? 'marigold' : 'rose-gold'
}

// The ceremony venue, or the last function's, stands in for the city.
function mainPlace(snapshot: PlannerSnapshot) {
  const main = snapshot.events.find(event => iconFor(event, snapshot.content.events[event.id]) === 'pheras')
  return (main ?? snapshot.events[snapshot.events.length - 1])?.place ?? ''
}

export function fromSnapshot(snapshot: PlannerSnapshot): WeddingVideoProps {
  const { content } = snapshot
  const locale = locales[snapshot.language] ?? 'en-IN'
  const format = (iso: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone: snapshot.timeZone, ...options }).format(new Date(iso))
  const [first, second] = coupleNames(content, snapshot.weddingName)
  // coupleNames already applies brideFirst, so pass the pair in display order.
  return {
    groom: first, bride: second, brideFirst: false,
    date: snapshot.weddingDate,
    city: mainPlace(snapshot),
    photo: snapshot.photo,
    symbol: content.symbols[0] ?? 'shri',
    invocation: content.invocation,
    intro: content.intro,
    events: snapshot.events.map(event => ({
      name: event.name,
      icon: iconFor(event, content.events[event.id]),
      when: format(event.startsAt, { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' +
        (content.events[event.id]?.timeLabel || format(event.startsAt, { hour: 'numeric', minute: '2-digit' })),
      venue: event.place,
    })),
    hosts: content.hosts,
    rsvpBy: content.rsvpBy ? new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(new Date(content.rsvpBy + 'T00:00:00Z')) : '',
    palette: paletteFor(snapshot.templateId, snapshot.templateOptions),
    locale,
    labels: labels[snapshot.language] ?? labels.english,
    watermark: false,
  }
}

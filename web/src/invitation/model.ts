// Content model for the digital invitation. It mirrors invitationContent in
// internal/workspace/workspace_invitation.go. Content is shared by every
// template; a template only decides how it looks and which sections it shows.
import manifests from './templates.json'

export type SectionKey = 'blessing' | 'hero' | 'countdown' | 'couple' | 'events' | 'rsvp' | 'family' | 'venue' | 'contacts' | 'closing'
export type TemplateOption =
  | { key: string; label: string; type: 'boolean'; default: boolean; help?: string }
  | { key: string; label: string; type: 'text'; default: string; max: number; help?: string }
  | { key: string; label: string; type: 'choice'; default: string; choices: { value: string; label: string }[]; help?: string }
export type TemplateManifest = {
  id: string; version: number; name: string; description: string; premium: boolean; sections: SectionKey[]; options: TemplateOption[]
}
export type OptionValues = Record<string, string | boolean>
export type InvitationDesign = { id: string; version: number; options: OptionValues }

export const templates = manifests as TemplateManifest[]
export const defaultTemplateId = 'blush-envelope'
export const templateFor = (id: string) => templates.find(template => template.id === id) ?? templates.find(template => template.id === defaultTemplateId)!

// Fills in defaults and drops values the template doesn't declare, matching
// the server's normalization.
export function optionsFor(template: TemplateManifest, options: OptionValues = {}): OptionValues {
  return Object.fromEntries(template.options.map(option => {
    const value = options[option.key]
    const valid = option.type === 'boolean' ? typeof value === 'boolean'
      : option.type === 'choice' ? option.choices.some(choice => choice.value === value)
        : typeof value === 'string' && value.length <= option.max
    return [option.key, valid ? value : option.default]
  }))
}
export type InvitationSymbol = 'om' | 'shri' | 'swastik' | 'kalash'
export type EventIcon = '' | 'diya' | 'kalash' | 'haldi' | 'mehendi' | 'sangeet' | 'baraat' | 'varmala' | 'pheras'
  | 'vidaai' | 'reception' | 'rings' | 'dinner'

export type InvitationPerson = { honorific: string; name: string; shortName: string; parentLabel: string; parents: string }
export type FamilyLine = { relation: string; names: string }
export type FamilyCard = { title: string; lines: FamilyLine[] }
export type FamilySection = { heading: string; cards: FamilyCard[] }
export type Contact = { name: string; role: string; phone: string }
export type EventStyle = { icon: EventIcon; subtitle: string; timeLabel: string }

export type InvitationContent = {
  groom: InvitationPerson
  bride: InvitationPerson
  brideFirst: boolean
  symbols: InvitationSymbol[]
  invocation: string
  shloka: string
  blessingIntro: string
  deity: string
  eldersIntro: string
  elders: string
  eldersNote: string
  intro: string
  title: string
  events: Record<string, EventStyle>
  families: FamilySection[]
  dressCode: string
  rsvpBy: string
  contacts: Contact[]
  closing: string
  regardsIntro: string
  hosts: string
}

export type InvitationEvent = {
  id: string; name: string; startsAt: string; durationMinutes?: number
  place: string; address: string; mapUrl: string; familyOnly?: boolean
}
export type PublicInvitation = { template: InvitationDesign; content: InvitationContent; hasMusic: boolean; events: InvitationEvent[] }

export const symbols: { value: InvitationSymbol; label: string }[] = [
  { value: 'om', label: 'Om' }, { value: 'shri', label: 'Shri' }, { value: 'swastik', label: 'Swastik' }, { value: 'kalash', label: 'Kalash' },
]
export const eventIcons: { value: EventIcon; label: string }[] = [
  { value: '', label: 'Choose automatically' }, { value: 'diya', label: 'Diya (puja)' }, { value: 'kalash', label: 'Kalash' },
  { value: 'haldi', label: 'Haldi' }, { value: 'mehendi', label: 'Mehendi' }, { value: 'sangeet', label: 'Sangeet (dholak)' },
  { value: 'baraat', label: 'Baraat (chhatri)' }, { value: 'varmala', label: 'Varmala' }, { value: 'pheras', label: 'Pheras (havan)' },
  { value: 'vidaai', label: 'Vidaai (doli)' }, { value: 'reception', label: 'Reception' }, { value: 'rings', label: 'Engagement rings' },
  { value: 'dinner', label: 'Dinner (thali)' },
]

const emptyPerson = (parentLabel: string, honorific: string): InvitationPerson =>
  ({ honorific, name: '', shortName: '', parentLabel, parents: '' })

export const vakratunda = 'वक्रतुण्ड महाकाय सूर्यकोटि समप्रभ।\nनिर्विघ्नं कुरु मे देव सर्वकार्येषु सर्वदा॥'

// Starting text for a wedding that has never saved an invitation. Families
// replace the names; the ceremonial lines are common defaults they can edit.
export function defaultContent(): InvitationContent {
  return {
    groom: emptyPerson('Son of', 'Chi.'),
    bride: emptyPerson('Daughter of', 'Chi. Sau. Ka.'),
    brideFirst: false,
    symbols: ['om'],
    invocation: '॥ श्री गणेशाय नमः ॥',
    shloka: vakratunda,
    blessingIntro: 'By the grace of',
    deity: '',
    eldersIntro: 'and with the blessings of',
    elders: '',
    eldersNote: '',
    intro: 'We request the pleasure of your company at the wedding of',
    title: 'Shubh Vivah',
    events: {},
    families: [],
    dressCode: '',
    rsvpBy: '',
    contacts: [],
    closing: 'Your presence will be our blessing',
    regardsIntro: 'With love and regards',
    hosts: '',
  }
}

export function withDefaults(content: Partial<InvitationContent> | undefined, revision: number): InvitationContent {
  const base = defaultContent()
  if (!content || revision === 0) return { ...base, ...content, groom: base.groom, bride: base.bride }
  return {
    ...base, ...content,
    groom: { ...base.groom, ...content.groom }, bride: { ...base.bride, ...content.bride },
    symbols: content.symbols ?? [], events: content.events ?? {}, families: content.families ?? [], contacts: content.contacts ?? [],
  }
}

const iconRules: [RegExp, Exclude<EventIcon, ''>][] = [
  [/haldi|pithi|ubtan/i, 'haldi'], [/meh[e]?n?di|mehndi/i, 'mehendi'], [/sangeet|garba|dandiya|cocktail|music/i, 'sangeet'],
  [/baraat|barat|ghodi|nikasi/i, 'baraat'], [/var\s?mala|jai\s?mala|jaimala|garland/i, 'varmala'],
  [/phera|lagan|vivah|wedding|saptapadi|kanyadaan|mandap|shaadi|muhurat/i, 'pheras'], [/vid[a]+i|bidai|doli/i, 'vidaai'],
  [/reception|party/i, 'reception'], [/engage|sagai|ring|roka|misri|tilak/i, 'rings'], [/dinner|lunch|bhoj|breakfast|brunch/i, 'dinner'],
  [/puja|pooja|ganesh|mata|havan|griha/i, 'diya'],
]

export function iconFor(event: InvitationEvent, style?: EventStyle): Exclude<EventIcon, ''> {
  if (style?.icon) return style.icon
  return iconRules.find(([pattern]) => pattern.test(event.name))?.[1] ?? 'kalash'
}

export const firstName = (person: InvitationPerson) =>
  person.shortName || person.name.replace(/^(chi\.|sau\.|ka\.|shri|smt\.|\s)+/gi, '').split(/\s+/)[0] || ''

// "Aarav", "Meera" from the couple, falling back to the wedding name ("Aarav & Meera").
export function coupleNames(content: InvitationContent, fallback: string): [string, string] {
  const groom = firstName(content.groom), bride = firstName(content.bride)
  if (groom && bride) return content.brideFirst ? [bride, groom] : [groom, bride]
  const parts = fallback.split(/\s*(?:&|\band\b|\bweds\b|\+)\s*/i).filter(Boolean)
  return parts.length >= 2 ? [parts[0], parts.slice(1).join(' ')] : [fallback, '']
}

export function greetingFor(names: string[]) {
  const unique = [...new Set(names.map(name => name.trim()).filter(Boolean))]
  if (!unique.length) return ''
  const first = unique.map(name => name.split(/\s+/)[0])
  if (first.length === 1) return first[0]
  if (first.length <= 3) return first.slice(0, -1).join(', ') + ' & ' + first[first.length - 1]
  return first.slice(0, 2).join(', ') + ' & family'
}

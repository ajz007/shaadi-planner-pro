// Name and icon helpers with no Vite-only code, so the video renderer
// (video/) can share them with the invitation templates.
import type { EventIcon, EventStyle, InvitationContent, InvitationEvent, InvitationPerson } from './model'

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

// Fonts are loaded through Remotion so rendering waits until they are ready.
// The Indic families come after the Latin ones in each stack: the browser
// shapes Devanagari, Tamil and Telugu with its own text engine and falls
// back glyph by glyph, so a name in any of these scripts renders correctly.
import { loadFont as cinzel } from '@remotion/google-fonts/CinzelDecorative'
import { loadFont as cormorant } from '@remotion/google-fonts/CormorantGaramond'
import { loadFont as greatVibes } from '@remotion/google-fonts/GreatVibes'
import { loadFont as inter } from '@remotion/google-fonts/Inter'
import { loadFont as devanagari } from '@remotion/google-fonts/NotoSerifDevanagari'
import { loadFont as tamil } from '@remotion/google-fonts/NotoSerifTamil'
import { loadFont as telugu } from '@remotion/google-fonts/NotoSerifTelugu'

const indic = [
  devanagari('normal', { weights: ['500', '600', '700'], subsets: ['devanagari', 'latin'] }).fontFamily,
  tamil('normal', { weights: ['500', '600', '700'], subsets: ['tamil'] }).fontFamily,
  telugu('normal', { weights: ['500', '600', '700'], subsets: ['telugu'] }).fontFamily,
].map(family => `'${family}'`).join(', ')

const stack = (family: string, fallback: string) => `'${family}', ${indic}, ${fallback}`

export const fonts = {
  display: stack(cinzel('normal', { weights: ['700'], subsets: ['latin'] }).fontFamily, 'serif'),
  serif: stack(cormorant('normal', { weights: ['500', '600', '700'], subsets: ['latin'] }).fontFamily, 'serif'),
  italic: stack(cormorant('italic', { weights: ['500'], subsets: ['latin'] }).fontFamily, 'serif'),
  script: stack(greatVibes('normal', { weights: ['400'], subsets: ['latin'] }).fontFamily, 'cursive'),
  sans: stack(inter('normal', { weights: ['500', '600'], subsets: ['latin'] }).fontFamily, 'sans-serif'),
}

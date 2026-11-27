// Colour tokens per palette. The shared invitation art reads the --inv-*
// custom properties, so the same SVGs recolour with the palette.
import type { CSSProperties } from 'react'
import type { PaletteKey } from './types'

type Palette = { vars: Record<`--inv-${string}`, string>; paper: string; ink: string; text: string; accent: string; petals: string[] }

const base = {
  '--inv-leaf': '#9fb98a', '--inv-leaf-light': '#cfe0bd', '--inv-marigold': '#f6b73c', '--inv-marigold-deep': '#ec8a23',
  '--inv-marigold-core': '#b4561b', '--inv-sindoor': '#c0392b',
}

export const palettes: Record<PaletteKey, Palette> = {
  'rose-gold': {
    vars: { ...base, '--inv-gold': '#b98a3e', '--inv-gold-light': '#ecd08a', '--inv-gold-deep': '#8a6125', '--inv-rose': '#e7a0a6',
      '--inv-rose-light': '#f8d3d1', '--inv-rose-deep': '#b8545f', '--inv-medallion-face': '#fff7e6' },
    paper: 'radial-gradient(120% 80% at 50% 20%, #fffaf3 0%, #f8e9df 55%, #efd3c7 100%)',
    ink: '#6b2234', text: '#4a3a35', accent: '#b98a3e', petals: ['#f2b9b4', '#f6d3c5', '#ecc983', '#e7a0a6'],
  },
  marigold: {
    vars: { ...base, '--inv-gold': '#c58b22', '--inv-gold-light': '#f6d27a', '--inv-gold-deep': '#8f5a12', '--inv-rose': '#e98b5b',
      '--inv-rose-light': '#fbd7b8', '--inv-rose-deep': '#b84a26', '--inv-medallion-face': '#fff4dc' },
    paper: 'radial-gradient(120% 80% at 50% 20%, #fff8e6 0%, #fde7b9 55%, #f7c77c 100%)',
    ink: '#7a2410', text: '#53341c', accent: '#c58b22', petals: ['#f6b73c', '#ec8a23', '#fbd36a', '#e2572b'],
  },
  royal: {
    vars: { ...base, '--inv-gold': '#d4a54a', '--inv-gold-light': '#f3d78f', '--inv-gold-deep': '#e8c06a', '--inv-rose': '#c9566e',
      '--inv-rose-light': '#e98ea0', '--inv-rose-deep': '#f0b5c0', '--inv-medallion-face': '#3a1622' },
    paper: 'radial-gradient(120% 80% at 50% 20%, #5a1c30 0%, #3a1020 55%, #22070f 100%)',
    ink: '#f3d78f', text: '#f6e7d6', accent: '#d4a54a', petals: ['#d4a54a', '#c9566e', '#f3d78f', '#8e2a44'],
  },
}

export const paletteStyle = (key: PaletteKey) => palettes[key].vars as CSSProperties

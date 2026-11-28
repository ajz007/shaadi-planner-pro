// Pieces shared by the wedding compositions.
import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { Mandala, Medallion } from '../../../web/src/invitation/art'
import { KenBurns, Petals, useEnter } from '../engine/motion'
import { fonts } from './fonts'
import { palettes, paletteStyle } from './palettes'
import type { WeddingVideoProps } from './types'
import './art.css'

export const W = 1080
export const H = 1920

export const coupleOrder = (props: WeddingVideoProps): [string, string] =>
  props.brideFirst ? [props.bride, props.groom] : [props.groom, props.bride]

export const datePart = (props: WeddingVideoProps, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(props.locale, { timeZone: 'UTC', ...options }).format(new Date(props.date + 'T00:00:00Z'))

export const dateLine = (props: WeddingVideoProps) => datePart(props, { day: 'numeric', month: 'long', year: 'numeric' })

const resolve = (src: string) => /^(https?:|data:|blob:)/.test(src) ? src : staticFile(src)

// Paper, two slowly turning mandalas and falling petals. Wraps every scene so
// the palette's colour tokens are in scope for the shared art.
export function Stage({ props, petals = true, children }: { props: WeddingVideoProps; petals?: boolean; children: ReactNode }) {
  const frame = useCurrentFrame()
  const palette = palettes[props.palette]
  return <AbsoluteFill className={props.palette === 'royal' ? 'wv-royal' : undefined}
    style={{ ...paletteStyle(props.palette), '--wv-serif': fonts.serif, background: palette.paper, color: palette.text, fontFamily: fonts.serif } as CSSProperties}>
    <div style={{ position: 'absolute', width: 1500, left: -560, top: -520, color: palette.accent, opacity: 0.16, transform: `rotate(${frame * 0.08}deg)` }}><Mandala /></div>
    <div style={{ position: 'absolute', width: 1300, right: -620, bottom: -460, color: palette.accent, opacity: 0.14, transform: `rotate(${-frame * 0.06}deg)` }}><Mandala /></div>
    {petals && <Petals colors={palette.petals} count={26} seed={props.palette} />}
    {children}
    <AbsoluteFill style={{ pointerEvents: 'none', boxShadow: 'inset 0 0 220px rgb(60 20 10 / .22)' }} />
  </AbsoluteFill>
}

// The couple photo in an arched gold frame, or the symbol medallion when
// there is no photo yet.
export function PhotoArch({ props, width = 720, delay = 0 }: { props: WeddingVideoProps; width?: number; delay?: number }) {
  const enter = useEnter(delay, 20)
  const palette = palettes[props.palette]
  const height = width * 1.28
  const arch: CSSProperties = { borderRadius: `${width / 2}px ${width / 2}px 28px 28px`, overflow: 'hidden' }
  return <div style={{ width, height, padding: 14, ...arch, background: `linear-gradient(160deg, ${palette.vars['--inv-gold-light']}, ${palette.accent} 45%, ${palette.vars['--inv-gold-deep']})`,
    boxShadow: '0 40px 80px rgb(70 25 15 / .35)', opacity: enter, transform: `scale(${0.9 + enter * 0.1})` }}>
    <div style={{ width: '100%', height: '100%', ...arch, borderRadius: `${width / 2 - 14}px ${width / 2 - 14}px 18px 18px`,
      background: props.photo ? '#000' : palette.vars['--inv-medallion-face'], display: 'grid', placeItems: 'center' }}>
      {props.photo ? <KenBurns src={resolve(props.photo)} />
        : <div style={{ width: width * 0.55 }}><Medallion symbol={props.symbol} large /></div>}
    </div>
  </div>
}

export function Watermark({ props }: { props: WeddingVideoProps }) {
  if (!props.watermark) return null
  return <div style={{ position: 'absolute', bottom: 70, width: '100%', textAlign: 'center', fontFamily: fonts.sans, fontSize: 30,
    letterSpacing: '.06em', color: palettes[props.palette].text, opacity: 0.7 }}>Made with Shaadi Planner Pro · shaadiplannerpro.com</div>
}

// Wide letter-spacing breaks Indic shaping (matras and conjuncts drift
// apart), so only Latin text is tracked out.
const latin = /^[\p{Script=Latin}\p{N}\p{P}\p{Zs}\p{S}]*$/u
export const tracking = (text: string, wide: string) => latin.test(text) ? wide : '0.02em'

// Kicker text: small caps with wide tracking (Latin only, see above).
export function Kicker({ text, style }: { text: string; style?: CSSProperties }) {
  const wide = String(style?.letterSpacing ?? '.32em')
  return <div style={{ fontFamily: fonts.sans, fontSize: 34, fontWeight: 600, textTransform: 'uppercase', ...style,
    letterSpacing: tracking(text, wide) }}>{text}</div>
}

// Grows a thin rule outward from the centre.
export function Rule({ delay = 0, color, width = 420 }: { delay?: number; color: string; width?: number }) {
  const frame = useCurrentFrame()
  const t = interpolate(frame - delay, [0, 24], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return <div style={{ width: width * t, height: 3, margin: '0 auto', background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
}

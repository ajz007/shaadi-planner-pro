// 15-second vertical save-the-date: symbol and title, the couple, then the
// date. Built for WhatsApp Status and Instagram Reels (1080 × 1920, 30 fps).
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate } from 'remotion'
import { Medallion } from '../../../web/src/invitation/art'
import { LetterReveal, LightSweep, Rise, Scene, useEnter } from '../engine/motion'
import { fonts } from './fonts'
import { palettes } from './palettes'
import { Kicker, PhotoArch, Rule, Stage, Watermark, coupleOrder, datePart, tracking } from './parts'
import type { WeddingVideoProps } from './types'

export const SAVE_THE_DATE_FRAMES = 450

const center = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' } as const

// The first frame is the thumbnail WhatsApp shows in a chat, so the title
// card starts fully drawn (negative delays) instead of fading in.
const drawn = -90

function Title({ props }: { props: WeddingVideoProps }) {
  const pop = useEnter(drawn, 12)
  const palette = palettes[props.palette]
  return <Scene fadeIn={0} fadeOut={14} style={{ ...center, gap: 44 }}>
    <div style={{ width: 230, transform: `scale(${pop})` }}><Medallion symbol={props.symbol} large /></div>
    <Rise delay={drawn}><Kicker style={{ color: palette.accent }} text={props.invocation} /></Rise>
    <div style={{ fontFamily: fonts.display, fontSize: 132, lineHeight: 1.05, color: palette.ink }}>
      <LetterReveal text={props.labels.saveTheDate[0]} delay={drawn} /><br /><LetterReveal text={props.labels.saveTheDate[1]} delay={drawn} />
    </div>
    <Rule delay={drawn} color={palette.accent} />
    <LightSweep delay={8} duration={45} />
  </Scene>
}

function Couple({ props }: { props: WeddingVideoProps }) {
  const [first, second] = coupleOrder(props)
  const palette = palettes[props.palette]
  return <Scene style={{ ...center, gap: 40, paddingTop: 40 }}>
    <PhotoArch props={props} width={700} delay={2} />
    <div style={{ fontFamily: fonts.script, fontSize: 150, lineHeight: 1.1, color: palette.ink }}>
      <LetterReveal text={first} delay={22} stagger={2} />
      <div style={{ fontFamily: fonts.italic, fontSize: 70, color: palette.accent, margin: '-10px 0 -6px' }}><Rise delay={44}>&amp;</Rise></div>
      <LetterReveal text={second} delay={52} stagger={2} />
    </div>
  </Scene>
}

function TheDate({ props }: { props: WeddingVideoProps }) {
  const frame = useCurrentFrame()
  const palette = palettes[props.palette]
  const part = (options: Intl.DateTimeFormatOptions) => datePart(props, options)
  const monthYear = `${part({ month: 'long' }).toUpperCase()} ${part({ year: 'numeric' })}`
  const glow = interpolate(frame, [20, 60], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return <Scene fadeOut={0} style={{ ...center, gap: 26 }}>
    <Rise delay={0}><Kicker style={{ color: palette.accent }} text={part({ weekday: 'long' })} /></Rise>
    <Rise delay={8} distance={60}>
      <div style={{ fontFamily: fonts.display, fontSize: 330, lineHeight: 1, color: palette.ink,
        textShadow: `0 0 ${60 * glow}px ${palette.vars['--inv-gold-light']}` }}>{part({ day: 'numeric' })}</div>
    </Rise>
    <Rise delay={18}><div style={{ fontFamily: fonts.serif, fontWeight: 600, fontSize: 92, color: palette.ink,
      letterSpacing: tracking(monthYear, '.08em') }}>{monthYear}</div></Rise>
    <Rule delay={30} color={palette.accent} />
    <Rise delay={36}><div style={{ fontFamily: fonts.italic, fontSize: 68, color: palette.text }}>{props.city}</div></Rise>
    <Rise delay={56}><div style={{ fontFamily: fonts.sans, fontSize: 36, letterSpacing: tracking(props.labels.toFollow, '.2em'), textTransform: 'uppercase', marginTop: 40, color: palette.accent }}>
      {props.labels.toFollow}</div></Rise>
    <LightSweep delay={24} duration={40} />
  </Scene>
}

export function SaveTheDate(props: WeddingVideoProps) {
  return <Stage props={props}>
    <Sequence durationInFrames={130}><Title props={props} /></Sequence>
    <Sequence from={120} durationInFrames={190}><Couple props={props} /></Sequence>
    <Sequence from={300} durationInFrames={150}><TheDate props={props} /></Sequence>
    <AbsoluteFill><Watermark props={props} /></AbsoluteFill>
  </Stage>
}

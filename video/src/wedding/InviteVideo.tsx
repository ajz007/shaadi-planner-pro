// 30-second vertical invitation: blessing, the couple, each function, the
// hosts, then a scan-to-RSVP card. 1080 × 1920 at 30 fps, under WhatsApp's
// Status limit so it can be posted without trimming.
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion'
import { Divider, EventArt, Medallion, Toran } from '../../../web/src/invitation/art'
import { LetterReveal, LightSweep, Rise, Scene, useEnter } from '../engine/motion'
import { QrCode } from '../engine/QrCode'
import { fonts } from './fonts'
import { palettes } from './palettes'
import { Kicker, PhotoArch, Rule, Stage, Watermark, coupleOrder, dateLine } from './parts'
import type { WeddingVideoProps } from './types'

export const INVITE_FRAMES = 900
const MAX_EVENTS = 5

const center = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' } as const

// The first frame is the thumbnail WhatsApp shows in a chat, so the opening
// card starts fully drawn (negative delays) instead of fading in.
const drawn = -90

function Blessing({ props }: { props: WeddingVideoProps }) {
  const frame = useCurrentFrame()
  const sway = Math.sin(frame / 18) * 4
  const pop = useEnter(drawn, 12)
  const palette = palettes[props.palette]
  return <Scene fadeIn={0} style={{ ...center, gap: 46, padding: '0 90px' }}>
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${sway - 4}px)` }}><Toran /></div>
    <div style={{ width: 210, transform: `scale(${pop})` }}><Medallion symbol={props.symbol} large /></div>
    <Rise delay={drawn}><Kicker style={{ color: palette.accent, letterSpacing: '.2em' }} text={props.invocation} /></Rise>
    <Rise delay={drawn}><div style={{ fontFamily: fonts.italic, fontSize: 66, lineHeight: 1.3, color: palette.text }}>{props.intro}</div></Rise>
    <LightSweep delay={8} duration={45} />
  </Scene>
}

function Couple({ props }: { props: WeddingVideoProps }) {
  const [first, second] = coupleOrder(props)
  const palette = palettes[props.palette]
  return <Scene style={{ ...center, gap: 34 }}>
    <PhotoArch props={props} width={640} delay={0} />
    <div style={{ fontFamily: fonts.script, fontSize: 138, lineHeight: 1.1, color: palette.ink }}>
      <LetterReveal text={first} delay={18} />
      <div style={{ fontFamily: fonts.italic, fontSize: 64, color: palette.accent, margin: '-8px 0 -4px' }}><Rise delay={38}>&amp;</Rise></div>
      <LetterReveal text={second} delay={46} />
    </div>
    <Rise delay={70}><Kicker style={{ color: palette.accent }} text={`${dateLine(props)} · ${props.city}`} /></Rise>
  </Scene>
}

function Functions({ props }: { props: WeddingVideoProps }) {
  const palette = palettes[props.palette]
  const events = props.events.slice(0, MAX_EVENTS)
  const compact = events.length > 3
  return <Scene style={{ ...center, gap: compact ? 26 : 40, padding: '0 70px' }}>
    <Rise><div style={{ fontFamily: fonts.display, fontSize: 92, color: palette.ink }}>{props.labels.celebrations}</div></Rise>
    <Rise delay={6}><div style={{ color: palette.accent }}><Divider /></div></Rise>
    {events.map((event, i) => <Rise key={i} delay={18 + i * 26} distance={60} style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 34, padding: compact ? '22px 34px' : '32px 40px', borderRadius: 32, textAlign: 'left',
        background: props.palette === 'royal' ? 'rgb(255 255 255 / .07)' : 'rgb(255 253 248 / .82)', border: `2px solid ${palette.vars['--inv-gold-light']}`,
        boxShadow: '0 18px 40px rgb(80 30 15 / .12)' }}>
        <div style={{ width: compact ? 110 : 140, flex: '0 0 auto' }}><EventArt icon={event.icon} /></div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: fonts.serif, fontWeight: 700, fontSize: compact ? 58 : 68, color: palette.ink, lineHeight: 1.1 }}>{event.name}</div>
          <div style={{ fontFamily: fonts.sans, fontSize: compact ? 32 : 36, marginTop: 8, color: palette.text }}>{event.when}</div>
          <div style={{ fontFamily: fonts.italic, fontSize: compact ? 38 : 44, marginTop: 4, color: palette.text, opacity: 0.85 }}>{event.venue}</div>
        </div>
      </div>
    </Rise>)}
  </Scene>
}

function Hosts({ props }: { props: WeddingVideoProps }) {
  const palette = palettes[props.palette]
  return <Scene style={{ ...center, gap: 40, padding: '0 100px' }}>
    <Rise><Kicker style={{ color: palette.accent }} text={props.labels.blessings} /></Rise>
    <Rule delay={10} color={palette.accent} />
    <Rise delay={18}><div style={{ fontFamily: fonts.serif, fontWeight: 600, fontSize: 76, lineHeight: 1.25, color: palette.ink }}>{props.hosts}</div></Rise>
    <Rise delay={34}><div style={{ fontFamily: fonts.italic, fontSize: 56, color: palette.text }}>{props.labels.request}</div></Rise>
  </Scene>
}

// One video goes to every guest, so without a shared RSVP URL the last screen
// points guests to the personal link they were sent.
function ReplyCard({ props }: { props: WeddingVideoProps }) {
  const palette = palettes[props.palette]
  const pop = useEnter(4, 14)
  return <Scene fadeOut={0} style={{ ...center, gap: 44, padding: '0 90px' }}>
    <div style={{ width: 170, transform: `scale(${pop})` }}><Medallion symbol={props.symbol} /></div>
    <Rise delay={8}><div style={{ fontFamily: fonts.display, fontSize: 104, color: palette.ink }}>{props.labels.rsvpTitle}</div></Rise>
    <Rule delay={16} color={palette.accent} />
    <Rise delay={22}><div style={{ fontFamily: fonts.serif, fontWeight: 600, fontSize: 70, color: palette.ink }}>{dateLine(props)}</div></Rise>
    {props.city && <Rise delay={28}><div style={{ fontFamily: fonts.italic, fontSize: 60, color: palette.text }}>{props.city}</div></Rise>}
    <Rise delay={40}><div style={{ fontFamily: fonts.sans, fontSize: 42, lineHeight: 1.4, color: palette.text, marginTop: 30 }}>{props.labels.replyNote}</div></Rise>
    {props.rsvpBy && <Rise delay={50}><Kicker style={{ color: palette.accent }} text={`${props.labels.replyBy} ${props.rsvpBy}`} /></Rise>}
    <LightSweep delay={30} duration={40} />
  </Scene>
}

function Rsvp({ props }: { props: WeddingVideoProps }) {
  if (!props.rsvpUrl) return <ReplyCard props={props} />
  const palette = palettes[props.palette]
  const pop = useEnter(10, 14)
  return <Scene fadeOut={0} style={{ ...center, gap: 40 }}>
    <Rise><div style={{ fontFamily: fonts.display, fontSize: 104, color: palette.ink }}>{props.labels.rsvpTitle}</div></Rise>
    <div style={{ padding: 22, borderRadius: 36, background: '#fff', boxShadow: '0 30px 60px rgb(70 25 15 / .25)', transform: `scale(${0.85 + pop * 0.15})`, opacity: pop }}>
      <QrCode value={props.rsvpUrl} size={440} color={palettes['rose-gold'].ink} />
    </div>
    <Rise delay={20}><div style={{ fontFamily: fonts.sans, fontSize: 40, color: palette.text }}>{props.labels.scan}</div></Rise>
    {props.rsvpBy && <Rise delay={30}><Kicker style={{ color: palette.accent }} text={`${props.labels.replyBy} ${props.rsvpBy}`} /></Rise>}
    <LightSweep delay={30} duration={40} />
  </Scene>
}

export function InviteVideo(props: WeddingVideoProps) {
  return <Stage props={props}>
    <Sequence durationInFrames={150}><Blessing props={props} /></Sequence>
    <Sequence from={140} durationInFrames={200}><Couple props={props} /></Sequence>
    <Sequence from={330} durationInFrames={290}><Functions props={props} /></Sequence>
    <Sequence from={610} durationInFrames={150}><Hosts props={props} /></Sequence>
    <Sequence from={750} durationInFrames={150}><Rsvp props={props} /></Sequence>
    <AbsoluteFill><Watermark props={props} /></AbsoluteFill>
  </Stage>
}

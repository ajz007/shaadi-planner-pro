// Celestial Night artwork: constellations, moons and fine silver line work,
// all drawn in code. Colours come from the palette tokens in style.css.
import { useId, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { EventArt } from '../../art'
import type { InvitationSymbol } from '../../model'

const fixed = (value: number) => Math.round(value * 100) / 100

// A star-chart alphabet on a 6 × 10 grid. Strokes are separated by "|",
// points by ",". Curves are polygons, as a constellation would draw them.
const letters: Record<string, string> = {
  A: '0 10,3 0,6 10|1.3 6,4.7 6',
  B: '0 10,0 0,4 0,5.4 1.6,4.2 4.6,0 5|4.2 4.6,6 6.6,5 9.4,0 10',
  C: '6 1.5,3.5 0,1 1.2,0 5,1 8.8,3.5 10,6 8.5',
  D: '0 0,0 10,3.5 10,6 7,6 3,3.5 0,0 0',
  E: '6 0,0 0,0 5,0 10,6 10|0 5,4.5 5',
  F: '6 0,0 0,0 5,0 10|0 5,4.5 5',
  G: '6 1.5,3.5 0,1 1.2,0 5,1 8.8,3.5 10,6 8.5,6 5.5,3.5 5.5',
  H: '0 0,0 5,0 10|6 0,6 5,6 10|0 5,6 5',
  I: '1.2 0,3 0,4.8 0|3 0,3 5,3 10|1.2 10,3 10,4.8 10',
  J: '6 0,6 7.5,4.5 10,1.5 10,0 7.5',
  K: '0 0,0 5.5,0 10|6 0,0 5.5,6 10',
  L: '0 0,0 10,6 10',
  M: '0 10,0 0,3 6,6 0,6 10',
  N: '0 10,0 0,6 10,6 0',
  O: '3 0,5.6 1.6,6 5,5.6 8.4,3 10,.4 8.4,0 5,.4 1.6,3 0',
  P: '0 10,0 5,0 0,4.5 0,6 1.6,6 3.4,4.5 5,0 5',
  Q: '3 0,5.6 1.6,6 5,5.6 8.4,3 10,.4 8.4,0 5,.4 1.6,3 0|3.8 7.2,6.2 10.4',
  R: '0 10,0 5,0 0,4.5 0,6 1.6,6 3.4,4.5 5,0 5|4.5 5,6 10',
  S: '6 1.2,3.5 0,.6 1,.4 3.4,3 5,5.6 6.6,5.4 9,2.5 10,0 8.8',
  T: '0 0,3 0,6 0|3 0,3 5,3 10',
  U: '0 0,0 7.5,1.5 10,4.5 10,6 7.5,6 0',
  V: '0 0,3 10,6 0',
  W: '0 0,1.5 10,3 4,4.5 10,6 0',
  X: '0 0,3 5,6 10|6 0,3 5,0 10',
  Y: '0 0,3 5,6 0|3 5,3 10',
  Z: '0 0,6 0,0 10,6 10',
}
// For initials outside A–Z: a small heart.
const heart = '3 10,.3 6,0 2.5,1.5 .6,3 2.4,4.5 .6,6 2.5,5.7 6,3 10'

type Star = { x: number; y: number; r: number; first: number; tw: number }
type Segment = { x: number; y: number; length: number; angle: number }

const noise = (seed: number) => { const v = Math.sin(seed * 12.9898) * 43758.5453; return v - Math.floor(v) }

function chart(initials: [string, string]) {
  const stars: Star[] = []
  const segments: Segment[] = []
  const ends: Star[][] = []
  initials.forEach((letter, n) => {
    const shape = letters[letter] ?? heart
    const code = letter.charCodeAt(0) || 7
    const index = new Map<string, Star>()
    const own: Star[] = []
    const ox = n === 0 ? 22 : 158, oy = 28
    for (const stroke of shape.split('|')) {
      let previous: Star | undefined
      for (const point of stroke.split(',')) {
        let star = index.get(point)
        if (!star) {
          const [gx, gy] = point.split(' ').map(Number)
          const k = own.length + n * 31
          star = {
            x: fixed(ox + gx * 10 + (noise(code + k) - .5) * 3.4), y: fixed(oy + gy * 10 + (noise(code * 3 + k) - .5) * 3.4),
            r: fixed(1.5 + noise(code * 7 + k) * 1.5), first: segments.length, tw: fixed(2.4 + noise(code * 5 + k) * 3),
          }
          index.set(point, star)
          own.push(star)
          stars.push(star)
        }
        if (previous) segments.push(link(previous, star))
        previous = star
      }
    }
    ends.push(own)
  })
  // The two initials are joined through one bright star in the middle.
  const middle = { x: 120, y: 80 }
  const nearest = (own: Star[]) => own.reduce((best, star) => Math.hypot(star.x - middle.x, star.y - middle.y) < Math.hypot(best.x - middle.x, best.y - middle.y) ? star : best)
  segments.push(link(nearest(ends[0]), middle), link(middle, nearest(ends[1])))
  return { stars, segments }
}

function link(from: { x: number; y: number }, to: { x: number; y: number }): Segment {
  return { x: from.x, y: from.y, length: fixed(Math.hypot(to.x - from.x, to.y - from.y)), angle: fixed(Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI) }
}

export const initialOf = (name: string) => (name.trim().charAt(0) || '·').toUpperCase()

export function Constellation({ initials, className }: { initials: [string, string]; className?: string }) {
  const id = useId()
  const { stars, segments } = useMemo(() => chart(initials), [initials[0], initials[1]])
  const step = 1.55 / segments.length
  const ticks = useMemo(() => Array.from({ length: 48 }, (_, i) => {
    const a = i / 48 * Math.PI * 2, outer = i % 4 ? 77 : 80
    return `M${fixed(120 + Math.cos(a) * 74)} ${fixed(80 + Math.sin(a) * 74)}L${fixed(120 + Math.cos(a) * outer)} ${fixed(80 + Math.sin(a) * outer)}`
  }).join(''), [])
  return <svg className={'cn-constellation ' + (className ?? '')} viewBox="0 0 240 160" aria-hidden="true" focusable="false"
    style={{ '--step': step + 's' } as CSSProperties}>
    <defs>
      <radialGradient id={id}><stop offset="0" stopColor="var(--cn-glow)" stopOpacity=".75" /><stop offset="1" stopColor="var(--cn-glow)" stopOpacity="0" /></radialGradient>
    </defs>
    <g className="cn-c-chart">
      <circle cx="120" cy="80" r="74" /><circle cx="120" cy="80" r="66" className="is-dashed" />
      <path d={ticks} />
      <ellipse cx="120" cy="80" rx="74" ry="24" transform="rotate(-18 120 80)" className="is-dashed" />
    </g>
    <g className="cn-c-lines">
      {segments.map((segment, i) => <g key={i} transform={`translate(${segment.x} ${segment.y}) rotate(${segment.angle})`}>
        <rect className="cn-c-seg" width={segment.length} height=".8" y="-.4" style={{ '--i': i } as CSSProperties} />
      </g>)}
    </g>
    {stars.map((star, i) => <g key={i} transform={`translate(${star.x} ${star.y})`}>
      <g className="cn-c-star" style={{ '--i': star.first, '--tw': star.tw + 's' } as CSSProperties}>
        <circle r={star.r * 4} fill={`url(#${id})`} className="cn-c-halo" />
        <circle r={star.r} className="cn-c-core" />
      </g>
    </g>)}
    <g transform="translate(120 80)">
      <g className="cn-c-heart">
        <circle r="20" fill={`url(#${id})`} />
        <path className="cn-c-core" d="M0-11L1.6-1.6L11 0L1.6 1.6L0 11L-1.6 1.6L-11 0L-1.6-1.6Z" />
        <circle r="2.6" className="cn-c-core" />
      </g>
    </g>
  </svg>
}

// The moon at any phase: lit is 0 (new) to 1 (full), waxing from the right.
export function Moon({ lit, className, craters, glow }: { lit: number; className?: string; craters?: boolean; glow?: boolean }) {
  const id = useId()
  const k = Math.min(1, Math.max(0, lit))
  const rx = fixed(Math.abs(1 - 2 * k) * 40)
  const shape = k >= .995 ? 'M50 10A40 40 0 1 1 49.99 10Z' : `M50 10A40 40 0 0 1 50 90A${rx} 40 0 0 ${k < .5 ? 0 : 1} 50 10Z`
  return <svg className={'cn-moon ' + (className ?? '')} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={id + 'f'} cx="62%" cy="38%" r="70%"><stop offset="0" stopColor="var(--cn-moon)" /><stop offset="1" stopColor="var(--cn-moon-2)" /></radialGradient>
      <radialGradient id={id + 'g'}><stop offset=".5" stopColor="var(--cn-glow)" stopOpacity=".32" /><stop offset="1" stopColor="var(--cn-glow)" stopOpacity="0" /></radialGradient>
      <clipPath id={id + 'c'}><path d={shape} /></clipPath>
    </defs>
    {glow && <circle cx="50" cy="50" r="50" fill={`url(#${id}g)`} />}
    <circle cx="50" cy="50" r="40" className="cn-moon-dark" />
    <path d={shape} fill={`url(#${id}f)`} />
    {craters && <g clipPath={`url(#${id}c)`} className="cn-moon-craters">
      <circle cx="66" cy="34" r="6" /><circle cx="74" cy="58" r="4" /><circle cx="56" cy="70" r="7.5" /><circle cx="40" cy="44" r="5" />
      <circle cx="31" cy="64" r="3.4" /><circle cx="48" cy="24" r="3" /><circle cx="80" cy="42" r="2.4" />
    </g>}
  </svg>
}

export function Spark({ className, style }: { className?: string; style?: CSSProperties }) {
  return <svg className={'cn-spark ' + (className ?? '')} viewBox="-12 -12 24 24" aria-hidden="true" focusable="false" style={style}>
    <path d="M0-12L1.7-1.7L12 0L1.7 1.7L0 12L-1.7 1.7L-12 0L-1.7-1.7Z" />
  </svg>
}

export function StarRule({ className }: { className?: string }) {
  return <svg className={'cn-rule ' + (className ?? '')} viewBox="0 0 220 20" aria-hidden="true" focusable="false">
    <path className="cn-rule-line" d="M4 10H86M134 10H216" />
    <g className="cn-rule-dots"><circle cx="96" cy="10" r="1.1" /><circle cx="124" cy="10" r="1.1" /><circle cx="2" cy="10" r=".9" /><circle cx="218" cy="10" r=".9" /></g>
    <path className="cn-rule-star" d="M110 1L111.4 8.6L119 10L111.4 11.4L110 19L108.6 11.4L101 10L108.6 8.6Z" />
  </svg>
}

// The blessing symbols set inside a ring of fine rays, like a bright star.
export function Sigil({ symbol, large }: { symbol: InvitationSymbol; large?: boolean }) {
  const rays = Array.from({ length: 24 }, (_, i) => {
    const a = i / 24 * Math.PI * 2, inner = 41, outer = i % 2 ? 46 : 49
    return `M${fixed(50 + Math.cos(a) * inner)} ${fixed(50 + Math.sin(a) * inner)}L${fixed(50 + Math.cos(a) * outer)} ${fixed(50 + Math.sin(a) * outer)}`
  }).join('')
  return <svg className={'cn-sigil' + (large ? ' is-large' : '')} viewBox="0 0 100 100" role="img" aria-label={symbol}>
    <path d={rays} className="cn-sigil-rays" />
    <circle cx="50" cy="50" r="37" className="cn-sigil-face" />
    <circle cx="50" cy="50" r="33.5" className="cn-sigil-ring" />
    {symbol === 'om' && <text x="50" y="64" textAnchor="middle" className="cn-glyph">ॐ</text>}
    {symbol === 'shri' && <text x="50" y="61" textAnchor="middle" className="cn-glyph is-shri">श्री</text>}
    {symbol === 'swastik' && <g transform="translate(31 31)" className="cn-glyph-line">
      <path d="M19 19V3H32M19 19H35V32M19 19V35H6M19 19H3V6" />
      <g className="cn-glyph-dot"><circle cx="10" cy="10" r="2.3" /><circle cx="28" cy="10" r="2.3" /><circle cx="28" cy="28" r="2.3" /><circle cx="10" cy="28" r="2.3" /></g>
    </g>}
    {symbol === 'kalash' && <g className="cn-sigil-kalash" transform="translate(27 26) scale(.46)"><EventArt icon="kalash" /></g>}
  </svg>
}

// Low hills over still water, with the moon's path of light on it.
export function Horizon({ className }: { className?: string }) {
  const id = useId()
  const glints = [[65, 84, 0], [69.5, 58, 4], [74, 66, -3], [78.5, 40, 2], [83, 46, -2], [87.5, 24, 1], [92, 14, -1]]
  return <svg className={'cn-horizon ' + (className ?? '')} viewBox="0 0 400 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--cn-hill-near)" /><stop offset="1" stopColor="var(--cn-hill-near)" stopOpacity="0" />
      </linearGradient>
    </defs>
    <path className="cn-horizon-far" d="M0 40C40 26 70 30 110 35S180 18 230 27S320 42 360 31S395 29 400 31V62H0Z" />
    <path className="cn-horizon-near" d="M0 52C50 44 90 50 140 48S220 40 270 46S350 56 400 49V62H0Z" />
    <rect y="62" width="400" height="38" fill={`url(#${id})`} />
    {glints.map(([y, w, dx], i) => <rect key={y} className="cn-horizon-glint" x={200 + dx - w / 2} y={y} width={w} height="1.3" rx=".65" style={{ opacity: .55 - i * .065 }} />)}
  </svg>
}

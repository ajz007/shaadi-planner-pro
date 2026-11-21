// Artwork for Marigold Mandap, drawn from simple geometry and coloured
// through this template's custom properties (--mm-*), so one set of art
// serves both palettes.
import { useId } from 'react'
import type { InvitationSymbol } from '../../model'

const round = (n: number) => Math.round(n * 100) / 100
const ring = <T,>(count: number, offset: number, draw: (angle: number, index: number) => T) =>
  Array.from({ length: count }, (_, index) => draw(offset + (360 / count) * index, index))

// A marigold head: three rings of rounded petals around a deep core.
const tones = ['var(--mm-f1)', 'var(--mm-f2)', 'var(--mm-f3)']
export function Bloom({ r = 10, x = 0, y = 0, open = false, alt = false }: { r?: number; x?: number; y?: number; open?: boolean; alt?: boolean }) {
  const [a, b, c] = alt ? [tones[2], tones[1], tones[0]] : tones
  return <g transform={`translate(${round(x)} ${round(y)})`}>
    {ring(18, 0, angle => <ellipse key={'a' + angle} cy={round(-r * 0.66)} rx={round(r * 0.2)} ry={round(r * 0.34)} fill={a} transform={`rotate(${round(angle)})`} />)}
    {ring(14, 12, angle => <ellipse key={'b' + angle} cy={round(-r * 0.46)} rx={round(r * 0.19)} ry={round(r * 0.28)} fill={b} transform={`rotate(${round(angle)})`} />)}
    {!open && ring(10, 4, angle => <ellipse key={'c' + angle} cy={round(-r * 0.26)} rx={round(r * 0.16)} ry={round(r * 0.22)} fill={c} transform={`rotate(${round(angle)})`} />)}
    {!open && <circle r={round(r * 0.16)} fill="var(--mm-core)" />}
  </g>
}

// A string of marigolds (a ladi). One pattern is defined per page and every
// strand fills itself with it, so a strand can be any length.
const ladiPattern = 'mm-ladi-flowers'
export function LadiDefs() {
  return <svg className="mm-defs" width="0" height="0" aria-hidden="true" focusable="false">
    <defs>
      <pattern id={ladiPattern} width="20" height="34" patternUnits="userSpaceOnUse">
        <path d="M10 0V34" stroke="var(--mm-gold-deep)" strokeWidth="1" />
        <Bloom x={10} y={8.5} r={9.6} />
        <Bloom x={10} y={25.5} r={9.6} alt />
      </pattern>
    </defs>
  </svg>
}
export function Ladi({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <svg className={'mm-ladi ' + (className ?? '')} style={style} aria-hidden="true" focusable="false">
    <rect width="100%" height="100%" fill={`url(#${ladiPattern})`} />
  </svg>
}

// Pointed mango leaf hanging from (0, 0).
const mangoLeaf = 'M0 0C7 7 8 24 0 38C-8 24-7 7 0 0Z'

// A string of mango leaves and marigolds, tiled to any width.
export function MangoToran({ className, tiles = 26 }: { className?: string; tiles?: number }) {
  const width = tiles * 60
  return <svg className={'mm-toran ' + (className ?? '')} viewBox={`0 0 ${width} 58`} preserveAspectRatio="xMidYMin slice" aria-hidden="true" focusable="false">
    <path d={`M0 5${Array.from({ length: tiles }, () => 'q30 6 60 0').join('')}`} fill="none" stroke="var(--mm-gold-deep)" strokeWidth="1.6" />
    {Array.from({ length: tiles }, (_, i) => <g key={i} transform={`translate(${i * 60} 0)`}>
      <g className="mm-leaf-sway" style={{ animationDelay: -(i % 5) * 0.7 + 's' }}>
        <path d={mangoLeaf} transform="translate(15 7) rotate(8)" fill="var(--mm-leaf)" />
        <path d="M0 2V34" transform="translate(15 7) rotate(8)" stroke="var(--mm-leaf-deep)" strokeWidth="1" opacity=".7" />
        <path d={mangoLeaf} transform="translate(45 7) rotate(-8)" fill="var(--mm-leaf-2)" />
        <path d="M0 2V34" transform="translate(45 7) rotate(-8)" stroke="var(--mm-leaf-deep)" strokeWidth="1" opacity=".7" />
      </g>
      <Bloom x={30} y={11} r={9} />
      <Bloom x={0} y={8} r={6} open />
    </g>)}
  </svg>
}

// A short horizontal garland used under headings: leaf, blooms, leaf.
export function GarlandRule({ className }: { className?: string }) {
  return <svg className={'mm-rule ' + (className ?? '')} viewBox="0 0 200 30" aria-hidden="true" focusable="false">
    <path d="M6 15Q100 34 194 15" fill="none" stroke="var(--mm-gold)" strokeWidth="1.2" />
    <path d={mangoLeaf} transform="translate(30 17) rotate(-100) scale(.6)" fill="var(--mm-leaf)" />
    <path d={mangoLeaf} transform="translate(170 17) rotate(100) scale(.6)" fill="var(--mm-leaf)" />
    {[56, 76, 124, 144].map((x, i) => <Bloom key={x} x={x} y={i === 1 || i === 2 ? 21 : 19} r={6} />)}
    <Bloom x={100} y={20} r={9.5} />
  </svg>
}

// A banana leaf for corners: a curved midrib with parallel veins and a torn edge.
export function BananaLeaf({ className }: { className?: string }) {
  const id = useId()
  const cubic = (p: number[][], t: number) => {
    const u = 1 - t
    return [0, 1].map(k => u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k])
  }
  const rib = [[16, 292], [50, 200], [96, 92], [176, 12]]
  const left = [[16, 292], [-26, 170], [60, 40], [176, 12]]
  const right = [[16, 292], [150, 150], [150, 70], [176, 12]]
  const veins = Array.from({ length: 15 }, (_, i) => {
    const t = 0.08 + i * 0.058, p = cubic(rib, t), l = cubic(left, Math.min(1, t + 0.05)), r = cubic(right, Math.min(1, t + 0.05))
    return `M${round(p[0])} ${round(p[1])}L${round(l[0])} ${round(l[1])}M${round(p[0])} ${round(p[1])}L${round(r[0])} ${round(r[1])}`
  }).join('')
  return <svg className={'mm-banana ' + (className ?? '')} viewBox="0 0 200 300" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor="var(--mm-leaf-deep)" /><stop offset=".55" stopColor="var(--mm-leaf)" /><stop offset="1" stopColor="var(--mm-leaf-2)" />
      </linearGradient>
    </defs>
    <path d="M16 292C-26 170 60 40 176 12C150 70 150 150 16 292Z" fill={`url(#${id})`} />
    <path d={veins} stroke="var(--mm-leaf-deep)" strokeWidth="1.1" opacity=".45" fill="none" />
    <path d="M16 292C50 200 96 92 176 12" stroke="var(--mm-leaf-light)" strokeWidth="3.2" fill="none" strokeLinecap="round" />
  </svg>
}

// One carved wooden door leaf. The right door is the same art, mirrored in CSS.
export function Door({ side }: { side: 'left' | 'right' }) {
  const id = useId()
  const studs = [18, 218, 398, 582].flatMap(y => [26, 63, 100, 137, 174].map(x => [x, y]))
  const lattice = Array.from({ length: 13 }, (_, i) => {
    const x = 30 + (i - 6) * 28
    return `M${x} 416L${x + 144} 560M${x + 144} 416L${x} 560`
  }).join('')
  return <svg className={'mm-door-art is-' + side} viewBox="0 0 200 600" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={id + 'w'} x1="0" x2="1">
        <stop offset="0" stopColor="var(--mm-wood-2)" /><stop offset=".45" stopColor="var(--mm-wood-1)" /><stop offset="1" stopColor="var(--mm-wood-2)" />
      </linearGradient>
      <linearGradient id={id + 'b'} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="var(--mm-gold-light)" /><stop offset=".55" stopColor="var(--mm-gold)" /><stop offset="1" stopColor="var(--mm-gold-deep)" />
      </linearGradient>
      <clipPath id={id + 'c'}><rect x="30" y="416" width="140" height="144" /></clipPath>
    </defs>
    <rect width="200" height="600" fill={`url(#${id}w)`} />
    <rect x="5" y="5" width="190" height="590" fill="none" stroke="var(--mm-wood-3)" strokeWidth="3" opacity=".6" />
    <path d="M200 0V600" stroke="var(--mm-wood-3)" strokeWidth="4" />
    {/* Arched top panel with a carved sunflower */}
    <path d="M30 200V100Q30 44 100 40Q170 44 170 100V200Z" fill="var(--mm-wood-3)" opacity=".42" />
    <path d="M37 193V102Q37 52 100 48Q163 52 163 102V193Z" fill="none" stroke="var(--mm-wood-hi)" strokeWidth="1.4" opacity=".55" />
    <g transform="translate(100 128)" fill="none" stroke="var(--mm-wood-hi)" strokeWidth="1.5" opacity=".75">
      {ring(12, 0, angle => <path key={angle} d="M0-11C7-20 7-33 0-40C-7-33-7-20 0-11Z" transform={`rotate(${angle})`} />)}
      <circle r="9" fill={`url(#${id}b)`} stroke="none" />
    </g>
    {/* Middle panel: a lotus rosette in a carved square */}
    <rect x="30" y="236" width="140" height="144" fill="var(--mm-wood-3)" opacity=".42" />
    <rect x="37" y="243" width="126" height="130" fill="none" stroke="var(--mm-wood-hi)" strokeWidth="1.4" opacity=".55" />
    <g transform="translate(100 308)" fill="none" stroke="var(--mm-wood-hi)" strokeWidth="1.6" opacity=".75">
      {ring(8, 22.5, angle => <path key={angle} d="M0-8C12-17 12-38 0-46C-12-38-12-17 0-8Z" transform={`rotate(${angle})`} />)}
      <circle r="6" />
    </g>
    {/* Bottom panel: carved lattice */}
    <rect x="30" y="416" width="140" height="144" fill="var(--mm-wood-3)" opacity=".42" />
    <path d={lattice} clipPath={`url(#${id}c)`} fill="none" stroke="var(--mm-wood-hi)" strokeWidth="1.3" opacity=".5" />
    {studs.map(([x, y]) => <circle key={x + '-' + y} cx={x} cy={y} r="3.8" fill={`url(#${id}b)`} />)}
    {/* Brass hinge straps */}
    <path d="M0 84H48M0 516H48" stroke={`url(#${id}b)`} strokeWidth="8" strokeLinecap="round" />
    {/* Brass knocker: a boss and a ring that swings when the doors open */}
    <g transform="translate(176 308)">
      <circle r="10" fill={`url(#${id}b)`} />
      <g className="mm-knocker"><circle cy="22" r="17" fill="none" stroke={`url(#${id}b)`} strokeWidth="5" /></g>
      <circle r="3.2" fill="var(--mm-wood-3)" opacity=".6" />
    </g>
  </svg>
}

// A brass diya bowl, used in the countdown and the closing.
export function DiyaBowl({ className }: { className?: string }) {
  const id = useId()
  return <svg className={'mm-diya-bowl ' + (className ?? '')} viewBox="0 0 100 54" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--mm-gold-light)" /><stop offset=".5" stopColor="var(--mm-gold)" /><stop offset="1" stopColor="var(--mm-gold-deep)" />
      </linearGradient>
    </defs>
    <path d="M4 8H96Q90 44 50 44Q10 44 4 8Z" fill={`url(#${id})`} />
    <path d="M4 8H96" stroke="var(--mm-gold-deep)" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M16 18Q50 28 84 18" stroke="var(--mm-gold-light)" strokeWidth="1.2" fill="none" opacity=".8" />
    <path d="M38 44L34 52H66L62 44Z" fill="var(--mm-gold-deep)" />
  </svg>
}

// Symbols from the content, each set in a marigold rosette.
export function SymbolBloom({ symbol, large }: { symbol: InvitationSymbol; large?: boolean }) {
  const label = { om: 'Om', shri: 'Shri', swastik: 'Swastik', kalash: 'Kalash' }[symbol]
  return <svg className={'mm-symbol' + (large ? ' is-large' : '')} viewBox="-50 -50 100 100" role="img" aria-label={label}>
    <Bloom r={48} open />
    <circle r="31" fill="var(--mm-card)" />
    <circle r="27" fill="none" stroke="var(--mm-gold)" strokeWidth="1" strokeDasharray="1.5 3" />
    {symbol === 'om' && <text y="15" textAnchor="middle" className="mm-glyph">ॐ</text>}
    {symbol === 'shri' && <text y="11" textAnchor="middle" className="mm-glyph is-shri">श्री</text>}
    {symbol === 'swastik' && <g fill="none" stroke="var(--mm-sindoor)" strokeWidth="4" strokeLinecap="square" transform="translate(-17 -17) scale(.85)">
      <path d="M20 20V2H34M20 20H38V34M20 20V38H6M20 20H2V6" />
      <g fill="var(--mm-sindoor)" stroke="none"><circle cx="10" cy="10" r="2.6" /><circle cx="30" cy="10" r="2.6" /><circle cx="30" cy="30" r="2.6" /><circle cx="10" cy="30" r="2.6" /></g>
    </g>}
    {symbol === 'kalash' && <g transform="translate(0 2)">
      <path d="M-9-10C-16-17-22-16-25-12C-19-10-14-10-9-10ZM9-10C16-17 22-16 25-12C19-10 14-10 9-10Z" fill="var(--mm-leaf)" />
      <circle cy="-17" r="6" fill="var(--mm-f2)" />
      <path d="M-9-11H9V-6H-9Z" fill="var(--mm-gold-deep)" />
      <path d="M-9-6C-20 4-16 20 0 20C16 20 20 4 9-6Z" fill="var(--mm-gold)" />
      <path d="M-13 7Q0 12 13 7" stroke="var(--mm-sindoor)" strokeWidth="1.6" fill="none" />
    </g>}
  </svg>
}

// The marigold head a function hangs from; the function's icon sits in its centre.
export function MedalBloom() {
  return <svg className="mm-medal-bloom" viewBox="-50 -50 100 100" aria-hidden="true" focusable="false">
    <Bloom r={49} open />
    <circle r="33" fill="var(--mm-card)" />
    <circle r="29.5" fill="none" stroke="var(--mm-gold)" strokeWidth="1.2" />
  </svg>
}

// A ring of small marigolds around the cover photo.
export function Wreath() {
  return <svg className="mm-wreath" viewBox="-110 -110 220 220" aria-hidden="true" focusable="false">
    {ring(16, 11, angle => {
      const a = (angle - 90) * Math.PI / 180
      return <path key={'l' + angle} d={mangoLeaf} fill="var(--mm-leaf)" transform={`translate(${round(Math.cos(a) * 96)} ${round(Math.sin(a) * 96)}) rotate(${round(angle + 180 + 40)}) scale(.55)`} />
    })}
    {ring(32, 0, angle => {
      const a = (angle - 90) * Math.PI / 180
      return <Bloom key={angle} x={Math.cos(a) * 98} y={Math.sin(a) * 98} r={9.5} />
    })}
  </svg>
}

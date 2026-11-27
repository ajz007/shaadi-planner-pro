// Artwork for Kasavu & Lamp, drawn in code and coloured through this
// template's custom properties (--kk-*), so one set of art serves both
// palettes. Nothing here is a copy of a real card or artwork.
import { useId } from 'react'
import type { CSSProperties } from 'react'
import { EventArt } from '../../art'
import type { InvitationSymbol } from '../../model'

const r1 = (n: number) => Math.round(n * 10) / 10
const rad = (deg: number) => deg * Math.PI / 180

// Wicks around the lamp's dish, left to right, and the order they catch.
export const wicks = [
  { x: 34, y: 110, tilt: -14 }, { x: 64, y: 116, tilt: -7 }, { x: 100, y: 119, tilt: 0 }, { x: 136, y: 116, tilt: 7 }, { x: 166, y: 110, tilt: 14 },
]
export const wickOrder = [2, 1, 3, 0, 4]

export function Flame({ on, delay = 0, glow = true, style }: { on: boolean; delay?: number; glow?: boolean; style?: CSSProperties }) {
  return <g className={'kk-flame' + (on ? ' is-on' : '')} style={{ ...style, '--fd': delay + 's' } as CSSProperties}>
    {glow && <circle className="kk-flame-glow" cx="0" cy="-12" r="20" fill="url(#kk-flame-glow)" />}
    <g className="kk-flame-body">
      <path className="kk-flame-outer" d="M0 -30C6 -20 9 -12 7 -6C5.5 -1.5 2.8 1 0 1C-2.8 1 -5.5 -1.5 -7 -6C-9 -12 -6 -20 0 -30Z" />
      <path className="kk-flame-inner" d="M0 -17C3 -11 4 -7 3 -4C2 -1.6 1 -.6 0 -.6C-1 -.6 -2 -1.6 -3 -4C-4 -7 -3 -11 0 -17Z" />
    </g>
  </g>
}

// A tall Kerala floor lamp: a crowned spire rising from a wide dish with five
// wicks, a ringed stem, a drip plate and a stepped bell base.
// It renders in two layers so the flames can sit above the opening's dusk
// veil while the brass stays beneath it.
export function LampFlames({ lit, className }: { lit: boolean[]; className?: string }) {
  return <svg className={className} viewBox="0 0 200 430" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="kk-flame-glow"><stop offset="0" stopColor="#ffd27a" stopOpacity=".7" /><stop offset="1" stopColor="#ffd27a" stopOpacity="0" /></radialGradient>
    </defs>
    {wicks.map((wick, i) => <Flame key={i} on={lit[i]} delay={-i * .37}
      style={{ transform: `translate(${wick.x}px, ${wick.y - 1}px) rotate(${wick.tilt}deg) scale(1.4)` }} />)}
  </svg>
}

export function Lamp({ className }: { className?: string }) {
  const id = useId()
  const brass = `url(#${id}b)`, dish = `url(#${id}d)`
  const knots = [150, 196, 242]
  return <svg className={className} viewBox="0 0 200 430" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={id + 'b'} x1="0" x2="1">
        <stop offset="0" stopColor="var(--kk-brass-deep)" /><stop offset=".32" stopColor="var(--kk-brass-light)" />
        <stop offset=".55" stopColor="var(--kk-brass)" /><stop offset="1" stopColor="var(--kk-brass-deep)" />
      </linearGradient>
      <linearGradient id={id + 'd'} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="var(--kk-brass-light)" /><stop offset=".5" stopColor="var(--kk-brass)" /><stop offset="1" stopColor="var(--kk-brass-deep)" />
      </linearGradient>
    </defs>
    {/* spire */}
    <path d="M100 18C104 26 106 32 104 38H96C94 32 96 26 100 18Z" fill={brass} />
    <ellipse cx="100" cy="40" rx="9" ry="3.2" fill={dish} />
    <path d="M95 43H105L107 60H93Z" fill={brass} />
    <ellipse cx="100" cy="62" rx="12" ry="4" fill={dish} />
    <path d="M92 66H108C111 74 110 82 104 88H96C90 82 89 74 92 66Z" fill={brass} />
    <ellipse cx="100" cy="90" rx="10" ry="3.4" fill={dish} />
    <path d="M96 92H104L106 106H94Z" fill={brass} />
    {/* dish */}
    <ellipse cx="100" cy="108" rx="74" ry="10" fill="var(--kk-brass-deep)" />
    <path d="M26 108C30 122 58 130 100 130C142 130 170 122 174 108C160 116 132 120 100 120C68 120 40 116 26 108Z" fill={dish} />
    <path d="M26 108C40 116 68 120 100 120C132 120 160 116 174 108" fill="none" stroke="var(--kk-brass-light)" strokeWidth="1.6" opacity=".8" />
    <path d="M40 124C60 132 140 132 160 124C150 136 128 140 100 140C72 140 50 136 40 124Z" fill={brass} />
    {wicks.map((wick, i) => <path key={i} d={`M${wick.x - 5} ${wick.y + 1}Q${wick.x} ${wick.y - 4} ${wick.x + 5} ${wick.y + 1}`}
      fill="none" stroke="var(--kk-brass-light)" strokeWidth="2" strokeLinecap="round" />)}
    {/* stem */}
    <path d="M95 140H105L104 330H96Z" fill={brass} />
    {knots.map(y => <g key={y}>
      <ellipse cx="100" cy={y} rx="11" ry="7" fill={brass} />
      <ellipse cx="100" cy={y - 5} rx="8" ry="2" fill="var(--kk-brass-light)" opacity=".55" />
    </g>)}
    <ellipse cx="100" cy="290" rx="38" ry="6" fill="var(--kk-brass-deep)" />
    <path d="M62 290C68 298 82 302 100 302C118 302 132 298 138 290C126 295 114 296 100 296C86 296 74 295 62 290Z" fill={dish} />
    {/* base */}
    <path d="M92 326H108C112 340 124 350 134 360C146 372 150 386 150 396H50C50 386 54 372 66 360C76 350 88 340 92 326Z" fill={brass} />
    <path d="M66 360H134" stroke="var(--kk-brass-deep)" strokeWidth="1.4" opacity=".6" />
    <path d="M54 380H146" stroke="var(--kk-brass-light)" strokeWidth="1.2" opacity=".6" />
    <path d="M40 396H160L168 410H32Z" fill={brass} />
    <ellipse cx="100" cy="412" rx="72" ry="8" fill="var(--kk-brass-deep)" />
  </svg>
}

// Nirapara: a wooden measure brimming with paddy, crowned with a spray of
// coconut flowers. Set on either side of the lamp.
export function Nirapara({ className }: { className?: string }) {
  const stalks = Array.from({ length: 11 }, (_, i) => {
    const a = rad(-48 + i * 9.6), len = 64 + (5 - Math.abs(i - 5)) * 5
    const sx = 60, sy = 84
    const ex = sx + Math.sin(a) * len, ey = sy - Math.cos(a) * len
    const cx = sx + Math.sin(a) * len * .35, cy = sy - Math.cos(a) * len * .8
    const buds = Array.from({ length: 6 }, (_, j) => {
      const t = .35 + j * .12, u = 1 - t
      return [r1(u * u * sx + 2 * u * t * cx + t * t * ex), r1(u * u * sy + 2 * u * t * cy + t * t * ey)]
    })
    return { d: `M${sx} ${sy}Q${r1(cx)} ${r1(cy)} ${r1(ex)} ${r1(ey)}`, buds, droop: [r1(ex), r1(ey)] }
  })
  const grains = Array.from({ length: 26 }, (_, i) => {
    const row = Math.floor(i / 7), col = i % 7
    return [r1(24 + col * 12 + (row % 2) * 6), r1(102 - row * 6 + (Math.abs(col - 3) * 1.6)), (i * 37) % 60 - 30]
  }).filter(([x, y]) => y > 80 + Math.abs(x - 60) * .35)
  return <svg className={className} viewBox="0 0 120 200" aria-hidden="true" focusable="false">
    <g fill="none" stroke="var(--kk-spray)" strokeWidth="1.5" strokeLinecap="round">
      {stalks.map((stalk, i) => <path key={i} d={stalk.d} />)}
    </g>
    <g fill="var(--kk-spray)">
      {stalks.flatMap((stalk, i) => stalk.buds.map(([x, y], j) => <circle key={i + '-' + j} cx={x} cy={y} r={j > 3 ? 1.5 : 2.1} />))}
    </g>
    <path d="M14 112C20 90 40 78 60 78C80 78 100 90 106 112Z" fill="var(--kk-paddy)" />
    <g fill="var(--kk-paddy-deep)">
      {grains.map(([x, y, a], i) => <ellipse key={i} cx={x} cy={y} rx="2.6" ry="1.2" transform={`rotate(${a} ${x} ${y})`} />)}
    </g>
    <path d="M14 112H106L100 190H20Z" fill="var(--kk-wood)" />
    <path d="M14 112H106" stroke="var(--kk-brass-light)" strokeWidth="3" />
    <path d="M17 132H103M19 168H101M20 188H100" stroke="var(--kk-brass)" strokeWidth="4" />
    <path d="M40 112L38 190M80 112L82 190" stroke="var(--kk-brass)" strokeWidth="3" />
    <ellipse cx="60" cy="191" rx="44" ry="4" fill="var(--kk-wood-deep)" />
  </svg>
}

// A coconut palm, drawn procedurally: a leaning ringed trunk and a crown of
// drooping fronds with leaflets on both sides.
function frond(x: number, y: number, angle: number, length: number, droop: number) {
  const a = rad(angle)
  const ex = x + Math.cos(a) * length, ey = y + Math.sin(a) * length + droop
  const cx = x + Math.cos(a) * length * .55, cy = y + Math.sin(a) * length * .55 - droop * .35
  let leaves = ''
  for (let i = 2; i <= 16; i++) {
    const t = i / 17, u = 1 - t
    const px = u * u * x + 2 * u * t * cx + t * t * ex, py = u * u * y + 2 * u * t * cy + t * t * ey
    const tx = 2 * u * (cx - x) + 2 * t * (ex - cx), ty = 2 * u * (cy - y) + 2 * t * (ey - cy)
    const n = Math.hypot(tx, ty) || 1
    const leaf = length * .3 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + 3
    for (const side of [1, -1]) {
      const nx = -ty / n * side, ny = tx / n * side
      const lx = px + (nx * .42 + tx / n * .38) * leaf, ly = py + ny * .3 * leaf + leaf * .85
      leaves += `M${r1(px)} ${r1(py)}L${r1(lx)} ${r1(ly)}`
    }
  }
  return { spine: `M${r1(x)} ${r1(y)}Q${r1(cx)} ${r1(cy)} ${r1(ex)} ${r1(ey)}`, leaves }
}

const crown = [[-172, 70, 30], [-140, 78, 34], [-110, 64, 20], [-76, 66, 22], [-42, 80, 34], [-10, 76, 40], [20, 62, 36], [160, 60, 36], [-90, 50, 10]]
  .map(([angle, length, droop]) => frond(150, 60, angle, length, droop))

export function Palm({ className, style }: { className?: string; style?: CSSProperties }) {
  return <svg className={className} style={style} viewBox="0 0 240 300" aria-hidden="true" focusable="false">
    <path d="M38 300C46 230 78 140 146 62L156 66C96 142 66 232 56 300Z" fill="var(--kk-palm)" />
    <g stroke="var(--kk-palm-line)" strokeWidth="1.3" opacity=".5">
      {Array.from({ length: 16 }, (_, i) => {
        const t = i / 16, x = 47 + (150 - 47) * t * (t * .25 + .75), y = 300 - 238 * t
        return <path key={i} d={`M${r1(x - 6)} ${r1(y)}L${r1(x + 6)} ${r1(y - 3)}`} />
      })}
    </g>
    <g className="kk-palm-crown">
      <g fill="none" stroke="var(--kk-palm)" strokeLinecap="round">
        {crown.map((f, i) => <path key={'s' + i} d={f.spine} strokeWidth="3" />)}
        {crown.map((f, i) => <path key={'l' + i} d={f.leaves} strokeWidth="1.7" />)}
      </g>
      <g fill="var(--kk-palm-nut)"><circle cx="144" cy="70" r="6" /><circle cx="155" cy="72" r="6" /><circle cx="149" cy="79" r="5.5" /></g>
    </g>
  </svg>
}

// A dense string of jasmine buds, packed in angled pairs, with a gold knot
// at the centre. Used as the divider under headings.
export function Jasmine({ className, width = 220 }: { className?: string; width?: number }) {
  const mid = width / 2
  const buds: [number, number, number][] = []
  for (let x = 6; x < width - 4; x += 7) {
    if (Math.abs(x - mid) < 12) continue
    buds.push([x, 9, -34], [x + 3.5, 15, 34])
  }
  return <svg className={className} viewBox={`0 0 ${width} 24`} aria-hidden="true" focusable="false">
    <path d={`M2 12H${width - 2}`} stroke="var(--kk-thread)" strokeWidth="1.2" />
    {buds.map(([x, y, a], i) => <g key={i} transform={`translate(${x} ${y}) rotate(${a})`}>
      <ellipse rx="5" ry="2.5" fill="var(--kk-jasmine)" stroke="var(--kk-jasmine-edge)" strokeWidth=".7" />
      <ellipse cx="-1.6" rx="1.6" ry="1" fill="var(--kk-jasmine-edge)" opacity=".5" />
    </g>)}
    <circle cx={mid} cy="12" r="4.2" fill="var(--kk-gold)" />
    <circle cx={mid} cy="12" r="1.6" fill="var(--kk-gold-deep)" />
    <path d={`M${mid - 4} 15Q${mid - 7} 21 ${mid - 3} 23M${mid + 4} 15Q${mid + 7} 21 ${mid + 3} 23`} fill="none" stroke="var(--kk-gold)" strokeWidth="1.2" />
  </svg>
}

// Backwaters: a far bank of palms, still water with ripples, and a small
// thatched country boat that rocks gently.
export function Backwaters({ className }: { className?: string }) {
  const bank = [[24, .55], [60, .7], [96, .48], [262, .62], [300, .8], [336, .5]] as const
  return <svg className={className} viewBox="0 0 360 160" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMax slice">
    <rect width="360" height="96" fill="var(--kk-gold-light)" opacity=".2" />
    <circle cx="180" cy="96" r="34" fill="var(--kk-gold-light)" opacity=".45" />
    <path d="M0 92C40 86 80 88 120 90C170 92 220 86 260 88C300 90 330 86 360 88V160H0Z" fill="var(--kk-water)" />
    <path d="M0 92C40 86 80 88 120 90C170 92 220 86 260 88C300 90 330 86 360 88V96H0Z" fill="var(--kk-bank)" />
    {bank.map(([x, s], i) => <g key={i} transform={`translate(${x} 92) scale(${s})`}>
      <path d={`M0 0C2 -30 8 -60 ${i % 2 ? 18 : -14} -92`} stroke="var(--kk-bank)" strokeWidth="4" fill="none" />
      <g transform={`translate(${i % 2 ? 18 : -14} -92)`} stroke="var(--kk-bank)" strokeWidth="3" fill="none" strokeLinecap="round">
        <path d="M0 0Q-20 -8 -34 8M0 0Q-14 -16 -26 -14M0 0Q18 -12 32 4M0 0Q10 -18 24 -16M0 0Q-4 10 -10 26M0 0Q6 12 14 24" />
      </g>
    </g>)}
    <g className="kk-ripples" fill="none" stroke="var(--kk-ripple)" strokeWidth="1.4" strokeLinecap="round">
      <path d="M30 112H74M50 120H92M250 110H300M268 122H316M20 140H60M290 142H340" />
    </g>
    <g className="kk-boat">
      <path d="M110 120C140 132 220 132 252 120C246 112 240 108 236 104C206 112 156 112 124 104C120 108 114 114 110 120Z" fill="var(--kk-hull)" />
      <path d="M118 112C150 120 212 120 244 112" stroke="var(--kk-gold)" strokeWidth="1.6" fill="none" />
      <path d="M140 106C142 84 162 74 180 74C198 74 218 84 220 106C200 110 160 110 140 106Z" fill="var(--kk-thatch)" />
      <path d="M150 104C152 90 164 82 180 82C196 82 208 90 210 104" fill="none" stroke="var(--kk-thatch-line)" strokeWidth="1.2" />
      <path d="M160 106V86M180 108V78M200 106V86" stroke="var(--kk-thatch-line)" strokeWidth="1" opacity=".7" />
      <path d="M248 106L268 82" stroke="var(--kk-hull)" strokeWidth="2.4" strokeLinecap="round" />
    </g>
    <path d="M120 130C150 138 214 138 244 130" stroke="var(--kk-ripple)" strokeWidth="1.4" fill="none" opacity=".8" />
  </svg>
}

function Swastik() {
  return <svg viewBox="0 0 40 40" className="kk-symbol-glyph is-mark" aria-hidden="true">
    <g fill="none" stroke="currentColor" strokeWidth="4.2" strokeLinecap="square"><path d="M20 20V2H34M20 20H38V34M20 20V38H6M20 20H2V6" /></g>
    <g fill="currentColor"><circle cx="10" cy="10" r="2.4" /><circle cx="30" cy="10" r="2.4" /><circle cx="30" cy="30" r="2.4" /><circle cx="10" cy="30" r="2.4" /></g>
  </svg>
}

// A brass plate with a woven kasavu rim, holding one of the family's chosen
// symbols. The symbols themselves come from content.
export function SymbolPlate({ symbol, large }: { symbol: InvitationSymbol; large?: boolean }) {
  const label = { om: 'Om', shri: 'Shri', swastik: 'Swastik', kalash: 'Kalash' }[symbol]
  return <span className={'kk-symbol' + (large ? ' is-large' : '')} role="img" aria-label={label}>
    <svg className="kk-symbol-rim" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="48" fill="var(--kk-gold)" />
      <circle cx="50" cy="50" r="44" fill="none" stroke="var(--kk-gold-light)" strokeWidth="2.4" strokeDasharray="3 2.2" />
      <circle cx="50" cy="50" r="40" fill="var(--kk-card)" />
      <circle cx="50" cy="50" r="36" fill="none" stroke="var(--kk-gold)" strokeWidth=".8" />
    </svg>
    {symbol === 'om' && <span className="kk-symbol-glyph" lang="sa">ॐ</span>}
    {symbol === 'shri' && <span className="kk-symbol-glyph is-shri" lang="sa">श्री</span>}
    {symbol === 'swastik' && <Swastik />}
    {symbol === 'kalash' && <span className="kk-symbol-glyph is-art"><EventArt icon="kalash" /></span>}
  </span>
}

// A small lit oil lamp (deepam) used beside each function and the countdown.
export function Deepam({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 40 44" aria-hidden="true" focusable="false">
    <g transform="translate(20 23)"><Flame on glow={false} /></g>
    <path d="M4 24H36C34 32 28 36 20 36C12 36 6 32 4 24Z" fill="var(--kk-brass)" />
    <path d="M4 24H36" stroke="var(--kk-brass-light)" strokeWidth="1.6" />
    <path d="M15 36L13 41H27L25 36Z" fill="var(--kk-brass-deep)" />
  </svg>
}

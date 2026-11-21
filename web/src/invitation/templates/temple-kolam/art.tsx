// Artwork for Temple & Kolam, drawn in code and coloured through this
// template's custom properties (--tk-*), so one set of art serves every
// palette.
import { useId, useMemo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { InvitationSymbol } from '../../model'

const r2 = (n: number) => Math.round(n * 100) / 100

// ---------------------------------------------------------------------------
// Kolam. A sikku (line) kolam is one or more closed lines that weave between
// a grid of dots and loop around the outer dots. This builds one as a mirror
// curve: the line runs diagonally through the midpoints between dots, turns
// around a dot at the border, and bounces off "mirrors" placed between some
// dot pairs, which is what makes the petals and enclosed loops.
//
// Coordinates are doubled so every point is an integer: dot (x, y) sits at
// (2x, 2y) and the line passes through the points where a + b is odd.
// mirror(a, b) returns 0 for none, 1 for a wall along the dot pair, 2 for a
// wall across it. Mirrors on the outer edge are ignored.
// ---------------------------------------------------------------------------
export type Segment = { d: string; x: number; y: number }
export type KolamShape = { strands: Segment[][]; dots: [number, number][]; size: [number, number] }

export function buildKolam(cols: number, rows: number, gap: number, mirror: (a: number, b: number) => number = () => 0): KolamShape {
  const maxA = 2 * cols - 2, maxB = 2 * rows - 2
  const valid = (a: number, b: number) => a >= 0 && a <= maxA && b >= 0 && b <= maxB
  const inner = (a: number, b: number) => a > 0 && a < maxA && b > 0 && b < maxB
  const wall = (a: number, b: number) => inner(a, b) ? mirror(a, b) : 0
  const seen = new Set<string>()
  const key = (a: number, b: number, dx: number, dy: number) => a + ',' + b + ',' + dx * dy
  const f = (n: number) => r2(n * gap / 2)
  const strands: Segment[][] = []
  for (let b = 0; b <= maxB; b++) for (let a = 0; a <= maxA; a++) {
    if ((a + b) % 2 === 0 || wall(a, b)) continue
    for (const [dx0, dy0] of [[1, 1], [1, -1]]) {
      if (seen.has(key(a, b, dx0, dy0))) continue
      const segments: Segment[] = []
      let p = [a, b], d = [dx0, dy0], start = [a, b]
      for (let guard = 0; guard < 2000; guard++) {
        seen.add(key(p[0], p[1], d[0], d[1]))
        const c = [p[0] + d[0], p[1] + d[1]]
        const nd = [...d]
        let next: number[]
        let path: string
        if (valid(c[0], c[1])) {
          const m = wall(c[0], c[1])
          if (m) {
            if ((m === 1) === (c[0] % 2 === 1)) nd[1] = -nd[1]; else nd[0] = -nd[0]
            const end = [c[0] + nd[0] / 2, c[1] + nd[1] / 2]
            path = `M${f(start[0])} ${f(start[1])}L${f((p[0] + c[0]) / 2)} ${f((p[1] + c[1]) / 2)}Q${f(c[0])} ${f(c[1])} ${f(end[0])} ${f(end[1])}`
            segments.push({ d: path, x: f(start[0]), y: f(start[1]) })
            start = end
          } else {
            segments.push({ d: `M${f(start[0])} ${f(start[1])}L${f(c[0])} ${f(c[1])}`, x: f(start[0]), y: f(start[1]) })
            start = c
          }
          next = c
        } else {
          // Around a border dot (or twice around a corner dot).
          const xOut = c[0] < 0 || c[0] > maxA
          const q = p[0] % 2 ? [p[0] + d[0], p[1]] : [p[0], p[1] + d[1]]
          if (xOut) nd[0] = -nd[0]; else nd[1] = -nd[1]
          let off = xOut ? [0, nd[1]] : [nd[0], 0]
          next = [q[0] + off[0], q[1] + off[1]]
          let k = 1.9
          if (!valid(next[0], next[1])) {
            k = 2.7
            if (xOut) { nd[1] = -nd[1]; off = [nd[0], 0] } else { nd[0] = -nd[0]; off = [0, nd[1]] }
            next = [q[0] + off[0], q[1] + off[1]]
          }
          segments.push({
            d: `M${f(start[0])} ${f(start[1])}C${f(p[0] + d[0] * k)} ${f(p[1] + d[1] * k)} ${f(next[0] - nd[0] * k)} ${f(next[1] - nd[1] * k)} ${f(next[0])} ${f(next[1])}`,
            x: f(start[0]), y: f(start[1]),
          })
          start = next
        }
        p = next; d = nd
        if (p[0] === a && p[1] === b && seen.has(key(a, b, d[0], d[1]))) break
      }
      strands.push(segments)
    }
  }
  const dots: [number, number][] = []
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) dots.push([x * gap, y * gap])
  return { strands, dots, size: [(cols - 1) * gap, (rows - 1) * gap] }
}

const ringDistance = (a: number, b: number, centre: number) => Math.abs(a - centre) + Math.abs(b - centre)
// Named designs. Each keeps the centre dot open (for the lamp) and is
// symmetric in both axes, like a hand-drawn kolam.
export const kolamDesigns = {
  // 7 × 7: petals around the centre and a ring of loops further out.
  lamp: () => buildKolam(7, 7, 30, (a, b) => [1, 5].includes(ringDistance(a, b, 6)) ? 2 : 0),
  // 5 × 5: a small four-petal flower.
  flower: () => buildKolam(5, 5, 26, (a, b) => ringDistance(a, b, 4) === 1 ? 2 : 0),
  // 3 × 3: a single knot for small tiles.
  knot: () => buildKolam(3, 3, 22, (a, b) => ringDistance(a, b, 2) === 1 ? 2 : 0),
}

// Draws a kolam. Each strand is split into short segments that grow from
// their starting point one after another, so the kolam draws itself using
// only transform and opacity. --seg sets each segment's delay.
export function Kolam({ shape, className, pad = 26, duration = 1.6, label }: {
  shape: KolamShape; className?: string; pad?: number; duration?: number; label?: string
}) {
  const [w, h] = shape.size
  return <svg className={'tk-kolam ' + (className ?? '')} viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`}
    role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
    <g className="tk-kolam-dots">
      {shape.dots.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.7" style={{ '--dot': ((i * 37) % shape.dots.length) / shape.dots.length } as CSSProperties} />)}
    </g>
    <g className="tk-kolam-lines" fill="none">
      {shape.strands.map((strand, s) => strand.map((segment, i) => <path key={s + '-' + i} d={segment.d}
        style={{ transformOrigin: `${segment.x}px ${segment.y}px`, '--seg': r2(s * 0.05 + (i / strand.length) * duration) + 's' } as CSSProperties} />))}
    </g>
  </svg>
}
export function useKolam(name: keyof typeof kolamDesigns) {
  return useMemo(() => kolamDesigns[name](), [name])
}

// ---------------------------------------------------------------------------
// Brass: the standing lamp, temple bells and the plate for the symbols.
// ---------------------------------------------------------------------------
function BrassDefs({ id }: { id: string }) {
  return <defs>
    <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stopColor="var(--tk-brass-deep)" /><stop offset=".32" stopColor="var(--tk-brass-light)" />
      <stop offset=".55" stopColor="var(--tk-brass)" /><stop offset="1" stopColor="var(--tk-brass-deep)" />
    </linearGradient>
  </defs>
}

// A tall South Indian standing lamp with a five-spouted oil bowl. The flames
// are separate so they can light one by one.
export function Lamp({ className }: { className?: string }) {
  const id = useId()
  const brass = `url(#${id})`
  const flame = id + 'f'
  const spouts = [14, 37, 60, 83, 106]
  return <svg className={'tk-lamp ' + (className ?? '')} viewBox="0 0 120 262" aria-hidden="true" focusable="false">
    <BrassDefs id={id} />
    <defs>
      <radialGradient id={flame} cx="50%" cy="72%" r="70%">
        <stop offset="0" stopColor="#fffbe6" /><stop offset=".35" stopColor="#ffe07a" /><stop offset=".75" stopColor="#ff9a2e" /><stop offset="1" stopColor="#e2541c" />
      </radialGradient>
    </defs>
    <g fill={brass} stroke="var(--tk-brass-deep)" strokeWidth=".8">
      {/* finial: a lotus bud on a short spire */}
      <path d="M60 3C64 9 66 15 60 22C54 15 56 9 60 3Z" />
      <ellipse cx="60" cy="26" rx="7" ry="4" />
      <path d="M57 29H63L62 46H58Z" />
      <ellipse cx="60" cy="47" rx="9" ry="3.4" />
      {/* the oil bowl and its five spouts */}
      <path d="M12 60C12 60 30 58 60 58C90 58 108 60 108 60C104 76 86 84 60 84C34 84 16 76 12 60Z" />
      {spouts.map((x, i) => <path key={x} d={`M${x - 6} ${61 - (i % 4 ? 0 : 1)}Q${x} ${50 + (i === 2 ? 0 : 2)} ${x + 6} ${61 - (i % 4 ? 0 : 1)}Z`} />)}
      <path d="M58 46H62V58H58Z" />
      {/* stem with turned knots */}
      <path d="M56 84H64L63 96H57Z" />
      <ellipse cx="60" cy="100" rx="11" ry="6.5" />
      <path d="M56.5 106H63.5L62.5 160H57.5Z" />
      <ellipse cx="60" cy="128" rx="7" ry="3" />
      <ellipse cx="60" cy="168" rx="15" ry="10" />
      <path d="M55 176H65L64 198H56Z" />
      <ellipse cx="60" cy="186" rx="6.5" ry="2.6" />
      {/* stepped round foot */}
      <ellipse cx="60" cy="202" rx="20" ry="5" />
      <path d="M40 202Q60 212 80 202L86 216H34Z" />
      <ellipse cx="60" cy="217" rx="30" ry="6" />
      <path d="M30 217Q60 230 90 217L100 238H20Z" />
      <ellipse cx="60" cy="240" rx="46" ry="9" />
      <path d="M14 240Q60 262 106 240V246Q60 268 14 246Z" />
    </g>
    <g fill="none" stroke="var(--tk-brass-light)" strokeWidth="1" opacity=".7" strokeLinecap="round">
      <path d="M22 66Q60 76 98 66" /><path d="M24 224Q60 234 96 224" /><path d="M47 168Q60 174 73 168" />
    </g>
    <g className="tk-flames">
      {spouts.map((x, i) => <g key={x} className="tk-flame" style={{ '--f': i, transformOrigin: `${x}px ${53 + (i === 2 ? -2 : 0)}px` } as CSSProperties}>
        <path d={`M${x} ${30 + (i === 2 ? -2 : 0)}C${x + 6} ${41} ${x + 6} ${49} ${x} ${53 + (i === 2 ? -2 : 0)}C${x - 6} ${49} ${x - 6} ${41} ${x} ${30 + (i === 2 ? -2 : 0)}Z`} fill={`url(#${flame})`} />
        <ellipse cx={x} cy={47} rx="1.6" ry="3.2" fill="#fff8de" />
      </g>)}
    </g>
  </svg>
}

export function Bell({ className, style }: { className?: string; style?: CSSProperties }) {
  const id = useId()
  return <svg className={'tk-bell ' + (className ?? '')} style={style} viewBox="0 0 40 84" aria-hidden="true" focusable="false">
    <BrassDefs id={id} />
    <g fill="none" stroke="var(--tk-brass-deep)" strokeWidth="1.6">
      {[0, 7, 14, 21].map(y => <ellipse key={y} cx="20" cy={y + 3.5} rx="2.3" ry="3.4" />)}
    </g>
    <g fill={`url(#${id})`} stroke="var(--tk-brass-deep)" strokeWidth=".8">
      <circle cx="20" cy="30" r="3.4" />
      <path d="M20 33C11 33 9 44 8.5 56C8 64 5 67 3 70H37C35 67 32 64 31.5 56C31 44 29 33 20 33Z" />
      <ellipse cx="20" cy="70" rx="17" ry="3.2" />
      <circle cx="20" cy="77" r="3.6" />
    </g>
    <g fill="none" stroke="var(--tk-brass-light)" strokeWidth="1" opacity=".75">
      <path d="M11 46Q20 49 29 46" /><path d="M9.5 58Q20 61.5 30.5 58" />
    </g>
  </svg>
}

const glyphs: Record<InvitationSymbol, ReactNode> = {
  om: <text x="50" y="64" textAnchor="middle" className="tk-glyph">ॐ</text>,
  shri: <text x="50" y="61" textAnchor="middle" className="tk-glyph is-shri">श्री</text>,
  swastik: <g transform="translate(31 31)" fill="none" stroke="var(--tk-glyph)" strokeWidth="4" strokeLinecap="square">
    <path d="M19 19V2H32M19 19H36V32M19 19V36H6M19 19H2V6" />
    <g fill="var(--tk-glyph)" stroke="none"><circle cx="10" cy="10" r="2.4" /><circle cx="28" cy="10" r="2.4" /><circle cx="28" cy="28" r="2.4" /><circle cx="10" cy="28" r="2.4" /></g>
  </g>,
  kalash: <g fill="none" stroke="var(--tk-glyph)" strokeWidth="2.2" strokeLinejoin="round">
    <ellipse cx="50" cy="31" rx="5.5" ry="6.5" fill="var(--tk-glyph)" fillOpacity=".25" />
    <path d="M42 39C35 36 31 37 29 41C34 42 38 41 42 39ZM58 39C65 36 69 37 71 41C66 42 62 41 58 39Z" />
    <path d="M41 38H59V43H41Z" />
    <path d="M41 43C33 51 35 65 50 65C65 65 67 51 59 43Z" fill="var(--tk-glyph)" fillOpacity=".18" />
    <path d="M38 53Q50 58 62 53" />
  </g>,
}

// A round brass plate with a rim of kolam petals, carrying one symbol.
export function SymbolPlate({ symbol, large }: { symbol: InvitationSymbol; large?: boolean }) {
  const id = useId()
  return <svg className={'tk-plate' + (large ? ' is-large' : '')} viewBox="0 0 100 100" role="img" aria-label={symbol}>
    <defs>
      <radialGradient id={id} cx="38%" cy="32%" r="78%">
        <stop offset="0" stopColor="var(--tk-brass-light)" /><stop offset=".6" stopColor="var(--tk-brass)" /><stop offset="1" stopColor="var(--tk-brass-deep)" />
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="47" fill={`url(#${id})`} />
    <circle cx="50" cy="50" r="38" fill="var(--tk-plate-face)" />
    <g fill="none" stroke="var(--tk-plate-line)" strokeWidth="1.3">
      {Array.from({ length: 16 }, (_, i) => <path key={i} d="M50 13.5Q54 9.5 50 5.5Q46 9.5 50 13.5Z" transform={`rotate(${i * 22.5} 50 50)`} />)}
    </g>
    <g fill="var(--tk-plate-face)">{Array.from({ length: 16 }, (_, i) => <circle key={i} cx="50" cy="3.6" r="1.1" transform={`rotate(${i * 22.5 + 11.25} 50 50)`} />)}</g>
    {glyphs[symbol]}
  </svg>
}

// ---------------------------------------------------------------------------
// Temple architecture: the gopuram for the hero and carved pillars.
// ---------------------------------------------------------------------------
export function Gopuram({ className }: { className?: string }) {
  const tiers = Array.from({ length: 5 }, (_, i) => {
    const left = 70 + i * 15, right = 250 - i * 15, bottom = 214 - i * 30, top = bottom - 30
    return { i, left, right, bottom, top }
  })
  return <svg className={'tk-gopuram ' + (className ?? '')} viewBox="0 0 320 262" aria-hidden="true" focusable="false">
    {/* base with the great doorway */}
    <path d="M58 214H262V262H58Z" fill="var(--tk-gopuram)" />
    <path d="M58 214H262V219H58Z" fill="var(--tk-gopuram-deep)" />
    <path d="M140 262V236Q160 214 180 236V262Z" fill="var(--tk-gopuram-deep)" />
    <path d="M146 262V238Q160 222 174 238V262" fill="none" stroke="var(--tk-gopuram-line)" strokeWidth="1.2" />
    {[74, 98, 222, 246].map(x => <path key={x} d={`M${x - 7} 254V236Q${x} 228 ${x + 7} 236V254Z`} fill="var(--tk-gopuram-deep)" />)}
    <path d="M58 248H140M180 248H262" stroke="var(--tk-gopuram-line)" strokeWidth="1" opacity=".7" />
    {tiers.map(({ i, left, right, bottom, top }) => {
      const width = right - left, niches = Math.max(3, 9 - i * 1.6 | 0)
      const step = width / (niches + 1)
      return <g key={i}>
        <path d={`M${left} ${bottom}L${left + 4} ${top + 6}H${right - 4}L${right} ${bottom}Z`} fill="var(--tk-gopuram)" />
        <path d={`M${left - 3} ${top + 7}H${right + 3}L${right - 2} ${top}H${left + 2}Z`} fill="var(--tk-gopuram-deep)" />
        <path d={`M${left + 3} ${top + 9}H${right - 3}`} stroke="var(--tk-gopuram-line)" strokeWidth="1" opacity=".8" />
        {Array.from({ length: niches }, (_, n) => {
          const x = left + step * (n + 1)
          const tall = n === (niches - 1) / 2
          return <path key={n} d={`M${r2(x - 4)} ${bottom - 3}V${top + 17}Q${r2(x)} ${top + (tall ? 10 : 12)} ${r2(x + 4)} ${top + 17}V${bottom - 3}Z`}
            fill="var(--tk-gopuram-deep)" stroke="var(--tk-gopuram-line)" strokeWidth=".7" />
        })}
        {/* little kudu arches along the cornice */}
        {Array.from({ length: niches + 1 }, (_, n) => <circle key={'k' + n} cx={r2(left + step * (n + 0.5))} cy={top + 3} r="2" fill="var(--tk-gopuram-line)" opacity=".85" />)}
      </g>
    })}
    {/* barrel-vault crown with horseshoe gables and five pot finials */}
    <path d="M122 64H198V58Q198 36 178 36H142Q122 36 122 58Z" fill="var(--tk-gopuram)" />
    <path d="M122 62Q113 48 126 40Q134 48 130 62Z M198 62Q207 48 194 40Q186 48 190 62Z" fill="var(--tk-gopuram-deep)" />
    <path d="M132 52Q160 42 188 52" fill="none" stroke="var(--tk-gopuram-line)" strokeWidth="1.1" />
    <path d="M150 64V52Q160 42 170 52V64Z" fill="var(--tk-gopuram-deep)" stroke="var(--tk-gopuram-line)" strokeWidth=".8" />
    {[134, 147, 160, 173, 186].map(x => <g key={x} fill="var(--tk-kalasam)">
      <path d={`M${x - 4.5} 36Q${x - 6.5} 28 ${x} 26Q${x + 6.5} 28 ${x + 4.5} 36Z`} />
      <path d={`M${x - 2} 26L${x} 14L${x + 2} 26Z`} />
      <circle cx={x} cy="13" r="1.6" />
    </g>)}
  </svg>
}

// A carved mandapam pillar in three parts so it can stand any height: a
// corbelled capital, a banded shaft (drawn in CSS) and a stepped base.
export function Pillar({ className }: { className?: string }) {
  return <div className={'tk-pillar ' + (className ?? '')} aria-hidden="true">
    <svg className="tk-pillar-top" viewBox="0 0 60 64" focusable="false">
      <g fill="var(--tk-stone-2)" stroke="var(--tk-stone-edge)" strokeWidth="1.2">
        <path d="M1 1H59V12H1Z" />
        <path d="M6 12H54L49 24H11Z" />
        <path d="M12 24H48L44 34Q30 46 16 34Z" />
        <path d="M18 40H42L40 52H20Z" />
        <path d="M14 52H46V64H14Z" />
      </g>
      <circle cx="30" cy="34" r="2.6" fill="var(--tk-accent)" opacity=".7" />
    </svg>
    <span className="tk-pillar-shaft" />
    <svg className="tk-pillar-foot" viewBox="0 0 60 40" focusable="false">
      <g fill="var(--tk-stone-2)" stroke="var(--tk-stone-edge)" strokeWidth="1.2">
        <path d="M14 0H46V12H14Z" /><path d="M8 12H52V24H8Z" /><path d="M2 24H58V40H2Z" />
      </g>
      <path d="M8 31H52" stroke="var(--tk-stone-edge)" strokeWidth="1" />
    </svg>
  </div>
}

// ---------------------------------------------------------------------------
// Leaves and flowers: banana leaves, jasmine strings, banana plants.
// ---------------------------------------------------------------------------
export function BananaLeaf({ className }: { className?: string }) {
  const id = useId()
  const veins = Array.from({ length: 22 }, (_, i) => 24 + i * 9)
  return <svg className={'tk-leaf ' + (className ?? '')} viewBox="0 0 260 46" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="var(--tk-leaf-light)" /><stop offset=".5" stopColor="var(--tk-leaf)" /><stop offset="1" stopColor="var(--tk-leaf-deep)" />
      </linearGradient>
    </defs>
    <path d="M14 23C40 6 150 2 250 17C252 20 252 26 250 29C150 42 40 40 14 23Z" fill={`url(#${id})`} />
    <path d="M2 23H250" stroke="var(--tk-leaf-deep)" strokeWidth="2" strokeLinecap="round" />
    <g stroke="var(--tk-leaf-vein)" strokeWidth=".8" opacity=".55">
      {veins.map(x => <path key={x} d={`M${x} 22L${x + 9} ${8 + Math.abs(x - 140) / 26}M${x} 24L${x + 9} ${38 - Math.abs(x - 140) / 26}`} />)}
    </g>
  </svg>
}

// A string of jasmine buds with a few orange crossandra flowers, draped as a
// swag between two points.
export function JasmineSwag({ className, sag = 26 }: { className?: string; sag?: number }) {
  const count = 25
  const at = (t: number) => {
    const u = 1 - t
    return [u * u * 4 + 2 * u * t * 150 + t * t * 296, u * u * 4 + 2 * u * t * (4 + sag * 2) + t * t * 4]
  }
  return <svg className={'tk-swag ' + (className ?? '')} viewBox={`-6 -6 312 ${sag * 1.05 + 22}`} aria-hidden="true" focusable="false">
    <path d={`M4 4Q150 ${4 + sag * 2} 296 4`} fill="none" stroke="var(--tk-leaf-deep)" strokeWidth="1.2" />
    {Array.from({ length: count }, (_, i) => {
      const t = (i + 0.5) / count, [x, y] = at(t), [x2, y2] = at(t + 0.01)
      const angle = Math.atan2(y2 - y, x2 - x) * 180 / Math.PI
      const orange = i % 6 === 3
      return <g key={i} transform={`translate(${r2(x)} ${r2(y)}) rotate(${r2(angle + 90)})`}>
        {orange ? <>
          <circle r="5" fill="var(--tk-crossandra)" /><circle r="1.9" fill="var(--tk-crossandra-core)" />
        </> : <>
          <ellipse cx="-3.2" cy="1" rx="2.9" ry="5" fill="var(--tk-jasmine)" stroke="var(--tk-jasmine-shade)" strokeWidth="1" transform="rotate(-20)" />
          <ellipse cx="3.2" cy="1" rx="2.9" ry="5" fill="var(--tk-jasmine)" stroke="var(--tk-jasmine-shade)" strokeWidth="1" transform="rotate(20)" />
          <circle cy="-4" r="1.3" fill="var(--tk-leaf)" />
        </>}
      </g>
    })}
  </svg>
}

// One hanging strand of jasmine for the opening.
export function JasmineStrand({ className, style, length = 14 }: { className?: string; style?: CSSProperties; length?: number }) {
  const height = length * 11 + 14
  return <svg className={'tk-strand ' + (className ?? '')} style={style} viewBox={`0 0 16 ${height}`} aria-hidden="true" focusable="false">
    <path d={`M8 0V${height - 10}`} stroke="var(--tk-strand-thread)" strokeWidth=".8" />
    {Array.from({ length }, (_, i) => {
      const y = 8 + i * 11
      if (i % 5 === 2) return <g key={i}><circle cx="8" cy={y} r="4.2" fill="var(--tk-crossandra)" /><circle cx="8" cy={y} r="1.5" fill="var(--tk-crossandra-core)" /></g>
      return <g key={i}>
        <ellipse cx="5.6" cy={y} rx="2.4" ry="4" fill="var(--tk-jasmine)" stroke="var(--tk-strand-edge)" strokeWidth=".8" transform={`rotate(-20 5.6 ${y})`} />
        <ellipse cx="10.4" cy={y} rx="2.4" ry="4" fill="var(--tk-jasmine)" stroke="var(--tk-strand-edge)" strokeWidth=".8" transform={`rotate(20 10.4 ${y})`} />
      </g>
    })}
    <path d={`M8 ${height - 10}L5 ${height - 2}M8 ${height - 10}L11 ${height - 2}`} stroke="var(--tk-strand-thread)" strokeWidth=".8" />
  </svg>
}

// A young banana plant, tied at wedding entrances in the South.
export function BananaPlant({ className }: { className?: string }) {
  const id = useId()
  return <svg className={'tk-plant ' + (className ?? '')} viewBox="0 0 150 240" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={id} x1="0" x2="1">
        <stop offset="0" stopColor="var(--tk-leaf-deep)" /><stop offset=".5" stopColor="var(--tk-leaf)" /><stop offset="1" stopColor="var(--tk-leaf-light)" />
      </linearGradient>
    </defs>
    <path d="M66 240L68 96H82L84 240Z" fill="var(--tk-trunk)" />
    <path d="M70 120V236M76 110V238" stroke="var(--tk-leaf-deep)" strokeWidth="1" opacity=".4" />
    <g fill={`url(#${id})`} stroke="var(--tk-leaf-deep)" strokeWidth=".8">
      <path d="M75 100C62 60 40 28 20 14C30 40 52 74 74 106Z" />
      <path d="M75 100C88 60 110 28 132 16C120 42 98 74 76 106Z" />
      <path d="M75 104C50 66 16 62 0 90C10 84 20 82 28 86C40 88 58 96 75 112Z" />
      <path d="M75 104C100 66 134 62 150 90C140 84 130 82 122 86C110 88 92 96 75 112Z" />
      <path d="M75 98C69 62 71 28 80 2C89 28 87 64 77 100Z" />
    </g>
    <g fill="none" stroke="var(--tk-leaf-vein)" strokeWidth=".9" opacity=".6">
      <path d="M75 104C58 78 38 66 18 20" /><path d="M75 104C92 78 112 66 128 22" /><path d="M75 108C52 84 24 76 4 88" />
      <path d="M75 108C98 84 126 76 146 88" /><path d="M76 98C74 60 76 30 80 6" />
    </g>
    <path d="M82 118C96 120 104 132 102 146" fill="none" stroke="var(--tk-trunk)" strokeWidth="3" />
    <g fill="var(--tk-banana)" stroke="var(--tk-leaf-deep)" strokeWidth=".6">
      {[[94, 126], [101, 128], [108, 131], [96, 135], [103, 137], [110, 140]].map(([x, y], i) => <path key={i} d={`M${x} ${y}c-2 -6 1 -12 7 -15c-3 5 -3 10 -2 15z`} />)}
    </g>
    <path d="M100 148C96 156 98 166 103 170C108 164 108 154 100 148Z" fill="var(--tk-banana-bud)" />
  </svg>
}

// The small rotated tile that holds each countdown number: a diamond with
// looped corners and pulli dots.
export function KnotTile({ className }: { className?: string }) {
  return <svg className={'tk-tile ' + (className ?? '')} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <path d="M50 8L92 50L50 92L8 50Z" fill="var(--tk-tile)" stroke="var(--tk-accent)" strokeWidth="1.6" />
    <g fill="none" stroke="var(--tk-accent)" strokeWidth="1.6" strokeLinecap="round">
      <path d="M44 14C46 4 54 4 56 14" /><path d="M44 86C46 96 54 96 56 86" />
      <path d="M14 44C4 46 4 54 14 56" /><path d="M86 44C96 46 96 54 86 56" />
    </g>
    <g fill="var(--tk-turmeric)">{[[50, 4], [50, 96], [4, 50], [96, 50]].map(([x, y]) => <circle key={x + '-' + y} cx={x} cy={y} r="2.4" />)}</g>
  </svg>
}

// Haveli Jharokha artwork. Everything is drawn from geometry in SVG and
// coloured through the template's CSS custom properties, so one set of art
// serves every palette.
import { useId, useMemo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { InvitationSymbol } from '../../model'

type Point = [number, number]
const f = (n: number) => Math.round(n * 100) / 100

// ---------------------------------------------------------------------------
// The cusped (multifoil) arch. A pointed base curve is divided into equal
// lobes; each lobe is a small arc bulging outward. Units are pixels, so the
// arch lines up exactly with the CSS borders of the window below it.
// ---------------------------------------------------------------------------
type Lobe = { from: Point; to: Point; c: Point; r: number }
export type ArchShape = { w: number; h: number; base: number; lobes: Lobe[]; outer: string; fill: string; inner: string; top: number }

// The body's top border is 1.5px (centre 0.75px below its edge) and its inner
// line sits 7–8px below the edge. The SVG reaches DEPTH px into the body.
const DEPTH = 10
const ST = 7
const GAP = 6.75

function circleCircle(c1: Point, r1: number, c2: Point, r2: number): Point[] {
  const dx = c2[0] - c1[0], dy = c2[1] - c1[1], d = Math.hypot(dx, dy)
  if (d === 0 || d > r1 + r2 || d < Math.abs(r1 - r2)) return []
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r1 * r1 - a * a))
  const mx = c1[0] + (a * dx) / d, my = c1[1] + (a * dy) / d
  return [[mx + (h * dy) / d, my - (h * dx) / d], [mx - (h * dy) / d, my + (h * dx) / d]]
}

export function archShape(w: number, ratio = 0.34, count = 9): ArchShape {
  // Base curve in local coordinates, spring line at y = 0, rising to negative y.
  const cx = w * 0.64, R = cx, end = Math.acos((w / 2 - cx) / R)
  const raw = R * Math.sin(end), k = (w * ratio) / raw
  const half: Point[] = Array.from({ length: 61 }, (_, i) => {
    const t = Math.PI - (i / 60) * (Math.PI - end)
    return [cx + R * Math.cos(t), -k * R * Math.sin(t)]
  })
  const curve = [...half, ...half.slice(0, -1).reverse().map(([x, y]) => [w - x, y] as Point)]
  const lengths = [0]
  for (let i = 1; i < curve.length; i++) lengths.push(lengths[i - 1] + Math.hypot(curve[i][0] - curve[i - 1][0], curve[i][1] - curve[i - 1][1]))
  const total = lengths[lengths.length - 1]
  const at = (s: number): Point => {
    const i = Math.max(1, lengths.findIndex(l => l >= s))
    const t = (s - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1)
    return [curve[i - 1][0] + (curve[i][0] - curve[i - 1][0]) * t, curve[i - 1][1] + (curve[i][1] - curve[i - 1][1]) * t]
  }
  const points = Array.from({ length: count + 1 }, (_, i) => i === count ? [w, 0] as Point : at((i / count) * total))
  const lobesLocal: Lobe[] = points.slice(0, -1).map((from, i) => {
    const to = points[i + 1], dx = to[0] - from[0], dy = to[1] - from[1], c = Math.hypot(dx, dy)
    const r = (c / 2) * 1.12, d = Math.sqrt(r * r - (c / 2) ** 2)
    const n: Point = [-dy / c, dx / c]
    return { from, to, r, c: [(from[0] + to[0]) / 2 + n[0] * d, (from[1] + to[1]) / 2 + n[1] * d] }
  })
  const top = Math.min(...lobesLocal.map(l => l.c[1] - l.r))
  const base = f(-top + 2 + ST) // body top edge in SVG coordinates; the arch springs ST px above it
  const y = (v: number) => v + base + 0.75 - ST
  const lobes = lobesLocal.map(l => ({ from: [l.from[0], y(l.from[1])] as Point, to: [l.to[0], y(l.to[1])] as Point, c: [l.c[0], y(l.c[1])] as Point, r: l.r }))
  const outer = `M0 ${f(base + 0.75)}V${f(base + 0.75 - ST)}` + lobes.map(l => `A${f(l.r)} ${f(l.r)} 0 0 1 ${f(l.to[0])} ${f(l.to[1])}`).join('') + `V${f(base + 0.75)}`
  const fill = outer + `V${base + DEPTH}H0Z`
  // Inner line: concentric circles, joined at their cusps.
  const g = GAP, yi = base + 7.5
  const first = lobes[0], ri0 = first.r - g
  const sy = first.c[1] + Math.sqrt(Math.max(0, ri0 * ri0 - (g - first.c[0]) ** 2))
  let inner = `M0 ${yi}H${g}V${f(Math.min(yi, sy))}`
  lobes.forEach((l, i) => {
    let to: Point
    if (i === lobes.length - 1) {
      const ry = l.c[1] + Math.sqrt(Math.max(0, (l.r - g) ** 2 - (w - g - l.c[0]) ** 2))
      to = [w - g, Math.min(yi, ry)]
    } else {
      const next = lobes[i + 1]
      const hits = circleCircle(l.c, l.r - g, next.c, next.r - g)
      to = hits.sort((a, b) => Math.hypot(a[0] - l.to[0], a[1] - l.to[1]) - Math.hypot(b[0] - l.to[0], b[1] - l.to[1]))[0] ?? l.to
    }
    inner += `A${f(l.r - g)} ${f(l.r - g)} 0 0 1 ${f(to[0])} ${f(to[1])}`
  })
  inner += `V${yi}H${w}`
  return { w, h: f(base + DEPTH), base, lobes, outer, fill, inner, top: 2 }
}

const shapes = new Map<string, ArchShape>()
export function useArch(w: number, ratio?: number) {
  const key = w + ':' + (ratio ?? '')
  return useMemo(() => {
    if (!shapes.has(key)) shapes.set(key, archShape(w, ratio))
    return shapes.get(key)!
  }, [key, w, ratio])
}

// The crown of a window: the cusped arch above a card, with a carved rosette.
export function ArchCrown({ width, ratio, rosette = true }: { width: number; ratio?: number; rosette?: boolean }) {
  const shape = useArch(width, ratio)
  const cy = shape.base * 0.56, rr = Math.min(shape.base * 0.26, 22)
  return <svg className="hj-crown" width={shape.w} height={shape.h} viewBox={`0 0 ${shape.w} ${shape.h}`} aria-hidden="true" focusable="false"
    style={{ '--crown-h': shape.h + 'px' } as CSSProperties}>
    <path className="hj-crown-fill" d={shape.fill} />
    <path className="hj-crown-outer" d={shape.outer} />
    <path className="hj-crown-inner" d={shape.inner} />
    {rosette && <g className="hj-crown-rosette" transform={`translate(${shape.w / 2} ${f(cy)})`}>
      {Array.from({ length: 12 }, (_, i) => <path key={i} d={`M0 ${-rr * 0.3}C${rr * 0.22} ${-rr * 0.55} ${rr * 0.18} ${-rr * 0.9} 0 ${-rr}C${-rr * 0.18} ${-rr * 0.9} ${-rr * 0.22} ${-rr * 0.55} 0 ${-rr * 0.3}Z`}
        transform={`rotate(${i * 30})`} />)}
      <circle r={rr * 0.26} className="hj-crown-eye" />
    </g>}
  </svg>
}

// ---------------------------------------------------------------------------
// Jali: an eight-point star lattice used for shutters and drifting shadows.
// ---------------------------------------------------------------------------
function star(cx: number, cy: number, r: number) {
  const pts: string[] = []
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2, rad = i % 2 ? r * 0.62 : r
    pts.push(f(cx + Math.cos(a) * rad) + ' ' + f(cy + Math.sin(a) * rad))
  }
  return 'M' + pts.join('L') + 'Z'
}

export function JaliPattern({ id, size = 24, stroke = 'var(--hj-jali-shadow)', width = 3 }: { id: string; size?: number; stroke?: string; width?: number }) {
  const s = size, h = s / 2
  return <pattern id={id} width={s} height={s} patternUnits="userSpaceOnUse">
    <g fill="none" stroke={stroke} strokeWidth={width} strokeLinejoin="round">
      <path d={star(h, h, h * 0.86)} />
      <path d={`M0 0L${s * 0.16} ${s * 0.16}M${s} 0L${s * 0.84} ${s * 0.16}M0 ${s}L${s * 0.16} ${s * 0.84}M${s} ${s}L${s * 0.84} ${s * 0.84}`} />
      <path d={`M${h} 0V${s * 0.07}M${h} ${s}V${s * 0.93}M0 ${h}H${s * 0.07}M${s} ${h}H${s * 0.93}`} />
    </g>
  </pattern>
}

// A soft lattice shadow laid over a card. The pattern lives once in the page.
export function JaliShade({ pattern }: { pattern: string }) {
  return <span className="hj-shade" aria-hidden="true">
    <svg width="100%" height="100%"><rect width="100%" height="100%" fill={`url(#${pattern})`} /></svg>
  </span>
}

// ---------------------------------------------------------------------------
// The jharokha: a projecting balcony window with a curved bangla roof, carved
// pillars, a cusped arch, two jali shutters and a bracketed ledge.
// ---------------------------------------------------------------------------
const FW = 300, OX = 34, OW = 232, OT = 18, OH = 300, FH = OT + OH + 14

function shutterPath(shape: ArchShape) {
  // Left half of the opening: the arch's left lobes, then half of the apex lobe.
  const lobes = shape.lobes, mid = Math.floor(lobes.length / 2)
  let d = `M0 ${OH}V${f(shape.base + 0.75 - ST)}`
  for (let i = 0; i < mid; i++) d += `A${f(lobes[i].r)} ${f(lobes[i].r)} 0 0 1 ${f(lobes[i].to[0])} ${f(lobes[i].to[1])}`
  const apex = lobes[mid]
  d += `A${f(apex.r)} ${f(apex.r)} 0 0 1 ${OW / 2} ${f(apex.c[1] - apex.r)}V${OH}Z`
  return d
}

function Shutter({ side, shape, ids }: { side: 'l' | 'r'; shape: ArchShape; ids: { jali: string; glow: string; wood: string } }) {
  const clip = useId()
  const d = shutterPath(shape)
  const rail = OH * 0.6
  return <span className={'hj-shutter is-' + side}>
    <svg viewBox={`0 0 ${OW / 2} ${OH}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs><clipPath id={clip}><path d={d} /></clipPath></defs>
      <g clipPath={`url(#${clip})`}>
        <rect width={OW / 2} height={OH} fill={`url(#${ids.wood})`} />
        <rect width={OW / 2} height={rail} fill={`url(#${ids.glow})`} className="hj-shutter-glow" />
        <rect width={OW / 2} height={rail} fill={`url(#${ids.jali})`} />
        <path d={d} fill="none" stroke={`url(#${ids.wood})`} strokeWidth="20" />
        <path d={d} fill="none" className="hj-shutter-bead" strokeWidth="23" />
        <path d={d} fill="none" stroke={`url(#${ids.wood})`} strokeWidth="21" />
        <rect y={rail - 5} width={OW / 2} height="12" className="hj-shutter-rail" />
        <rect x="16" y={rail + 18} width={OW / 2 - 32} height={OH - rail - 36} rx="3" className="hj-shutter-panel" />
        <rect x="23" y={rail + 25} width={OW / 2 - 46} height={OH - rail - 50} rx="2" className="hj-shutter-panel-in" />
        <g transform={`translate(${OW / 4} ${rail + (OH - rail) / 2})`} className="hj-shutter-rose">
          {Array.from({ length: 8 }, (_, i) => <ellipse key={i} rx="4.2" ry="10" cy="-10" transform={`rotate(${i * 45})`} />)}
          <circle r="5" className="hj-brass" />
        </g>
        {[rail + 18, OH - 18].flatMap(y => [16, OW / 2 - 16].map(x => <circle key={x + ':' + y} cx={x} cy={y} r="2.6" className="hj-brass" />))}
      </g>
      <g transform={`translate(${OW / 2 - 15} ${rail + 2})`}>
        <circle r="7" fill="none" className="hj-brass-ring" strokeWidth="2.6" />
        <circle cy="-8" r="2.8" className="hj-brass" />
      </g>
    </svg>
  </span>
}

function Roof() {
  const id = useId()
  return <svg className="hj-roof" viewBox="0 0 320 128" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={id + 'd'} x1="0" x2="1"><stop offset="0" stopColor="var(--hj-stone-3)" /><stop offset=".55" stopColor="var(--hj-stone)" /><stop offset="1" stopColor="var(--hj-stone-2)" /></linearGradient>
      <linearGradient id={id + 'e'} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--hj-stone-3)" /><stop offset="1" stopColor="var(--hj-stone-2)" /></linearGradient>
    </defs>
    {/* dome and finial */}
    <path d="M160 6V20" className="hj-gold-line" strokeWidth="2" />
    <circle cx="160" cy="7" r="3" className="hj-brass" /><ellipse cx="160" cy="15" rx="4" ry="3" className="hj-brass" /><ellipse cx="160" cy="22" rx="6" ry="3" className="hj-brass" />
    <path d="M122 70C120 46 140 34 160 24C180 34 200 46 198 70Z" fill={`url(#${id}d)`} />
    <path d="M160 24C150 38 146 54 147 70M160 24C170 38 174 54 173 70M160 24V70" className="hj-roof-rib" />
    {Array.from({ length: 9 }, (_, i) => <path key={i} d="M0 0C3-6 3-11 0-14C-3-11-3-6 0 0Z" transform={`translate(${126 + i * 8.5} 72)`} className="hj-roof-petal" />)}
    {/* bangla roof: a curved hood with drooping ends */}
    <path d="M4 104Q160 26 316 104L310 114Q160 46 10 114Z" fill={`url(#${id}e)`} />
    <path d="M4 104Q160 26 316 104" className="hj-roof-edge" />
    <path d="M10 114Q160 46 310 114" className="hj-roof-edge is-soft" />
    {/* fringe of tiny scallops under the eave */}
    {Array.from({ length: 21 }, (_, i) => {
      const t = (i + 0.5) / 21, x = (1 - t) * (1 - t) * 10 + 2 * (1 - t) * t * 160 + t * t * 310, y = (1 - t) * (1 - t) * 114 + 2 * (1 - t) * t * 46 + t * t * 114
      return <circle key={i} cx={f(x)} cy={f(y + 3.4)} r="3.4" className="hj-roof-bead" />
    })}
    <path d="M24 128V112M296 128V112" className="hj-roof-post" strokeWidth="7" />
  </svg>
}

function Frame({ shape }: { shape: ArchShape }) {
  const id = useId()
  // Solid surround with the cusped opening cut out (even-odd fill).
  const opening = `M${OX} ${OT + OH}V${f(OT + shape.base + 0.75 - ST)}` + shape.lobes.map(l => `A${f(l.r)} ${f(l.r)} 0 0 1 ${f(OX + l.to[0])} ${f(OT + l.to[1])}`).join('') + `V${OT + OH}Z`
  return <svg className="hj-frame" viewBox={`0 0 ${FW} ${FH}`} aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={id + 's'} x1="0" x2="1"><stop offset="0" stopColor="var(--hj-stone-3)" /><stop offset=".5" stopColor="var(--hj-stone)" /><stop offset="1" stopColor="var(--hj-stone-2)" /></linearGradient>
    </defs>
    <path fillRule="evenodd" d={`M8 0H${FW - 8}V${FH}H8Z` + opening} fill={`url(#${id}s)`} />
    <path d={opening} fill="none" className="hj-frame-edge" transform={`translate(0 0)`} />
    {/* pillars */}
    {[8, FW - 30].map(x => <g key={x} className="hj-pillar">
      <rect x={x + 2} y={OT + 58} width="18" height={OH - 70} rx="2" />
      <path d={`M${x + 11} ${OT + 62}V${OT + OH - 16}`} className="hj-pillar-flute" />
      <path d={`M${x - 2} ${OT + 58}h26l-4-8h-18Z`} className="hj-pillar-cap" />
      <path d={`M${x} ${OT + OH - 12}h22v8h-22Z`} className="hj-pillar-cap" />
      <path d={`M${x + 11} ${OT + 50}c-6-6-6-14 0-20c6 6 6 14 0 20Z`} className="hj-pillar-bud" />
    </g>)}
    {/* spandrel carving */}
    {[[34, 18], [FW - 34, 18]].map(([x, y]) => <g key={x} transform={`translate(${x} ${y + 16})`} className="hj-spandrel">
      <circle r="9" /><circle r="3.4" className="hj-brass" />
    </g>)}
    <path d={`M8 ${FH - 1}H${FW - 8}`} className="hj-frame-sill" strokeWidth="3" />
  </svg>
}

function Ledge() {
  return <svg className="hj-ledge" viewBox="0 0 320 96" aria-hidden="true" focusable="false">
    <path d="M0 0H320V14H0Z" className="hj-ledge-slab" />
    <path d="M0 14H320L306 26H14Z" className="hj-ledge-under" />
    {Array.from({ length: 13 }, (_, i) => <path key={i} d={`M${22 + i * 23} 26v7h12v-7`} className="hj-ledge-dentil" />)}
    {/* brackets with lotus-bud drops */}
    {[50, 160, 270].map(x => <g key={x} transform={`translate(${x} 26)`}>
      <path d="M-18 0H18C18 18 10 30 4 44H-4C-10 30-18 18-18 0Z" className="hj-ledge-bracket" />
      <path d="M-11 6C-8 20-4 30 0 38C4 30 8 20 11 6" className="hj-ledge-carve" />
      <path d="M0 44V52" className="hj-gold-line" strokeWidth="1.6" />
      <path d="M0 52C5 56 6 62 0 70C-6 62-5 56 0 52Z" className="hj-brass" />
    </g>)}
    <path d="M0 1H320" className="hj-ledge-edge" />
  </svg>
}

export function Jharokha({ className, view, style }: { className?: string; view: ReactNode; style?: CSSProperties }) {
  const shape = useArch(OW)
  const id = useId()
  const ids = { jali: id + 'j', glow: id + 'g', wood: id + 'w' }
  const viewPath = `M0 ${OH}V${f(shape.base + 0.75 - ST)}` + shape.lobes.map(l => `A${f(l.r)} ${f(l.r)} 0 0 1 ${f(l.to[0])} ${f(l.to[1])}`).join('') + `V${OH}Z`
  const mask = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${OW} ${OH}' preserveAspectRatio='none'><path d='${viewPath}'/></svg>`)}")`
  const box = (x: number, y: number, w: number, h: number): CSSProperties => ({ left: (x / FW) * 100 + '%', top: (y / FH) * 100 + '%', width: (w / FW) * 100 + '%', height: (h / FH) * 100 + '%' })
  return <span className={'hj-jharokha ' + (className ?? '')} style={style}>
    <svg width="0" height="0" className="hj-defs" aria-hidden="true" focusable="false">
      <defs>
        <JaliPattern id={ids.jali} size={15} stroke="var(--hj-wood)" width={2.7} />
        <radialGradient id={ids.glow} cx="100%" cy="70%" r="110%"><stop offset="0" stopColor="var(--hj-glow)" /><stop offset=".6" stopColor="var(--hj-glow-2)" /><stop offset="1" stopColor="var(--hj-glow-3)" /></radialGradient>
        <linearGradient id={ids.wood} x1="0" x2="1"><stop offset="0" stopColor="var(--hj-wood-2)" /><stop offset=".7" stopColor="var(--hj-wood)" /><stop offset="1" stopColor="var(--hj-wood-dark)" /></linearGradient>
      </defs>
    </svg>
    <Roof />
    <span className="hj-window-box">
      <span className="hj-view" style={{ ...box(OX, OT, OW, OH), maskImage: mask, WebkitMaskImage: mask }}>{view}</span>
      <Frame shape={shape} />
      <span className="hj-shutters" style={box(OX, OT, OW, OH)}>
        <Shutter side="l" shape={shape} ids={ids} />
        <Shutter side="r" shape={shape} ids={ids} />
      </span>
    </span>
    <Ledge />
  </span>
}

// The view through the window: an evening sky over the city's domes.
export function Skyline({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 240 80" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
    <path className="hj-sky-far" d="M0 80V52h14v-8h10v8h8V40c0-8 10-12 12-20 2 8 12 12 12 20v12h10v-6h14v6h12V36h4v-6h8v6h4v16h10v-8c0-6 8-10 9-16 1 6 9 10 9 16v8h12v-4h16v4h8V44c0-7 9-11 10-18 1 7 10 11 10 18v8h12v28Z" />
    <path className="hj-sky-near" d="M0 80V64h20v-6h6c0-6 6-9 7-14 1 5 7 8 7 14h6v6h30v-8h22v8h18V54c0-10 14-14 15-24 1 10 15 14 15 24v10h24v-6h28v6h14v-4h12v4h16v16Z" />
  </svg>
}

// ---------------------------------------------------------------------------
// Rooftop: a parapet of rounded merlons with three chhatris.
// ---------------------------------------------------------------------------
function Chhatri({ x, s }: { x: number; s: number }) {
  return <g transform={`translate(${x} 104) scale(${s})`}>
    <path d="M0-92V-80" className="hj-gold-line" strokeWidth="2" />
    <circle cy="-93" r="3" className="hj-brass" />
    <path d="M-24-50C-24-66-12-74 0-80C12-74 24-66 24-50Z" className="hj-chhatri-dome" />
    <path d="M-36-44Q0-62 36-44L33-38Q0-54-33-38Z" className="hj-chhatri-eave" />
    <path d="M-28-38V0M28-38V0M-10-40V0M10-40V0" className="hj-chhatri-post" strokeWidth="5" />
    <path d="M-28-38Q-19-28-10-38M10-38Q19-28 28-38M-10-38Q0-30 10-38" className="hj-chhatri-arch" />
  </g>
}

export function Rooftop({ className }: { className?: string }) {
  const id = useId()
  return <div className={className} aria-hidden="true">
    <svg className="hj-chhatris" viewBox="0 0 400 106" preserveAspectRatio="xMidYMax meet" focusable="false">
      <Chhatri x={70} s={0.72} /><Chhatri x={330} s={0.72} /><Chhatri x={200} s={1} />
    </svg>
    <svg className="hj-parapet-strip" width="100%" height="38" focusable="false">
      <defs>
        <pattern id={id} width="22" height="38" patternUnits="userSpaceOnUse">
          <path d="M3 18V10c0-5 4-8 8-8s8 3 8 8v8Z" className="hj-merlon" />
        </pattern>
      </defs>
      <rect width="100%" height="18" fill={`url(#${id})`} />
      <rect y="18" width="100%" height="20" className="hj-parapet" />
      <path d="M0 18.75H4000M0 24.5H4000" className="hj-parapet-line" />
    </svg>
  </div>
}

// ---------------------------------------------------------------------------
// Blue-pottery pieces: a band of tiles and round plates.
// ---------------------------------------------------------------------------
export function TileBand({ className }: { className?: string }) {
  const id = useId()
  return <div className={'hj-tiles ' + (className ?? '')} aria-hidden="true">
    <svg width="100%" height="100%">
      <defs>
        <pattern id={id} width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" className="hj-tile-ground" />
          {[[0, 0], [40, 0], [0, 40], [40, 40]].map(([x, y]) => <g key={x + ':' + y}>
            <circle cx={x} cy={y} r="9" className="hj-tile-blue" /><circle cx={x} cy={y} r="4" className="hj-tile-turq" />
          </g>)}
          {[0, 90, 180, 270].map(a => <path key={a} d="M20 20C16 15 16 9 20 5C24 9 24 15 20 20Z" transform={`rotate(${a + 45} 20 20)`} className="hj-tile-blue" />)}
          {[0, 90, 180, 270].map(a => <path key={'l' + a} d="M20 20C18 16 18 13 20 11C22 13 22 16 20 20Z" transform={`rotate(${a} 20 20)`} className="hj-tile-turq" />)}
          <circle cx="20" cy="20" r="2.6" className="hj-tile-core" />
          <path d="M0 .5H40M.5 0V40" className="hj-tile-grout" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  </div>
}

const glyphs: Record<InvitationSymbol, ReactNode> = {
  om: <text x="50" y="63" textAnchor="middle" className="hj-glyph">ॐ</text>,
  shri: <text x="50" y="60" textAnchor="middle" className="hj-glyph is-shri">श्री</text>,
  swastik: <g transform="translate(32 32)" fill="none" className="hj-glyph-line" strokeWidth="4" strokeLinecap="square">
    <path d="M18 18V2H30M18 18H34V30M18 18V34H6M18 18H2V6" />
    <g className="hj-glyph-fill" stroke="none"><circle cx="10" cy="10" r="2.2" /><circle cx="26" cy="10" r="2.2" /><circle cx="26" cy="26" r="2.2" /><circle cx="10" cy="26" r="2.2" /></g>
  </g>,
  kalash: <g fill="none" className="hj-glyph-line" strokeWidth="2.2" strokeLinejoin="round">
    <ellipse cx="50" cy="32" rx="5" ry="6" className="hj-glyph-soft" />
    <path d="M43 39C36 36 32 37 30 41C35 42 39 41 43 39ZM57 39C64 36 68 37 70 41C65 42 61 41 57 39Z" />
    <path d="M42 38H58V43H42Z" />
    <path d="M42 43C34 51 36 64 50 64C64 64 66 51 58 43Z" className="hj-glyph-soft" />
    <path d="M39 53Q50 58 61 53" />
  </g>,
}

export function Plate({ symbol, large }: { symbol: InvitationSymbol; large?: boolean }) {
  return <svg className={'hj-plate' + (large ? ' is-large' : '')} viewBox="0 0 100 100" role="img" aria-label={symbol}>
    <circle cx="50" cy="50" r="48" className="hj-plate-rim" />
    {Array.from({ length: 12 }, (_, i) => <path key={i} d="M50 4C54 8 54 13 50 16C46 13 46 8 50 4Z" transform={`rotate(${i * 30} 50 50)`} className="hj-plate-leaf" />)}
    {Array.from({ length: 12 }, (_, i) => <circle key={i} cx="50" cy="9" r="1.5" transform={`rotate(${i * 30 + 15} 50 50)`} className="hj-plate-dot" />)}
    <circle cx="50" cy="50" r="33" className="hj-plate-face" />
    <circle cx="50" cy="50" r="29.5" className="hj-plate-ring" />
    {glyphs[symbol]}
  </svg>
}

// A haveli gate for the venue: a tall arched doorway with studded leaves.
export function Gate({ className }: { className?: string }) {
  const studs: Point[] = []
  for (let y = 46; y <= 96; y += 10) for (const x of [44, 52, 68, 76]) studs.push([x, y])
  return <svg className={className} viewBox="0 0 120 110" aria-hidden="true" focusable="false">
    <path d="M14 108V44C14 18 36 6 60 6C84 6 106 18 106 44V108Z" className="hj-gate-stone" />
    <path d="M30 108V48C30 28 44 18 60 18C76 18 90 28 90 48V108Z" className="hj-gate-door" />
    <path d="M60 18V108" className="hj-gate-split" />
    {studs.map(([x, y]) => <circle key={x + ':' + y} cx={x} cy={y} r="1.8" className="hj-brass" />)}
    <circle cx="55" cy="74" r="3.4" fill="none" className="hj-brass-ring" strokeWidth="1.6" /><circle cx="65" cy="74" r="3.4" fill="none" className="hj-brass-ring" strokeWidth="1.6" />
    <path d="M8 108H112" className="hj-gate-step" strokeWidth="4" />
  </svg>
}

// A rock pigeon perched side-on, facing right. The head bobs on its own.
export function Pigeon({ className, style }: { className?: string; style?: CSSProperties }) {
  return <svg className={'hj-pigeon ' + (className ?? '')} style={style} viewBox="0 0 60 46" aria-hidden="true" focusable="false">
    <path d="M27 37l-2 7M33 37l1 7M23 44h5M32 44h5" className="hj-pigeon-feet" />
    <path d="M3 25L19 20L18 30Z" className="hj-pigeon-tail" />
    <path d="M14 27C14 15 28 11 38 15C45 18 47 24 44 30C40 38 23 39 14 27Z" className="hj-pigeon-body" />
    <path d="M18 23C24 17 34 17 41 23C34 29 24 30 18 23Z" className="hj-pigeon-wing" />
    <path d="M24 25L35 23M23 28L33 27" className="hj-pigeon-bar" />
    <g className="hj-pigeon-head">
      <ellipse cx="41" cy="16" rx="5.5" ry="6.5" className="hj-pigeon-neck" />
      <circle cx="46" cy="10" r="5.4" className="hj-pigeon-face" />
      <circle cx="47.6" cy="9" r="1.3" className="hj-pigeon-eye" />
      <path d="M51 9.5L55.5 11L51 12.2Z" className="hj-pigeon-beak" />
    </g>
  </svg>
}

// A small brass diya, lit, for the closing window.
export function Diya({ className }: { className?: string }) {
  const id = useId()
  return <svg className={className} viewBox="0 0 80 80" aria-hidden="true" focusable="false">
    <defs><radialGradient id={id}><stop offset="0" stopColor="var(--hj-glow)" stopOpacity=".95" /><stop offset="1" stopColor="var(--hj-glow)" stopOpacity="0" /></radialGradient></defs>
    <circle cx="40" cy="34" r="34" fill={`url(#${id})`} className="hj-diya-halo" />
    <path d="M40 14C46 24 47 30 40 38C33 30 34 24 40 14Z" className="hj-diya-flame" />
    <path d="M40 22C43 28 43 31 40 35C37 31 37 28 40 22Z" className="hj-diya-core" />
    <path d="M14 44H66Q62 60 40 60Q18 60 14 44Z" className="hj-brass" />
    <path d="M12 44H68" className="hj-gold-line" strokeWidth="2" />
    <path d="M32 60L30 68H50L48 60" className="hj-brass" />
  </svg>
}

// Sandstone ashlar: staggered blocks with a few lighter and darker stones.
export function Wall({ className }: { className?: string }) {
  const id = useId()
  return <svg className={className} width="100%" height="100%" aria-hidden="true" focusable="false">
    <defs>
      <pattern id={id} width="264" height="120" patternUnits="userSpaceOnUse">
        <rect width="264" height="120" className="hj-wall-stone" />
        <rect x="1.5" y="1.5" width="129" height="57" className="hj-wall-light" />
        <rect x="67.5" y="61.5" width="129" height="57" className="hj-wall-dark" />
        <rect x="199.5" y="61.5" width="64" height="57" className="hj-wall-light" opacity=".6" />
        <rect x="133.5" y="1.5" width="129" height="57" className="hj-wall-dark" opacity=".45" />
        <path d="M0 .75H264M0 60.75H264M.75 0V60M132.75 0V60M66.75 60V120M198.75 60V120" className="hj-wall-joint" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill={`url(#${id})`} />
  </svg>
}

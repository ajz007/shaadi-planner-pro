// Alpona artwork, drawn freshly in code. Alpona is painted by hand with rice
// paste, so every motif here is line work with rounded ends and a few solid
// white shapes: lotus petals, paisleys (kalka), pairs of fish, creepers,
// shola crowns and shakha-pola bangles. Every mark carries a --d delay so the
// pattern can draw itself outward using only transform and opacity.
import { Fragment, useId } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { InvitationSymbol } from '../../model'

const f = (n: number) => Math.round(n * 100) / 100
const delay = (t: number) => ({ '--d': f(t) + 's' } as CSSProperties)

// A lotus petal pointing up (towards -y), from radius r0 to r1.
export function petal(r0: number, r1: number, w: number) {
  const L = r1 - r0
  return `M0 ${f(-r0)}C${f(w)} ${f(-r0 - L * .14)} ${f(w * .78)} ${f(-r0 - L * .74)} 0 ${f(-r1)}C${f(-w * .78)} ${f(-r0 - L * .74)} ${f(-w)} ${f(-r0 - L * .14)} 0 ${f(-r0)}Z`
}
const circle = (r: number) => `M${f(r)} 0A${f(r)} ${f(r)} 0 1 1 ${f(-r)} 0A${f(r)} ${f(r)} 0 1 1 ${f(r)} 0Z`
function scallops(r: number, n: number, depth: number) {
  let d = ''
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2
    if (!i) d += `M${f(Math.cos(a0) * r)} ${f(Math.sin(a0) * r)}`
    d += `Q${f(Math.cos(am) * (r + depth * 2))} ${f(Math.sin(am) * (r + depth * 2))} ${f(Math.cos(a1) * r)} ${f(Math.sin(a1) * r)}`
  }
  return d
}

// A paisley (kalka) about 52 units tall, centred on the origin, tip curling up and right.
export const paisley = 'M-2 26C-17 26-24 13-21 1C-18-11-7-15 1-21C7-26 9-31 7-38C17-33 20-22 17-12C24-1 18 26-2 26Z'
export const paisleyInner = 'M-2 18C-11 18-15 10-13 2C-11-6-4-9 2-13C5-15 7-19 7-23'
// A fish facing right, about 56 units long, centred on the origin.
const fishBody = 'M25 0C20-10 6-13-12-3L-14 0L-12 3C6 13 20 10 25 0Z'
const fishTail = 'M-13 0L-28-10Q-23 0-28 10Z'
const fishLines = 'M11-7Q7 0 11 7M1-7Q-3 0 1 7M-7-5Q-10 0-7 5M3-9Q0-15-6-15Q-3-11-4-8'

export function FishMarks({ t = 0 }: { t?: number }) {
  return <>
    <path className="al-fill al-part" d={fishBody} style={delay(t)} />
    <path className="al-fill al-part" d={fishTail} style={delay(t + .08)} />
    <path className="al-cut" d={fishLines} style={delay(t + .16)} />
    <circle className="al-cut-dot al-part" cx="16" cy="-2" r="2.2" style={delay(t + .16)} />
  </>
}

// Two fish chasing each other round a circle, the Bengali sign of a happy pair.
export function FishPair({ t = 0, r = 12 }: { t?: number; r?: number }) {
  return <g>
    <g transform={`translate(0 ${-r}) rotate(-10)`}><FishMarks t={t} /></g>
    <g transform={`rotate(180) translate(0 ${-r}) rotate(-10)`}><FishMarks t={t + .18} /></g>
  </g>
}

export function PaisleyMarks({ t = 0 }: { t?: number }) {
  return <>
    <path className="al-line al-part" d={paisley} style={delay(t)} />
    <path className="al-line al-part is-thin" d={paisleyInner} style={delay(t + .12)} />
    <circle className="al-dot al-part" cx="-3" cy="6" r="3.2" style={delay(t + .2)} />
    {[[-2, -4], [-10, 8], [6, 12]].map(([x, y], i) => <circle key={i} className="al-dot al-part" cx={x} cy={y} r="1.5" style={delay(t + .26)} />)}
  </>
}

// A small solid lotus: eight white petals with red veins and a dotted heart.
export function LotusMarks({ r = 22, t = 0, step = .04 }: { r?: number; t?: number; step?: number }) {
  return <>
    {Array.from({ length: 8 }, (_, i) => <g key={i} transform={`rotate(${i * 45})`}>
      <path className="al-fill al-part is-base" d={petal(r * .22, r, r * .34)} style={delay(t + i * step)} />
      <path className="al-cut" d={`M0 ${f(-r * .36)}V${f(-r * .78)}`} style={delay(t + i * step + .1)} />
    </g>)}
    {Array.from({ length: 8 }, (_, i) => <g key={'s' + i} transform={`rotate(${i * 45 + 22.5})`}>
      <path className="al-line al-part is-base is-thin" d={petal(r * .3, r * .72, r * .2)} style={delay(t + .3 + i * step)} />
    </g>)}
    <circle className="al-fill al-part" r={f(r * .2)} style={delay(t)} />
    <circle className="al-cut-dot al-part" r={f(r * .08)} style={delay(t + .1)} />
  </>
}

type Ring = { at: number; parts: (t: number) => ReactNode }

// One radial alpona. `from` is where the drawing starts; rings flow outward.
// `slim` leaves out the big petal ring, for a wreath with a wide open centre.
function radial(from: number, spread: number, slim = false): Ring[] {
  const rings: Ring[] = []
  const add = (r: number, parts: (t: number) => ReactNode) => { if (!(slim && r === 1)) rings.push({ at: r, parts }) }
  const s = (r: number) => from + (slim && r > 16 ? r - 76 : r)
  const n12 = Array.from({ length: 12 }, (_, i) => i)
  const n8 = Array.from({ length: 8 }, (_, i) => i)
  add(0, t => <>
    <path className="al-line al-ring" d={circle(s(0))} style={delay(t)} />
    {Array.from({ length: 24 }, (_, i) => <circle key={i} className="al-dot al-part" cx={f(Math.cos(i / 24 * Math.PI * 2) * s(10))}
      cy={f(Math.sin(i / 24 * Math.PI * 2) * s(10))} r="2.4" style={delay(t + i / 24 * spread)} />)}
  </>)
  add(1, t => <>
    {n12.map(i => <g key={i} transform={`rotate(${i * 30})`}>
      <path className="al-fill al-part is-base" d={petal(s(18), s(84), 21)} style={delay(t + i / 12 * spread)} />
      <path className="al-cut" d={petal(s(30), s(70), 10)} style={delay(t + i / 12 * spread + .12)} />
      <path className="al-cut" d={`M0 ${-s(36)}V${-s(62)}`} style={delay(t + i / 12 * spread + .18)} />
    </g>)}
    {n12.map(i => <g key={'b' + i} transform={`rotate(${i * 30 + 15})`}>
      <path className="al-line al-part is-base" d={petal(s(22), s(58), 11)} style={delay(t + .15 + i / 12 * spread)} />
      <circle className="al-dot al-part" cy={-s(66)} r="2.6" style={delay(t + .25 + i / 12 * spread)} />
    </g>)}
  </>)
  add(2, t => <>
    <path className="al-line al-ring" d={scallops(s(92), 36, 4)} style={delay(t)} />
    <path className="al-line al-ring is-thin" d={circle(s(100))} style={delay(t + .1)} />
  </>)
  add(3, t => <>
    {n8.map(i => <g key={i} transform={`rotate(${i * 45}) translate(0 ${-s(132)})`}>
      {i % 2 === 0
        ? <g transform="rotate(90)"><FishPair t={t + i / 8 * spread} /></g>
        : <g transform="rotate(-12) scale(1.08)"><PaisleyMarks t={t + i / 8 * spread} /></g>}
    </g>)}
    {Array.from({ length: 16 }, (_, i) => <g key={'v' + i} transform={`rotate(${i * 22.5 + 11.25})`}>
      <path className="al-line al-part is-thin" d={`M0 ${-s(108)}C8 ${-s(120)} -8 ${-s(140)} 0 ${-s(156)}`} style={delay(t + .1 + i / 16 * spread)} />
      <circle className="al-dot al-part" cy={-s(160)} r="2.2" style={delay(t + .2 + i / 16 * spread)} />
    </g>)}
  </>)
  add(4, t => <>
    <path className="al-line al-ring" d={circle(s(170))} style={delay(t)} />
    <path className="al-line al-ring is-thin" d={circle(s(177))} style={delay(t + .06)} />
  </>)
  add(5, t => <>
    {Array.from({ length: 36 }, (_, i) => <g key={i} transform={`rotate(${i * 10})`}>
      <path className="al-fill al-part is-base" d={petal(s(180), s(214), 6.5)} style={delay(t + i / 36 * spread)} />
      <circle className="al-dot al-part" cy={-s(222)} r="2.4" style={delay(t + .1 + i / 36 * spread)} />
    </g>)}
    {Array.from({ length: 36 }, (_, i) => <g key={'h' + i} transform={`rotate(${i * 10 + 5})`}>
      <path className="al-line al-part is-base is-thin" d={`M0 ${-s(184)}C5 ${-s(194)} -5 ${-s(200)} 0 ${-s(206)}`} style={delay(t + .08 + i / 36 * spread)} />
    </g>)}
  </>)
  return rings
}

// The big opening alpona: rings flow out from an open centre (where the
// lotus button sits). viewBox is -300..300.
const doorRings = radial(64, .42)
export function DoorAlpona({ className, heart }: { className?: string; heart?: boolean }) {
  return <svg className={'al-art ' + (className ?? '')} viewBox="-300 -300 600 600" aria-hidden="true" focusable="false">
    {heart && <><path className="al-line al-ring is-thin" d={circle(54)} style={delay(0)} /><LotusMarks r={42} t={0} step={.03} /></>}
    {doorRings.map((ring, i) => <Fragment key={i}>{ring.parts(.12 + i * .22)}</Fragment>)}
  </svg>
}

// A wreath for the hero: the same alpona with a wide open centre for names.
const heroRings = radial(232, .5, true)
export function HeroWreath({ className }: { className?: string }) {
  return <svg className={'al-art ' + (className ?? '')} viewBox="-380 -380 760 760" aria-hidden="true" focusable="false">
    <path className="al-line al-ring is-thin" d={circle(224)} style={delay(0)} />
    {heroRings.map((ring, i) => <Fragment key={i}>{ring.parts(.12 + i * .22)}</Fragment>)}
  </svg>
}

// A creeper that scrolls out from a corner, with leaves, a paisley and a spiral.
const stem = 'M0 16C44 14 78 28 102 56C118 75 142 80 158 68C172 57 167 37 150 36C137 36 132 50 141 56'
const leaves: [number, number, number][] = [[30, 15, 160], [52, 18, 30], [74, 28, 190], [92, 44, 50], [122, 74, 220], [146, 74, 110]]
function Creeper({ t }: { t: number }) {
  return <g>
    <path className="al-line al-part is-start" d={stem} style={delay(t)} />
    {leaves.map(([x, y, a], i) => <g key={i} transform={`translate(${x} ${y}) rotate(${a})`}>
      <path className="al-fill al-part is-base" d={petal(0, 18, 6)} style={delay(t + .12 + i * .07)} />
    </g>)}
    {[[20, 26], [40, 30], [62, 40], [82, 56], [104, 76]].map(([x, y], i) => <circle key={i} className="al-dot al-part" cx={x} cy={y} r="2" style={delay(t + .2 + i * .07)} />)}
  </g>
}
export function CornerSwirl({ className, t = 0 }: { className?: string; t?: number }) {
  return <svg className={'al-art ' + (className ?? '')} viewBox="0 0 220 220" aria-hidden="true" focusable="false">
    <Creeper t={t} />
    <g transform="matrix(0 1 1 0 0 0)"><Creeper t={t + .1} /></g>
    <g transform="translate(64 64) rotate(-45) scale(.95)"><PaisleyMarks t={t + .3} /></g>
    <path className="al-line al-part is-thin" d="M0 0Q20 20 34 34" style={delay(t)} />
    <g transform="translate(104 104) scale(.62)"><LotusMarks r={22} t={t + .5} step={.03} /></g>
  </svg>
}

// A horizontal border for section heads: a lotus at the centre, then paisleys,
// creepers and dots mirrored outwards. Parts reveal from the centre out.
export function AlponaBand({ className }: { className?: string }) {
  const side = (dir: 1 | -1) => <g transform={dir === 1 ? undefined : 'translate(640 0) scale(-1 1)'}>
    <g transform="translate(372 30) rotate(-90) scale(.6)"><PaisleyMarks t={.32} /></g>
    <path className="al-line al-part is-start" d="M392 30C410 14 428 14 440 30S470 46 488 30S520 14 536 30S566 46 582 30" style={delay(.5)} />
    {[416, 464, 512, 560].map((x, i) => <g key={x} transform={`translate(${x} ${i % 2 ? 41 : 19}) rotate(${i % 2 ? 180 : 0})`}>
      <path className="al-fill al-part is-base" d={petal(0, 13, 4.6)} style={delay(.6 + i * .1)} />
    </g>)}
    {[440, 488, 536].map((x, i) => <circle key={x} className="al-dot al-part" cx={x} cy="30" r="2.4" style={delay(.66 + i * .1)} />)}
    <path className="al-line al-part is-start" d="M582 30C594 22 606 26 606 34C606 42 594 42 594 34" style={delay(.95)} />
    <circle className="al-dot al-part" cx="620" cy="30" r="2" style={delay(1.05)} />
  </g>
  return <svg className={'al-art al-band ' + (className ?? '')} viewBox="0 0 640 60" aria-hidden="true" focusable="false">
    <g transform="translate(320 30)"><LotusMarks r={24} t={0} step={.025} /></g>
    {side(1)}{side(-1)}
  </svg>
}

// The heart of the opening: a lotus that waits to be touched.
export function SeedLotus() {
  return <svg className="al-art al-seed-art" viewBox="-60 -60 120 120" aria-hidden="true" focusable="false">
    <path className="al-line is-thin" d={circle(54)} />
    {Array.from({ length: 16 }, (_, i) => <circle key={i} className="al-dot" cx={f(Math.cos(i / 16 * Math.PI * 2) * 47)} cy={f(Math.sin(i / 16 * Math.PI * 2) * 47)} r="1.8" />)}
    <LotusMarks r={40} t={0} step={0} />
  </svg>
}

// Shakha (white conch) and pola (red) bangles, worn together by a Bengali bride.
export function Bangle({ className }: { className?: string }) {
  const id = useId()
  return <svg className={'al-bangle-art ' + (className ?? '')} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={id} cx="42%" cy="36%" r="70%"><stop offset="0" stopColor="var(--al-shakha)" /><stop offset="1" stopColor="var(--al-shakha-shade)" /></radialGradient>
    </defs>
    <circle cx="50" cy="50" r="46" fill={`url(#${id})`} stroke="var(--al-shakha-edge)" strokeWidth="1" />
    <circle cx="50" cy="50" r="35.5" fill="var(--al-cloth)" stroke="var(--al-shakha-edge)" strokeWidth="1" />
    <g fill="none" stroke="var(--al-pola)" strokeWidth="1.4" strokeLinecap="round">
      {Array.from({ length: 20 }, (_, i) => <path key={i} d="M50 6.5Q53.5 10.5 50 14.5Q46.5 10.5 50 6.5" transform={`rotate(${i * 18} 50 50)`} />)}
    </g>
    <circle cx="50" cy="50" r="40.2" fill="none" stroke="var(--al-pola)" strokeWidth="1" strokeDasharray="1.4 3" />
    <circle cx="50" cy="50" r="33" fill="none" stroke="var(--al-pola)" strokeWidth="4.5" />
    <circle cx="50" cy="50" r="30.5" fill="none" stroke="var(--al-gold)" strokeWidth="1" />
    <circle cx="50" cy="50" r="35.4" fill="none" stroke="var(--al-gold)" strokeWidth="1" />
  </svg>
}

// The groom's tall shola-pith topor and the bride's fanned mukut, drawn as
// white filigree.
export function Topor({ className }: { className?: string }) {
  return <svg className={'al-crown ' + (className ?? '')} viewBox="0 0 120 110" aria-hidden="true" focusable="false">
    <g className="al-crown-body">
      <path d="M33 92Q60 101 87 92L68 14Q60 4 52 14Z" />
      <path d="M26 90Q60 104 94 90L95 100Q60 113 25 100Z" />
      <path d="M33 92Q22 84 14 90Q18 98 28 98Z" /><path d="M87 92Q98 84 106 90Q102 98 92 98Z" />
      <circle cx="60" cy="8" r="5" />
    </g>
    <g className="al-crown-line">
      <path d="M60 14V92M51 26L46 92M69 26L74 92M42 92L55 22M78 92L65 22" opacity=".55" />
      <path d="M38 76Q60 84 82 76M42 60Q60 67 78 60M46 44Q60 50 74 44M50 30Q60 34 70 30" />
      {[[60, 70], [52, 54], [68, 54], [60, 38]].map(([x, y]) => <circle key={x + '-' + y} cx={x} cy={y} r="3" />)}
      <path d="M30 96Q60 107 90 96" strokeDasharray="1.5 3" />
      <path d="M60 3V0M55 4L52 1M65 4L68 1" />
    </g>
  </svg>
}
export function Mukut({ className }: { className?: string }) {
  const peaks = [[14, 64, 46], [30, 46, 33], [46, 34, 22], [60, 18, 6], [74, 34, 22], [90, 46, 33], [106, 64, 46]]
  return <svg className={'al-crown ' + (className ?? '')} viewBox="0 0 120 110" aria-hidden="true" focusable="false">
    <g className="al-crown-body">
      <path d={'M8 90' + peaks.map(([x, y]) => `L${x} ${y}`).join('') + 'L112 90Q60 102 8 90Z'} />
      <path d="M6 88Q60 102 114 88L114 98Q60 112 6 98Z" />
      {peaks.map(([x, y]) => <circle key={x} cx={x} cy={y - 5} r="4.2" />)}
    </g>
    <g className="al-crown-line">
      {peaks.map(([x, , y2], i) => <path key={x} d={`M${x} ${y2 + 22}V${i === 3 ? 82 : 86}`} opacity=".55" />)}
      <path d="M20 80Q60 90 100 80M30 66Q60 74 90 66M44 50Q60 56 76 50" />
      <path d="M60 30C66 36 66 42 60 48C54 42 54 36 60 30Z" />
      {[[38, 74], [60, 62], [82, 74]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="3" />)}
      <path d="M10 94Q60 106 110 94" strokeDasharray="1.5 3" />
    </g>
  </svg>
}

// A round alpona medallion for symbols and function icons.
export function Medal({ children, className, label }: { children?: ReactNode; className?: string; label?: string }) {
  return <svg className={'al-medal ' + (className ?? '')} viewBox="-50 -50 100 100" role={label ? 'img' : undefined} aria-label={label}
    aria-hidden={label ? undefined : true} focusable="false">
    <circle r="48" className="al-medal-disc" />
    {Array.from({ length: 16 }, (_, i) => <path key={i} className="al-medal-petal" d={petal(36, 47, 4.2)} transform={`rotate(${i * 22.5})`} />)}
    <circle r="35" className="al-medal-face" />
    <circle r="31.5" className="al-medal-ring" />
    {children}
  </svg>
}

const kalash = <g transform="translate(-32 -33)" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
  <ellipse cx="32" cy="15" rx="6" ry="7.5" />
  <path d="M23 25C15 21 10 23 7 28C14 29 18 28 23 25ZM41 25C49 21 54 23 57 28C50 29 46 28 41 25Z" />
  <path d="M22 24H42V30H22ZM22 30C12 40 15 56 32 56C49 56 52 40 42 30Z" />
  <path d="M18 42Q32 48 46 42" />
</g>
export function SymbolMark({ symbol, large }: { symbol: InvitationSymbol; large?: boolean }) {
  const glyph = symbol === 'om' ? <text className="al-glyph" y="13" textAnchor="middle">ॐ</text>
    : symbol === 'shri' ? <text className="al-glyph is-shri" y="10" textAnchor="middle">श्री</text>
      : symbol === 'swastik' ? <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="square">
        <path d="M0 0V-17H13M0 0H17V13M0 0V17H-13M0 0H-17V-13" />
        <g fill="currentColor" stroke="none"><circle cx="-8" cy="-8" r="2.4" /><circle cx="8" cy="-8" r="2.4" /><circle cx="8" cy="8" r="2.4" /><circle cx="-8" cy="8" r="2.4" /></g>
      </g> : <g transform="scale(.78)">{kalash}</g>
  return <Medal className={'al-symbol' + (large ? ' is-large' : '')} label={symbol}>{glyph}</Medal>
}

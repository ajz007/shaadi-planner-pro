// Artwork for Royal Scroll: flat ornamental silhouettes in the manner of a
// court painting, drawn from simple geometry and coloured through this
// template's custom properties (--rs-*), so one set of art serves every palette.
import { useId } from 'react'
import type { ReactNode } from 'react'
import type { InvitationSymbol } from '../../model'

const round = (n: number) => Math.round(n * 100) / 100
const ring = <T,>(count: number, draw: (angle: number, index: number) => T) =>
  Array.from({ length: count }, (_, index) => draw((360 / count) * index, index))

// A jali lattice of eight-pointed stars, laid behind the whole page.
export function JaliField({ className }: { className?: string }) {
  const id = useId()
  return <svg className={className} aria-hidden="true" focusable="false">
    <defs>
      <pattern id={id} width="56" height="56" patternUnits="userSpaceOnUse">
        <g fill="none" stroke="var(--rs-jali)" strokeWidth="1.2">
          <path d="M28 6L34 22L50 28L34 34L28 50L22 34L6 28L22 22Z" />
          <rect x="18" y="18" width="20" height="20" transform="rotate(45 28 28)" />
          <rect x="18" y="18" width="20" height="20" />
          <path d="M0 0L6 6M56 0L50 6M0 56L6 50M56 56L50 50" />
          <circle cx="28" cy="28" r="3.5" />
        </g>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill={`url(#${id})`} />
  </svg>
}

// A painted border strip for the scroll's long edges: a creeper with
// alternating buds and leaves between two gold rules.
export function BorderStrip({ className }: { className?: string }) {
  const id = useId()
  return <svg className={className} aria-hidden="true" focusable="false" preserveAspectRatio="none">
    <defs>
      <pattern id={id} width="22" height="44" patternUnits="userSpaceOnUse">
        <path d="M11 0C4 11 4 11 11 22C18 33 18 33 11 44" fill="none" stroke="var(--rs-gold)" strokeWidth="1.1" />
        <path d="M11 11C15 6 19 7 20 10C17 13 14 13 11 11Z" fill="var(--rs-leaf)" />
        <path d="M11 33C7 28 3 29 2 32C5 35 8 35 11 33Z" fill="var(--rs-leaf)" />
        <circle cx="5.5" cy="11" r="2.6" fill="var(--rs-accent)" /><circle cx="5.5" cy="11" r="1" fill="var(--rs-gold-light)" />
        <circle cx="16.5" cy="33" r="2.6" fill="var(--rs-accent)" /><circle cx="16.5" cy="33" r="1" fill="var(--rs-gold-light)" />
      </pattern>
    </defs>
    <rect x="0" width="1.4" height="100%" fill="var(--rs-gold)" />
    <rect x="3" width=".6" height="100%" fill="var(--rs-gold)" opacity=".7" />
    <rect x="3.6" width="22" height="100%" fill={`url(#${id})`} />
    <rect x="25.8" width=".6" height="100%" fill="var(--rs-gold)" opacity=".7" />
    <rect x="28" width="1.4" height="100%" fill="var(--rs-gold)" />
  </svg>
}

// The turned knob at each end of a roller.
export function Finial({ className }: { className?: string }) {
  const id = useId()
  return <svg className={className} viewBox="0 0 30 40" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--rs-gold-light)" /><stop offset=".45" stopColor="var(--rs-gold)" /><stop offset="1" stopColor="var(--rs-gold-deep)" />
      </linearGradient>
    </defs>
    <g fill={`url(#${id})`} stroke="var(--rs-gold-deep)" strokeWidth=".6">
      <rect x="0" y="12" width="5" height="16" rx="1" />
      <path d="M5 14H9V26H5Z" />
      <ellipse cx="13" cy="20" rx="5" ry="9" />
      <path d="M17 17H20V23H17Z" />
      <path d="M20 20C20 12 26 11 28 20C26 29 20 28 20 20Z" />
    </g>
    <circle cx="13" cy="16" r="1.4" fill="#fff" opacity=".5" />
  </svg>
}

// A silk cord with a knotted tassel.
export function Tassel({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 40 120" aria-hidden="true" focusable="false">
    <path d="M20 0C16 14 24 26 20 40" fill="none" stroke="var(--rs-cord)" strokeWidth="3" strokeLinecap="round" />
    <circle cx="20" cy="44" r="6" fill="var(--rs-gold)" stroke="var(--rs-gold-deep)" />
    <path d="M14 50H26L28 58H12Z" fill="var(--rs-cord)" />
    <path d="M12 58H28L32 112H8Z" fill="var(--rs-cord)" />
    <g stroke="var(--rs-cord-deep)" strokeWidth="1" opacity=".7">
      {[12, 15, 18, 21, 24, 27].map(x => <path key={x} d={`M${x + 1} 60L${round(x * 1.3 - 6)} 110`} />)}
    </g>
    <path d="M10 64H30" stroke="var(--rs-gold)" strokeWidth="2.4" />
    <path d="M8 112H32" stroke="var(--rs-gold)" strokeWidth="1.2" />
  </svg>
}

// A blob of sealing wax with an uneven rim and the couple's initials pressed in.
const blob = Array.from({ length: 28 }, (_, i) => {
  const angle = (i / 28) * Math.PI * 2, wobble = [0, 3, -1, 4, 1, -2, 3][i % 7]
  return `${round(60 + Math.cos(angle) * (52 + wobble))} ${round(60 + Math.sin(angle) * (52 + wobble))}`
})
export function WaxSeal({ initials, className }: { initials: [string, string]; className?: string }) {
  const id = useId()
  return <svg className={className} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={id} cx="38%" cy="32%" r="75%">
        <stop offset="0" stopColor="var(--rs-wax-light)" /><stop offset=".55" stopColor="var(--rs-wax)" /><stop offset="1" stopColor="var(--rs-wax-deep)" />
      </radialGradient>
    </defs>
    <path d={'M' + blob.join('L') + 'Z'} fill={`url(#${id})`} strokeLinejoin="round" stroke="var(--rs-wax)" strokeWidth="6" />
    <circle cx="60" cy="60" r="38" fill="none" stroke="var(--rs-wax-deep)" strokeWidth="3" opacity=".7" />
    <circle cx="60" cy="60" r="34" fill="none" stroke="var(--rs-wax-light)" strokeWidth="1" opacity=".55" />
    <g transform="translate(60 60)" fill="var(--rs-wax-deep)" opacity=".75">
      {ring(16, angle => <circle key={angle} cy="-43.5" r="1.8" transform={`rotate(${angle})`} />)}
    </g>
    <circle cx="60" cy="60" r="27" fill="var(--rs-wax-deep)" opacity=".28" />
    <text x="60" y="71" textAnchor="middle" className="rs-seal-text">{initials[0]}{initials[1] && <tspan className="rs-seal-amp" dy="-3">&amp;</tspan>}{initials[1] && <tspan dy="3">{initials[1]}</tspan>}</text>
  </svg>
}

// Gold-leaf roundel for an invocation symbol.
export function SymbolMedal({ symbol, large }: { symbol: InvitationSymbol; large?: boolean }) {
  const id = useId()
  const glyph: Record<InvitationSymbol, ReactNode> = {
    om: <text x="50" y="65" textAnchor="middle" className="rs-glyph">ॐ</text>,
    shri: <text x="50" y="62" textAnchor="middle" className="rs-glyph is-shri">श्री</text>,
    swastik: <g transform="translate(31 31)" fill="none" stroke="var(--rs-glyph)" strokeWidth="4" strokeLinecap="square">
      <path d="M19 19V2H32M19 19H36V32M19 19V36H6M19 19H2V6" />
      <g fill="var(--rs-glyph)" stroke="none"><circle cx="10" cy="10" r="2.4" /><circle cx="28" cy="10" r="2.4" /><circle cx="28" cy="28" r="2.4" /><circle cx="10" cy="28" r="2.4" /></g>
    </g>,
    kalash: <g fill="none" stroke="var(--rs-glyph)" strokeWidth="2" strokeLinejoin="round">
      <ellipse cx="50" cy="31" rx="5.5" ry="6.5" fill="var(--rs-glyph)" fillOpacity=".25" />
      <path d="M42 39C35 36 31 37 29 41C34 42 38 41 42 39ZM58 39C65 36 69 37 71 41C66 42 62 41 58 39Z" />
      <path d="M41 38H59V43H41Z" />
      <path d="M41 43C33 51 35 65 50 65C65 65 67 51 59 43Z" fill="var(--rs-glyph)" fillOpacity=".18" />
      <path d="M38 53Q50 58 62 53" />
    </g>,
  }
  return <svg className={'rs-medal' + (large ? ' is-large' : '')} viewBox="0 0 100 100" role="img" aria-label={symbol}>
    <defs>
      <radialGradient id={id} cx="38%" cy="32%" r="75%">
        <stop offset="0" stopColor="var(--rs-gold-light)" /><stop offset=".6" stopColor="var(--rs-gold)" /><stop offset="1" stopColor="var(--rs-gold-deep)" />
      </radialGradient>
    </defs>
    <g transform="translate(50 50)">
      {ring(12, angle => <path key={angle} d="M0-49C5-44 5-40 0-36C-5-40-5-44 0-49Z" fill={`url(#${id})`} transform={`rotate(${angle})`} />)}
    </g>
    <circle cx="50" cy="50" r="38" fill={`url(#${id})`} />
    <circle cx="50" cy="50" r="32" fill="var(--rs-medal-face)" />
    <circle cx="50" cy="50" r="35" fill="none" stroke="var(--rs-medal-face)" strokeWidth=".8" strokeDasharray="1.2 2.4" />
    {glyph[symbol]}
  </svg>
}

// ---------- Court-painting silhouettes, each on a 120 × 64 stage ----------

function Elephant() {
  return <g>
    <path d="M10 22C4 26 3 33 5 38" fill="none" stroke="var(--rs-scene)" strokeWidth="1.6" strokeLinecap="round" />
    <ellipse cx="28" cy="28" rx="21" ry="14" fill="var(--rs-scene)" />
    <rect x="11" y="34" width="8" height="18" rx="2" fill="var(--rs-scene)" />
    <rect x="22" y="36" width="7" height="16" rx="2" fill="var(--rs-scene)" />
    <rect x="34" y="36" width="7" height="16" rx="2" fill="var(--rs-scene)" />
    <rect x="42" y="33" width="8" height="19" rx="2" fill="var(--rs-scene)" />
    <circle cx="49" cy="21" r="11" fill="var(--rs-scene)" />
    <path d="M56 26C63 29 66 21 64 13C63 8 58 7 58 11" fill="none" stroke="var(--rs-scene)" strokeWidth="5.5" strokeLinecap="round" />
    <path d="M55 29C59 33 64 32 66 29" fill="none" stroke="var(--rs-ivory)" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M45 13C40 13 38 20 40 27C43 30 47 28 48 24Z" fill="var(--rs-scene-2)" opacity=".55" />
    <circle cx="53" cy="18" r="1.3" fill="var(--rs-ivory)" />
    {/* Saddle cloth with a gold edge and a bead fringe. */}
    <path d="M15 17Q28 11 40 15L38 34Q28 38 17 34Z" fill="var(--rs-scene-2)" stroke="var(--rs-gold-light)" strokeWidth="1" />
    <path d="M21 20Q28 17 34 19L33 30Q28 32 22 30Z" fill="none" stroke="var(--rs-gold-light)" strokeWidth=".7" />
    {[18, 22, 26, 30, 34, 38].map(x => <circle key={x} cx={x} cy={x < 28 ? 36 : 37} r="1" fill="var(--rs-gold-light)" />)}
    {/* A small parasol on the back. */}
    <path d="M28 12V2" stroke="var(--rs-gold-light)" strokeWidth="1" />
    <path d="M20 6Q28 -2 36 6Z" fill="var(--rs-gold)" />
    <circle cx="49" cy="10.5" r="2" fill="var(--rs-gold-light)" />
  </g>
}

function Peacock() {
  return <g>
    <path d="M36 36C24 38 10 44 2 54H34C36 48 38 42 40 38Z" fill="var(--rs-scene)" />
    {[[10, 50], [18, 46], [26, 43], [18, 52], [27, 50], [33, 47]].map(([x, y]) => <g key={x + '-' + y}>
      <ellipse cx={x} cy={y} rx="2.6" ry="2" fill="var(--rs-scene-2)" />
      <circle cx={x} cy={y} r=".9" fill="var(--rs-gold-light)" />
    </g>)}
    <path d="M34 40C30 28 36 20 44 22C50 24 51 34 46 42Z" fill="var(--rs-scene)" />
    <path d="M43 24C42 15 44 10 50 8" fill="none" stroke="var(--rs-scene)" strokeWidth="4.5" strokeLinecap="round" />
    <circle cx="51" cy="8" r="3.6" fill="var(--rs-scene)" />
    <path d="M54 7L58 8.5L54 10Z" fill="var(--rs-gold)" />
    <path d="M50 4L48 0M51.5 4L52 -.5M53 4.5L55.5 1" stroke="var(--rs-scene)" strokeWidth=".8" />
    <circle cx="48" cy="0" r="1" fill="var(--rs-gold-light)" /><circle cx="52" cy="-.5" r="1" fill="var(--rs-gold-light)" /><circle cx="55.5" cy="1" r="1" fill="var(--rs-gold-light)" />
    <circle cx="52" cy="7.4" r=".9" fill="var(--rs-ivory)" />
    <path d="M38 30C40 34 44 34 46 31" fill="none" stroke="var(--rs-gold-light)" strokeWidth=".8" />
    <path d="M40 42L38 54M44 41L45 54" stroke="var(--rs-scene)" strokeWidth="1.3" />
  </g>
}

function Pavilion() {
  return <g>
    <path d="M60 2V8" stroke="var(--rs-gold-light)" strokeWidth="1.2" />
    <circle cx="60" cy="3" r="1.8" fill="var(--rs-gold-light)" />
    <path d="M44 22C44 12 52 8 60 8C68 8 76 12 76 22Z" fill="var(--rs-scene)" />
    <path d="M40 22H80L78 26H42Z" fill="var(--rs-scene-2)" />
    <path d="M30 26H90L86 30H34Z" fill="var(--rs-scene)" />
    {[38, 50, 62, 74].map(x => <path key={x} d={`M${x} 30H${x + 8}V48H${x}Z`} fill="var(--rs-scene)" />)}
    {[46, 58, 70].map(x => <path key={x} d={`M${x} 48V38Q${x + 4} 32 ${x + 8} 38V48Z`} fill="var(--rs-scene-2)" opacity=".7" />)}
    <path d="M26 48H94V53H26Z" fill="var(--rs-scene)" />
    <path d="M20 53H100V58H20Z" fill="var(--rs-scene-2)" />
    {[30, 90].map(x => <g key={x}>
      <path d={`M${x - 7} 34C${x - 7} 28 ${x - 3} 26 ${x} 26C${x + 3} 26 ${x + 7} 28 ${x + 7} 34Z`} fill="var(--rs-scene)" />
      <path d={`M${x} 26V22`} stroke="var(--rs-gold-light)" strokeWidth="1" />
    </g>)}
    {[24, 96].map(x => <path key={x} d={`M${x - 6} 48C${x - 6} 40 ${x - 2} 36 ${x} 36C${x + 2} 36 ${x + 6} 40 ${x + 6} 48Z`} fill="var(--rs-scene)" />)}
  </g>
}

function LotusVase() {
  return <g>
    <path d="M52 40H68L72 46C72 54 66 58 60 58C54 58 48 54 48 46Z" fill="var(--rs-scene)" />
    <path d="M50 44H70" stroke="var(--rs-gold-light)" strokeWidth=".9" />
    <path d="M54 58H66V61H54Z" fill="var(--rs-scene-2)" />
    <path d="M60 40C60 30 58 22 60 14M60 40C54 32 46 30 40 24M60 40C66 32 74 30 80 24" fill="none" stroke="var(--rs-scene)" strokeWidth="1.4" />
    {([[60, 12, 1], [40, 22, .82], [80, 22, .82]] as const).map(([x, y, k]) => <g key={x} transform={`translate(${x} ${y}) scale(${k})`}>
      <path d="M0 0C-4-6-4-12 0-16C4-12 4-6 0 0Z" fill="var(--rs-scene-2)" />
      <path d="M0 0C-8-2-11-8-11-12C-6-12-2-8 0 0ZM0 0C8-2 11-8 11-12C6-12 2-8 0 0Z" fill="var(--rs-scene)" />
      <path d="M0 0C-12 1-16-3-17-6C-11-7-5-4 0 0ZM0 0C12 1 16-3 17-6C11-7 5-4 0 0Z" fill="var(--rs-scene-2)" opacity=".75" />
    </g>)}
    <path d="M46 33C40 33 36 36 34 40C40 41 44 38 46 33ZM74 33C80 33 84 36 86 40C80 41 76 38 74 33Z" fill="var(--rs-leaf)" />
  </g>
}

function Horse() {
  return <g>
    <path d="M13 22C7 23 4 30 6 40C8 34 10 30 14 28Z" fill="var(--rs-scene)" />
    <path d="M17 30L15 40L17 52H20L19 40L22 32Z" fill="var(--rs-scene)" />
    <path d="M23 31L24 41L22 52H25L28 41L28 32Z" fill="var(--rs-scene)" />
    <path d="M36 31L37 41L36 52H39L41 41L41 31Z" fill="var(--rs-scene)" />
    <path d="M41 29L47 34L50 40L53 39L49 32L43 26Z" fill="var(--rs-scene)" />
    <ellipse cx="29" cy="26" rx="16" ry="8.5" fill="var(--rs-scene)" />
    <path d="M38 23C40 16 43 11 47 7L53 10C49 15 46 21 44 29Z" fill="var(--rs-scene)" />
    <path d="M46 6C50 4 55 6 59 12C60 14 58 16 56 15C53 13 50 12 46 11Z" fill="var(--rs-scene)" />
    <path d="M47 6L48 1L50 5Z" fill="var(--rs-scene)" />
    <path d="M46 8C42 12 39 18 38 24" fill="none" stroke="var(--rs-scene-2)" strokeWidth="2" strokeLinecap="round" />
    <path d="M49 4C49 0 52 -2 54 0" fill="none" stroke="var(--rs-gold-light)" strokeWidth="1.2" />
    <circle cx="52" cy="9" r="1" fill="var(--rs-ivory)" />
    <path d="M47 11L56 14" stroke="var(--rs-gold-light)" strokeWidth=".9" />
    <path d="M21 19Q29 15 37 19L36 31Q29 34 22 31Z" fill="var(--rs-scene-2)" stroke="var(--rs-gold-light)" strokeWidth=".9" />
    {[23, 26.5, 30, 33.5].map(x => <circle key={x} cx={x} cy="33" r=".9" fill="var(--rs-gold-light)" />)}
  </g>
}

export type Scene = 'elephants' | 'peacocks' | 'pavilion' | 'lotus' | 'horses'
const pairs: Partial<Record<Scene, () => ReactNode>> = { elephants: Elephant, peacocks: Peacock, horses: Horse }

function SceneArt({ scene }: { scene: Scene }) {
  if (scene === 'pavilion') return <Pavilion />
  if (scene === 'lotus') return <LotusVase />
  const Figure = pairs[scene]!
  return <>
    <g transform="translate(-22 6)"><Figure /></g>
    <g transform="translate(142 6) scale(-1 1)"><Figure /></g>
    <g transform="translate(60 30)">
      <path d="M0-9L3-3L9 0L3 3L0 9L-3 3L-9 0L-3-3Z" fill="var(--rs-gold)" />
      <circle r="2" fill="var(--rs-gold-light)" />
    </g>
  </>
}

// A cusped cartouche, the frame of a miniature painting, holding one scene.
const lobes = 'M40 6C30 6 30 16 22 18C12 20 14 34 4 42C14 50 12 64 22 66C30 68 30 78 40 78'
const frame = lobes + 'H240C250 78 250 68 258 66C268 64 266 50 276 42C266 34 268 20 258 18C250 16 250 6 240 6Z'
export function Cartouche({ scene, className }: { scene: Scene; className?: string }) {
  const id = useId()
  return <svg className={className ?? 'rs-cartouche'} viewBox="0 0 280 84" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={id} cx="50%" cy="45%" r="65%">
        <stop offset="0" stopColor="var(--rs-cartouche-1)" /><stop offset="1" stopColor="var(--rs-cartouche-2)" />
      </radialGradient>
      <clipPath id={id + 'c'}><path d={frame} /></clipPath>
    </defs>
    <path d={frame} fill={`url(#${id})`} />
    <g clipPath={`url(#${id + 'c'})`}>
      <path d="M0 74Q140 64 280 74V84H0Z" fill="var(--rs-ground)" />
      <g transform="translate(80 8)"><SceneArt scene={scene} /></g>
    </g>
    <path d={frame} fill="none" stroke="var(--rs-gold)" strokeWidth="2" />
    <path d={frame} fill="none" stroke="var(--rs-gold-light)" strokeWidth=".7" transform="translate(140 42) scale(.93 .86) translate(-140 -42)" />
    {[[20, 42], [260, 42]].map(([x, y]) => <g key={x} transform={`translate(${x} ${y})`}>
      <path d="M0-6L4 0L0 6L-4 0Z" fill="var(--rs-gold)" /><circle r="1.4" fill="var(--rs-gold-light)" />
    </g>)}
  </svg>
}

// A short gold rule with a rosette, used inside sections.
export function Rule({ className }: { className?: string }) {
  return <svg className={className ?? 'rs-rule'} viewBox="0 0 200 20" aria-hidden="true" focusable="false">
    <g stroke="var(--rs-gold)" fill="none" strokeWidth="1">
      <path d="M6 10H78M122 10H194" />
      <path d="M40 7H78M122 13H160" opacity=".55" />
    </g>
    <g transform="translate(100 10)">
      {ring(8, angle => <path key={angle} d="M0-2C2-5 2-7 0-9C-2-7-2-5 0-2Z" fill="var(--rs-gold)" transform={`rotate(${angle})`} />)}
      <circle r="2.2" fill="var(--rs-accent)" stroke="var(--rs-gold-light)" strokeWidth=".6" />
    </g>
    <circle cx="84" cy="10" r="1.6" fill="var(--rs-gold)" /><circle cx="116" cy="10" r="1.6" fill="var(--rs-gold)" />
  </svg>
}

// A gold-leaf flourish for a panel corner (top left; CSS mirrors the others).
export function Corner({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <g fill="none" stroke="var(--rs-gold)" strokeWidth="1.2" strokeLinecap="round">
      <path d="M2 46V10Q2 2 10 2H46" />
      <path d="M8 40V14Q8 8 14 8H40" opacity=".6" />
      <path d="M14 14C22 14 26 20 22 24C19 27 15 24 17 21" />
    </g>
    <path d="M2 2L9 9" stroke="var(--rs-gold)" strokeWidth="1.2" />
    <circle cx="2.5" cy="2.5" r="2.5" fill="var(--rs-gold)" />
    <path d="M28 2C31 -1 35 -1 36 2C35 5 31 5 28 2ZM2 28C-1 31 -1 35 2 36C5 35 5 31 2 28Z" fill="var(--rs-accent)" />
  </svg>
}

// A gold mohur with a beaded rim, behind each countdown number.
export function Coin() {
  const id = useId()
  return <svg className="rs-coin-art" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={id} cx="36%" cy="30%" r="80%">
        <stop offset="0" stopColor="var(--rs-gold-light)" /><stop offset=".55" stopColor="var(--rs-gold)" /><stop offset="1" stopColor="var(--rs-gold-deep)" />
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="49" fill={`url(#${id})`} />
    <g transform="translate(50 50)" fill="var(--rs-gold-deep)" opacity=".75">
      {ring(36, angle => <circle key={angle} cy="-44" r="1.5" transform={`rotate(${angle})`} />)}
    </g>
    <circle cx="50" cy="50" r="39" fill="var(--rs-coin-face)" stroke="var(--rs-gold-deep)" strokeWidth="1" />
    <circle cx="50" cy="50" r="35" fill="none" stroke="var(--rs-gold)" strokeWidth=".7" strokeDasharray="2 2" />
  </svg>
}

// A scalloped jhalar fringe hung across the top of the opening.
export function Jhalar({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 48 34" aria-hidden="true" focusable="false">
    <path d="M0 0H48V8H0Z" fill="var(--rs-gold-deep)" />
    <path d="M0 8H48V12Q36 26 24 12Q12 26 0 12Z" fill="var(--rs-valance)" />
    <path d="M0 12Q12 26 24 12Q36 26 48 12" fill="none" stroke="var(--rs-gold)" strokeWidth="1.4" />
    <path d="M12 19V27M36 19V27" stroke="var(--rs-gold)" strokeWidth="1" />
    <circle cx="12" cy="29" r="2.6" fill="var(--rs-gold-light)" /><circle cx="36" cy="29" r="2.6" fill="var(--rs-gold-light)" />
    <path d="M0 4H48" stroke="var(--rs-gold-light)" strokeWidth=".8" strokeDasharray="2 3" />
  </svg>
}

// A single elephant for the opening's foreground.
export function ElephantSolo({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 -4 70 60" aria-hidden="true" focusable="false"><Elephant /></svg>
}

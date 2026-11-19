// Hand-built SVG artwork for the invitation. Everything is drawn from
// geometry and coloured through CSS custom properties, so one set of art
// serves every palette and stays sharp at any size.
import { useId } from 'react'
import type { EventIcon, InvitationSymbol } from './model'

type Point = [number, number]
const fixed = (n: number) => Math.round(n * 100) / 100

function quad(a: Point, c: Point, b: Point, t: number): Point {
  const u = 1 - t
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]
}

function petal(inner: number, outer: number, width: number) {
  const span = outer - inner
  return `M0 ${-inner}C${width} ${-(inner + span * 0.3)} ${width} ${-(outer - span * 0.25)} 0 ${-outer}` +
    `C${-width} ${-(outer - span * 0.25)} ${-width} ${-(inner + span * 0.3)} 0 ${-inner}Z`
}

const ring = (count: number, draw: (angle: number, index: number) => React.ReactNode) =>
  Array.from({ length: count }, (_, index) => draw((360 / count) * index, index))

export function Mandala({ className }: { className?: string }) {
  return <svg className={className} viewBox="-100 -100 200 200" aria-hidden="true" focusable="false">
    <g fill="none" stroke="currentColor" strokeWidth="1.1">
      <circle r="97" opacity=".55" /><circle r="90" />
      {ring(28, angle => <path key={angle} d={petal(60, 90, 9)} transform={`rotate(${angle})`} />)}
      {ring(56, angle => <circle key={angle} r="1.6" cy="-94" fill="currentColor" stroke="none" transform={`rotate(${angle})`} />)}
      <circle r="58" />
      {ring(14, angle => <path key={angle} d={petal(26, 56, 11)} transform={`rotate(${angle + 360 / 28})`} fill="currentColor" fillOpacity=".12" />)}
      {ring(14, angle => <path key={angle} d={petal(30, 48, 4.5)} transform={`rotate(${angle + 360 / 28})`} />)}
      <circle r="24" />
      {ring(10, angle => <path key={angle} d={petal(9, 22, 6)} transform={`rotate(${angle})`} fill="currentColor" fillOpacity=".2" />)}
      <circle r="7" fill="currentColor" fillOpacity=".35" />
    </g>
  </svg>
}

export function Rose({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const id = useId()
  return <svg className={className} style={style} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={id + 'p'} cx="45%" cy="40%" r="70%">
        <stop offset="0" stopColor="var(--inv-rose-light)" /><stop offset="1" stopColor="var(--inv-rose)" />
      </radialGradient>
      <linearGradient id={id + 'l'} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="var(--inv-leaf-light)" /><stop offset="1" stopColor="var(--inv-leaf)" />
      </linearGradient>
    </defs>
    <path d="M60 64C38 58 18 66 6 88C30 92 48 84 60 64Z" fill={`url(#${id}l)`} />
    <path d="M62 62C76 40 98 34 116 40C108 62 88 70 62 62Z" fill={`url(#${id}l)`} />
    <path d="M60 64C38 58 18 66 6 88M62 62C76 40 98 34 116 40" fill="none" stroke="var(--inv-leaf)" strokeWidth="1" opacity=".6" />
    {ring(6, angle => <circle key={angle} cx="60" cy="40" r="19" fill={`url(#${id}p)`} stroke="var(--inv-rose-deep)"
      strokeOpacity=".22" transform={`rotate(${angle} 60 60)`} />)}
    <circle cx="60" cy="60" r="24" fill={`url(#${id}p)`} stroke="var(--inv-rose-deep)" strokeOpacity=".25" />
    <path d="M60 60c3-1 5 2 4 5-1 4-7 5-10 2-4-4-2-11 4-13 7-2 13 3 13 10 0 8-8 13-16 12"
      fill="none" stroke="var(--inv-rose-deep)" strokeWidth="2.4" strokeLinecap="round" opacity=".6" />
  </svg>
}

export function Sprig({ className }: { className?: string }) {
  const leaves: [number, number, number][] = [[18, 70, -50], [30, 56, 40], [40, 44, -40], [52, 34, 35], [62, 24, -30], [72, 16, 30]]
  return <svg className={className} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <path d="M8 92C30 70 56 40 88 8" fill="none" stroke="var(--inv-leaf)" strokeWidth="1.6" />
    {leaves.map(([x, y, angle]) => <path key={x} d="M0 0C6-6 18-6 24 0C18 6 6 6 0 0Z" fill="var(--inv-leaf)" fillOpacity=".75"
      transform={`translate(${x} ${y}) rotate(${angle - 45})`} />)}
  </svg>
}

export function Divider({ className }: { className?: string }) {
  return <svg className={className ?? 'inv-divider'} viewBox="0 0 220 16" aria-hidden="true" focusable="false">
    <g fill="var(--inv-gold)" stroke="var(--inv-gold)">
      <path d="M8 8H86M134 8H212" strokeWidth=".9" fill="none" />
      <circle cx="90" cy="8" r="1.6" /><circle cx="130" cy="8" r="1.6" />
      <path d="M110 1L117 8L110 15L103 8Z" />
      <path d="M96 8C100 3 104 3 106 8C104 13 100 13 96 8ZM124 8C120 3 116 3 114 8C116 13 120 13 124 8Z" fillOpacity=".55" stroke="none" />
    </g>
  </svg>
}

export function Seal({ initials }: { initials: [string, string] }) {
  const id = useId()
  return <svg className="inv-seal-art" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={id + 'f'} cx="40%" cy="35%" r="75%">
        <stop offset="0" stopColor="#fffdf7" /><stop offset=".7" stopColor="#f6ecdb" /><stop offset="1" stopColor="#e8d6b6" />
      </radialGradient>
      <linearGradient id={id + 'r'} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="var(--inv-gold-light)" /><stop offset=".5" stopColor="var(--inv-gold)" /><stop offset="1" stopColor="var(--inv-gold-deep)" />
      </linearGradient>
    </defs>
    <circle cx="60" cy="60" r="58" fill={`url(#${id}r)`} />
    <circle cx="60" cy="60" r="51" fill={`url(#${id}f)`} />
    <circle cx="60" cy="60" r="46" fill="none" stroke="var(--inv-gold)" strokeWidth=".8" strokeDasharray="1.5 3" />
    <g transform="translate(60 60)">
      {ring(12, angle => <path key={angle} d={petal(38, 44, 2.5)} fill="var(--inv-gold)" fillOpacity=".55" transform={`rotate(${angle})`} />)}
    </g>
    <text x="41" y="68" textAnchor="middle" className="inv-seal-letter">{initials[0]}</text>
    <text x="60" y="64" textAnchor="middle" className="inv-seal-amp">&amp;</text>
    <text x="79" y="80" textAnchor="middle" className="inv-seal-letter">{initials[1]}</text>
  </svg>
}

function SymbolGlyph({ symbol }: { symbol: InvitationSymbol }) {
  if (symbol === 'om') return <text x="50" y="66" textAnchor="middle" className="inv-glyph">ॐ</text>
  if (symbol === 'shri') return <text x="50" y="63" textAnchor="middle" className="inv-glyph inv-glyph-shri">श्री</text>
  if (symbol === 'swastik') return <g transform="translate(30 30)" fill="none" stroke="var(--inv-sindoor)" strokeWidth="4.5" strokeLinecap="square">
    <path d="M20 20V2H34M20 20H38V34M20 20V38H6M20 20H2V6" />
    <g fill="var(--inv-sindoor)" stroke="none"><circle cx="10" cy="10" r="2.6" /><circle cx="30" cy="10" r="2.6" /><circle cx="30" cy="30" r="2.6" /><circle cx="10" cy="30" r="2.6" /></g>
  </g>
  return <g transform="translate(18 17)" fill="none" stroke="var(--inv-gold-deep)" strokeWidth="2" strokeLinecap="round"
    strokeLinejoin="round" color="var(--inv-gold-deep)"><EventGlyph icon="kalash" /></g>
}

export function Medallion({ symbol, large }: { symbol: InvitationSymbol; large?: boolean }) {
  const id = useId()
  return <svg className={'inv-medallion' + (large ? ' is-large' : '')} viewBox="0 0 100 100" role="img" aria-label={symbol}>
    <defs>
      <radialGradient id={id} cx="40%" cy="35%" r="75%">
        <stop offset="0" stopColor="var(--inv-gold-light)" /><stop offset=".65" stopColor="var(--inv-gold)" /><stop offset="1" stopColor="var(--inv-gold-deep)" />
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="48" fill={`url(#${id})`} />
    <circle cx="50" cy="50" r="41" fill="var(--inv-medallion-face)" />
    <circle cx="50" cy="50" r="44.5" fill="none" stroke="var(--inv-medallion-face)" strokeWidth=".8" strokeDasharray="1.2 2.6" />
    <SymbolGlyph symbol={symbol} />
  </svg>
}

// Function icons share one 64 × 64 grid. Strokes use the deep gold, fills use
// two accent tones so the set reads as one family.
function EventGlyph({ icon }: { icon: Exclude<EventIcon, ''> }) {
  const a = 'inv-ic-a', b = 'inv-ic-b'
  switch (icon) {
    case 'diya': return <>
      <path className={b} d="M32 9C37 17 39 22 32 29C25 22 27 17 32 9Z" />
      <path d="M32 29V34" />
      <path className={a} d="M10 34H54Q50 48 32 48Q14 48 10 34Z" />
      <path d="M8 34H56M26 48L24 54H40L38 48" />
      <path d="M18 39Q32 43 46 39" opacity=".6" />
    </>
    case 'kalash': return <>
      <ellipse className={b} cx="32" cy="15" rx="7" ry="8" />
      <path className={a} d="M23 25C14 21 9 23 6 28C13 29 18 28 23 25ZM41 25C50 21 55 23 58 28C51 29 46 28 41 25Z" />
      <path className={b} d="M22 24H42V30H22Z" />
      <path className={a} d="M22 30C12 40 15 56 32 56C49 56 52 40 42 30Z" />
      <path d="M17 41Q32 48 47 41M19 47Q32 53 45 47" opacity=".7" />
    </>
    case 'haldi': return <>
      <path className={a} d="M9 34H55Q52 53 32 53Q12 53 9 34Z" />
      <path className={b} d="M15 34Q32 18 49 34Z" />
      <path className={a} d="M46 21C51 12 58 12 60 13C58 21 52 24 46 21Z" />
      <path d="M46 21L40 27" />
      {[18, 26, 34, 42].map(x => <circle key={x} cx={x + 2} cy="44" r="1.4" fill="currentColor" stroke="none" />)}
    </>
    case 'mehendi': return <>
      <path className={a} d="M41 8L52 19L24 47L16 50L19 42Z" />
      <path d="M19 42L24 47M44 11L49 16" />
      <path className={b} d="M21 33C10 33 8 19 17 14C26 9 32 20 25 24C21 26 18 22 21 21" />
      {[[33, 44], [38, 50], [44, 55]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="1.8" fill="currentColor" stroke="none" />)}
    </>
    case 'sangeet': return <>
      <path className={a} d="M12 25Q32 19 52 25V45Q32 51 12 45Z" />
      <ellipse className={b} cx="12" cy="35" rx="4" ry="10" /><ellipse className={b} cx="52" cy="35" rx="4" ry="10" />
      <path d="M16 26L22 44L28 26L34 45L40 26L46 44" opacity=".75" />
      <path d="M44 6V15M44 6L52 4V12" /><circle cx="42" cy="15" r="2.2" fill="currentColor" stroke="none" /><circle cx="50" cy="12" r="2.2" fill="currentColor" stroke="none" />
    </>
    case 'baraat': {
      const scallops = Array.from({ length: 8 }, (_, i) => `q2.75 5 5.5 0`).join(' ')
      return <>
        <path className={a} d="M9 30Q32 4 55 30Z" />
        <path className={b} d={`M9 30 ${scallops}`} />
        <path d="M32 30V58M32 6V10M24 58H40" />
        <circle cx="32" cy="7" r="2.4" className={b} />
        {Array.from({ length: 9 }, (_, i) => <circle key={i} cx={9 + i * 5.75} cy="36" r="1.5" fill="currentColor" stroke="none" />)}
      </>
    }
    case 'varmala': {
      const flowers = Array.from({ length: 13 }, (_, i) => quad([14, 8], [32, 76], [50, 8], i / 12))
      return <>
        <path d="M14 8Q32 76 50 8" opacity=".5" />
        {flowers.map(([x, y], i) => <circle key={i} cx={fixed(x)} cy={fixed(y)} r="3.4" className={i % 2 ? b : a} />)}
        <path className={b} d="M32 46L36 52L32 58L28 52Z" />
      </>
    }
    case 'pheras': return <>
      <path className={b} d="M32 10C39 18 39 25 32 31C25 25 25 18 32 10Z" />
      <path className={b} d="M24 20C28 25 28 29 25 32C21 29 21 25 24 20ZM40 20C44 25 43 29 39 32C36 29 36 25 40 20Z" />
      <path className={a} d="M22 32H42V38H22Z" /><path className={a} d="M17 38H47V44H17Z" /><path className={a} d="M12 44H52V51H12Z" />
      <path d="M8 55H56" />
    </>
    case 'vidaai': return <>
      <path className={b} d="M17 23Q32 7 47 23Z" /><path d="M32 8V11" />
      <path className={a} d="M18 23H46V46H18Z" />
      <path d="M25 23V46M32 23V46M39 23V46M18 31H46M18 38H46" opacity=".55" />
      <path d="M4 30H60" strokeWidth="3" /><path d="M14 46H50L46 52H18Z" className={b} />
    </>
    case 'reception': return <>
      <g transform="rotate(-14 22 32)"><path className={a} d="M15 12H29Q29 30 22 30Q15 30 15 12Z" /><path d="M22 30V46M16 46H28" /></g>
      <g transform="rotate(14 42 32)"><path className={a} d="M35 12H49Q49 30 42 30Q35 30 35 12Z" /><path d="M42 30V46M36 46H48" /></g>
      <path className={b} d="M32 2L33.6 6.4L38 8L33.6 9.6L32 14L30.4 9.6L26 8L30.4 6.4Z" />
    </>
    case 'rings': return <>
      <circle cx="25" cy="39" r="13" /><circle cx="39" cy="39" r="13" />
      <path className={b} d="M39 17L44 22L39 27L34 22Z" /><path d="M36 26L39 27L42 26" />
    </>
    case 'dinner': return <>
      <circle className={a} cx="32" cy="36" r="23" /><circle cx="32" cy="36" r="18" opacity=".6" />
      {[[24, 29], [40, 29], [32, 44], [24, 41], [40, 41]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="4.6" className={b} />)}
    </>
  }
}

export function EventArt({ icon }: { icon: Exclude<EventIcon, ''> }) {
  return <svg className="inv-event-icon" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><EventGlyph icon={icon} /></g>
  </svg>
}

// One swag of a marigold toran. Rendered side by side to span the width.
function Swag({ flip }: { flip: boolean }) {
  const points = Array.from({ length: 15 }, (_, i) => quad([0, 6], [60, 52], [120, 6], i / 14))
  return <svg className="inv-swag" viewBox="0 0 120 78" aria-hidden="true" focusable="false">
    <path d="M0 4H120" stroke="var(--inv-gold-deep)" strokeWidth="1.4" />
    {points.map(([x, y], i) => <circle key={i} cx={fixed(x)} cy={fixed(y)} r="5.2"
      fill={(i + (flip ? 1 : 0)) % 2 ? 'var(--inv-marigold)' : 'var(--inv-marigold-deep)'} />)}
    {points.map(([x, y], i) => <circle key={'c' + i} cx={fixed(x)} cy={fixed(y)} r="1.4" fill="var(--inv-marigold-core)" opacity=".7" />)}
    <path d="M0 6C-5 18-4 30 0 40C4 30 5 18 0 6Z" fill="var(--inv-leaf)" />
    <path d="M60 33V48" stroke="var(--inv-gold-deep)" strokeWidth="1" />
    <path d="M60 48L65 56L60 70L55 56Z" fill="var(--inv-gold)" />
    <circle cx="60" cy="72" r="2.4" fill="var(--inv-marigold-deep)" />
  </svg>
}

export function Toran({ className }: { className?: string }) {
  return <div className={'inv-toran ' + (className ?? '')} aria-hidden="true">
    {Array.from({ length: 18 }, (_, i) => <Swag key={i} flip={i % 2 === 1} />)}
  </div>
}

export function Lantern() {
  const id = useId()
  return <svg viewBox="0 0 60 90" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={id + 'g'} cx="50%" cy="58%" r="60%"><stop offset="0" stopColor="#fff4c9" /><stop offset=".6" stopColor="#f8c76f" /><stop offset="1" stopColor="#e88f55" /></radialGradient>
      <radialGradient id={id + 'h'}><stop offset="0" stopColor="#ffe9a8" stopOpacity=".8" /><stop offset="1" stopColor="#ffe9a8" stopOpacity="0" /></radialGradient>
    </defs>
    <circle cx="30" cy="46" r="30" fill={`url(#${id}h)`} />
    <path d="M22 8H38L41 16H19Z" fill="#9a6236" />
    <path d="M19 16H41C50 30 50 52 44 68H16C10 52 10 30 19 16Z" fill={`url(#${id}g)`} stroke="#c98f4e" strokeWidth="1.2" />
    <path d="M30 16V68M23 16C19 32 19 52 21 68M37 16C41 32 41 52 39 68" fill="none" stroke="#c98f4e" strokeWidth=".8" opacity=".6" />
    <path d="M16 68H44L41 74H19Z" fill="#9a6236" /><path d="M30 74V84" stroke="#c98f4e" strokeWidth="1.4" />
  </svg>
}

export const Icon = {
  calendar: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" /></svg>,
  pin: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z" /><circle cx="12" cy="9" r="2.5" /></svg>,
  nav: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3 3 10.5l7.5 3 3 7.5L21 3Z" /></svg>,
  phone: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>,
  chat: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1.4-4A8 8 0 1 1 8 19.5L4 20Z" /></svg>,
  sparkle: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2 6.5L20.5 12 14 14l-2 7-2-7-6.5-2L10 9.5 12 3Z" /></svg>,
  soundOn: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></svg>,
  soundOff: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="M17 9l5 6M22 9l-5 6" /></svg>,
  hand: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11V5a1.5 1.5 0 0 1 3 0v5m0-1a1.5 1.5 0 0 1 3 0v2m0-1a1.5 1.5 0 0 1 3 0v4a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L4 15a1.5 1.5 0 0 1 2.4-1.8L9 15" /></svg>,
}

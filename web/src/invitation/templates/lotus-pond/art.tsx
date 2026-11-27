// Artwork for Lotus Pond, drawn in code and coloured through this template's
// custom properties (--lp-*), so one set of art serves every palette.
// Nothing here copies a real card or artwork.
import { useId } from 'react'
import type { CSSProperties } from 'react'
import { EventArt } from '../../art'
import type { InvitationSymbol } from '../../model'

const r1 = (n: number) => Math.round(n * 10) / 10
const rad = (deg: number) => deg * Math.PI / 180

// A pointed lotus petal standing on its base at (0, 0), tip upwards.
const petal = (h: number, w: number) =>
  `M0 0C${w} ${r1(-h * .28)} ${r1(w * .82)} ${r1(-h * .78)} 0 ${-h}C${r1(-w * .82)} ${r1(-h * .78)} ${-w} ${r1(-h * .28)} 0 0Z`

// Three layers of petals. Each petal rests near upright (a bud) and turns
// out to its own angle when the flower opens; the outer layer opens first.
const layers = [
  { cls: 'is-back', h: 56, w: 17, angles: [-80, 80, -58, 58] },
  { cls: 'is-mid', h: 66, w: 19, angles: [-38, 38, -16, 16] },
  { cls: 'is-front', h: 70, w: 22, angles: [-28, 28, 0] },
]

function LotusDefs({ id }: { id: string }) {
  return <defs>
    <linearGradient id={id + 'b'} x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stopColor="var(--lp-lotus-2)" /><stop offset="1" stopColor="var(--lp-lotus-1)" />
    </linearGradient>
    <linearGradient id={id + 'f'} x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stopColor="var(--lp-lotus-3)" /><stop offset=".55" stopColor="var(--lp-lotus-2)" /><stop offset="1" stopColor="var(--lp-lotus-1)" />
    </linearGradient>
    <radialGradient id={id + 'g'}>
      <stop offset="0" stopColor="var(--lp-pod)" stopOpacity=".9" /><stop offset="1" stopColor="var(--lp-pod)" stopOpacity="0" />
    </radialGradient>
  </defs>
}

// The flower itself as a group, based at (0, 0), about 160 wide and 72 tall.
function LotusPetals({ id }: { id: string }) {
  let n = 0
  return <g className="lp-petals">
    <ellipse className="lp-lotus-glow" cx="0" cy="-22" rx="30" ry="22" fill={`url(#${id}g)`} />
    {layers.map(layer => <g key={layer.cls} className={'lp-layer ' + layer.cls}>
      {layer.angles.map(angle => {
        const i = n++
        return <g key={angle} className="lp-petal" style={{ '--a': angle + 'deg', '--pi': i } as CSSProperties}>
          <path d={petal(layer.h, layer.w)} fill={`url(#${id}${layer.cls === 'is-back' ? 'b' : 'f'})`} stroke="var(--lp-lotus-line)" strokeWidth=".8" />
          <path d={`M0 -4Q1.5 ${r1(-layer.h * .5)} 0 ${-layer.h + 8}`} fill="none" stroke="var(--lp-lotus-vein)" strokeWidth=".9" strokeLinecap="round" />
        </g>
      })}
    </g>)}
  </g>
}

export function Lotus({ className, open = true }: { className?: string; open?: boolean }) {
  const id = useId()
  return <svg className={'lp-lotus ' + (className ?? '')} data-bloom={open ? 'open' : 'bud'} viewBox="-90 -82 180 90" aria-hidden="true" focusable="false">
    <LotusDefs id={id} />
    <LotusPetals id={id} />
  </svg>
}

// A lily pad seen from above: a disc with a notch and fine veins.
export function LilyPad({ className, notch = 300, style }: { className?: string; notch?: number; style?: CSSProperties }) {
  const id = useId()
  const r = 46, gap = 13
  const a = [Math.cos(rad(notch + gap)) * r, Math.sin(rad(notch + gap)) * r]
  const b = [Math.cos(rad(notch - gap)) * r, Math.sin(rad(notch - gap)) * r]
  const veins = Array.from({ length: 8 }, (_, i) => notch + 32 + i * 37)
  return <svg className={'lp-pad ' + (className ?? '')} style={style} viewBox="-50 -50 100 100" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={id} cx="42%" cy="40%" r="70%">
        <stop offset="0" stopColor="var(--lp-pad-1)" /><stop offset="1" stopColor="var(--lp-pad-2)" />
      </radialGradient>
    </defs>
    <path d={`M0 0L${r1(a[0])} ${r1(a[1])}A${r} ${r} 0 1 1 ${r1(b[0])} ${r1(b[1])}Z`} fill={`url(#${id})`} />
    <g stroke="var(--lp-pad-vein)" strokeWidth="1" strokeLinecap="round" opacity=".7">
      {veins.map(v => <path key={v} d={`M0 0L${r1(Math.cos(rad(v)) * 40)} ${r1(Math.sin(rad(v)) * 40)}`} />)}
    </g>
    <path d={`M${r1(a[0] * .93)} ${r1(a[1] * .93)}A${r * .93} ${r * .93} 0 1 1 ${r1(b[0] * .93)} ${r1(b[1] * .93)}`} fill="none"
      stroke="var(--lp-pad-vein)" strokeWidth=".8" opacity=".45" />
  </svg>
}

export function Dragonfly({ className }: { className?: string }) {
  return <svg className={'lp-dragonfly ' + (className ?? '')} viewBox="-34 -24 68 48" aria-hidden="true" focusable="false">
    <g className="lp-wings is-a" fill="var(--lp-wing)" stroke="var(--lp-wing-line)" strokeWidth=".6">
      <ellipse cx="2" cy="-11" rx="5" ry="13" transform="rotate(-20 2 -11)" />
      <ellipse cx="2" cy="11" rx="5" ry="13" transform="rotate(20 2 11)" />
    </g>
    <g className="lp-wings is-b" fill="var(--lp-wing)" stroke="var(--lp-wing-line)" strokeWidth=".6">
      <ellipse cx="9" cy="-10" rx="4.4" ry="12" transform="rotate(16 9 -10)" />
      <ellipse cx="9" cy="10" rx="4.4" ry="12" transform="rotate(-16 9 10)" />
    </g>
    <path d="M6 0L-30 -.9L-31 0L-30 .9Z" fill="var(--lp-dragon)" stroke="var(--lp-dragon)" strokeWidth="1.6" strokeLinejoin="round" />
    <ellipse cx="8" cy="0" rx="6" ry="3" fill="var(--lp-dragon)" />
    <circle cx="16" cy="0" r="3.2" fill="var(--lp-dragon)" />
    <circle cx="17" cy="-1.6" r="1.3" fill="var(--lp-wing)" /><circle cx="17" cy="1.6" r="1.3" fill="var(--lp-wing)" />
  </svg>
}

// Rings spreading on still water, flattened by perspective.
export function Rings({ className, count = 3 }: { className?: string; count?: number }) {
  return <svg className={'lp-rings ' + (className ?? '')} viewBox="-100 -40 200 80" aria-hidden="true" focusable="false">
    {Array.from({ length: count }, (_, i) => <ellipse key={i} className="lp-ring" style={{ '--ri': i } as CSSProperties}
      cx="0" cy="0" rx="96" ry="34" fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
  </svg>
}

// Reeds and a bulrush leaning in from a corner of the pond.
export function Reeds({ className }: { className?: string }) {
  const blades: [number, number, number][] = [[18, -150, 30], [34, -190, 10], [48, -120, -8], [60, -170, 26], [76, -100, 14], [10, -96, -20]]
  return <svg className={'lp-reeds ' + (className ?? '')} viewBox="0 -200 110 200" aria-hidden="true" focusable="false">
    {blades.map(([x, h, lean], i) => <path key={i} d={`M${x - 3} 0Q${x + lean * .3} ${h * .55} ${x + lean} ${h}Q${x + lean * .3 + 2} ${h * .5} ${x + 4} 0Z`}
      fill={i % 2 ? 'var(--lp-pad-2)' : 'var(--lp-pad-1)'} />)}
    <path d="M40 0Q42 -90 50 -160" fill="none" stroke="var(--lp-pad-2)" strokeWidth="2" />
    <rect x="45.5" y="-172" width="8" height="34" rx="4" fill="var(--lp-rush)" transform="rotate(9 49.5 -155)" />
  </svg>
}

// A small floating lotus between two lines, for dividers.
export function LotusRule({ className }: { className?: string }) {
  return <div className={'lp-rule ' + (className ?? '')} aria-hidden="true">
    <span /><Lotus className="lp-rule-lotus" /><span />
  </div>
}

// A wide pond strip for the venue: water, pads, two flowers and a dragonfly.
export function PondScene({ className }: { className?: string }) {
  const id = useId()
  return <svg className={'lp-scene ' + (className ?? '')} viewBox="0 0 400 130" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
    <LotusDefs id={id} />
    <ellipse cx="200" cy="112" rx="200" ry="20" fill="var(--lp-water-3)" opacity=".8" />
    <g fill="none" stroke="var(--lp-ring)" strokeWidth="1" opacity=".8">
      <ellipse cx="128" cy="108" rx="46" ry="7" /><ellipse cx="128" cy="108" rx="70" ry="11" opacity=".5" />
      <ellipse cx="282" cy="112" rx="38" ry="6" /><ellipse cx="282" cy="112" rx="58" ry="9" opacity=".5" />
    </g>
    {[[70, 112, 34, 300], [190, 118, 26, 200], [330, 108, 30, 250], [250, 122, 18, 30]].map(([x, y, s, n], i) =>
      <g key={i} transform={`translate(${x} ${y}) scale(${s / 46} ${s / 46 * .34})`}><LilyPadShape notch={n} /></g>)}
    <g transform="translate(128 106) scale(.62)" className="lp-scene-lotus"><LotusPetals id={id} /></g>
    <g transform="translate(282 110) scale(.42)" className="lp-scene-lotus"><LotusPetals id={id} /></g>
    <g transform="translate(214 46) rotate(-8) scale(.7)">
      <ellipse cx="2" cy="-10" rx="5" ry="13" transform="rotate(-20 2 -10)" fill="var(--lp-wing)" stroke="var(--lp-wing-line)" strokeWidth=".6" />
      <ellipse cx="2" cy="10" rx="5" ry="13" transform="rotate(20 2 10)" fill="var(--lp-wing)" stroke="var(--lp-wing-line)" strokeWidth=".6" />
      <path d="M6 0L-30 -.9L-31 0L-30 .9Z" fill="var(--lp-dragon)" stroke="var(--lp-dragon)" strokeWidth="1.6" />
      <ellipse cx="8" cy="0" rx="6" ry="3" fill="var(--lp-dragon)" /><circle cx="16" cy="0" r="3.2" fill="var(--lp-dragon)" />
    </g>
  </svg>
}

function LilyPadShape({ notch }: { notch: number }) {
  const r = 46, gap = 13
  const a = [Math.cos(rad(notch + gap)) * r, Math.sin(rad(notch + gap)) * r]
  const b = [Math.cos(rad(notch - gap)) * r, Math.sin(rad(notch - gap)) * r]
  return <>
    <path d={`M0 0L${r1(a[0])} ${r1(a[1])}A${r} ${r} 0 1 1 ${r1(b[0])} ${r1(b[1])}Z`} fill="var(--lp-pad-1)" />
    <path d={`M0 0L${r1(a[0] * .9)} ${r1(a[1] * .9)}A${r * .9} ${r * .9} 0 1 1 ${r1(b[0] * .9)} ${r1(b[1] * .9)}Z`} fill="var(--lp-pad-2)" opacity=".35" />
  </>
}

function Swastik() {
  return <svg viewBox="0 0 40 40" className="lp-symbol-glyph is-mark" aria-hidden="true">
    <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="square"><path d="M20 20V3H33M20 20H37V33M20 20V37H7M20 20H3V7" /></g>
    <g fill="currentColor"><circle cx="11" cy="11" r="2.3" /><circle cx="29" cy="11" r="2.3" /><circle cx="29" cy="29" r="2.3" /><circle cx="11" cy="29" r="2.3" /></g>
  </svg>
}

// One of the family's chosen symbols resting on an open flower seen from
// above. The symbols themselves come from content.
export function SymbolFlower({ symbol, large }: { symbol: InvitationSymbol; large?: boolean }) {
  const label = { om: 'Om', shri: 'Shri', swastik: 'Swastik', kalash: 'Kalash' }[symbol]
  return <span className={'lp-symbol' + (large ? ' is-large' : '')} role="img" aria-label={label}>
    <svg className="lp-symbol-art" viewBox="-50 -50 100 100" aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => <path key={i} d={petal(48, 11)} transform={`rotate(${i * 30 + 15})`} fill="var(--lp-lotus-2)" stroke="var(--lp-lotus-line)" strokeWidth=".7" />)}
      {Array.from({ length: 8 }, (_, i) => <path key={'i' + i} d={petal(40, 10)} transform={`rotate(${i * 45})`} fill="var(--lp-lotus-3)" stroke="var(--lp-lotus-line)" strokeWidth=".6" />)}
      <circle r="27" fill="var(--lp-card-solid)" stroke="var(--lp-pod)" strokeWidth="1.6" />
      <circle r="23" fill="none" stroke="var(--lp-pod)" strokeWidth=".6" strokeDasharray="1 2.4" />
    </svg>
    {symbol === 'om' && <span className="lp-symbol-glyph" lang="sa">ॐ</span>}
    {symbol === 'shri' && <span className="lp-symbol-glyph is-shri" lang="sa">श्री</span>}
    {symbol === 'swastik' && <Swastik />}
    {symbol === 'kalash' && <span className="lp-symbol-glyph is-art"><EventArt icon="kalash" /></span>}
  </span>
}

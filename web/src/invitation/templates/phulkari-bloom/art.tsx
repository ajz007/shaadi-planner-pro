// Phulkari Bloom artwork. Every motif is built from "satin stitch" diamonds:
// each diamond is four triangles filled with fine thread stripes that change
// direction quadrant by quadrant, the way silk floss catches the light on a
// hand-embroidered phulkari. Colours come from CSS classes so one set of art
// serves every palette.
import { useId } from 'react'
import type { CSSProperties } from 'react'
import type { InvitationSymbol } from '../../model'

export type Silk = 1 | 2 | 3 | 4 | 5
const silks: Silk[] = [1, 2, 3, 4, 5]

// Thread stripes for each silk colour, horizontal and vertical.
function Threads({ id }: { id: string }) {
  return <>{silks.map(silk => [0, 90].map(angle => <pattern key={silk + '-' + angle} id={`${id}s${silk}${angle ? 'v' : 'h'}`}
    width="2.6" height="2.6" patternUnits="userSpaceOnUse" patternTransform={angle ? 'rotate(90)' : undefined}>
    <rect width="2.6" height="2.6" className={'pb-silk-' + silk} />
    <rect width="2.6" height=".75" className="pb-thread-hi" />
    <rect y="2.2" width="2.6" height=".4" className="pb-thread-lo" />
  </pattern>))}</>
}

type Diamond = { x: number; y: number; r: number; silk: Silk; step: number }

// One satin-stitch diamond. Quadrants grow outward from the centre like
// thread being pulled through, so the stitching animation uses only transform.
function Stitched({ d, id, delay = 0 }: { d: Diamond; id: string; delay?: number }) {
  const { x, y, r } = d
  const c = `${x} ${y}`, t = `${x} ${y - r}`, rr = `${x + r} ${y}`, b = `${x} ${y + r}`, l = `${x - r} ${y}`
  const quads: [string, 'h' | 'v'][] = [[`M${c}L${t}L${rr}Z`, 'h'], [`M${c}L${rr}L${b}Z`, 'v'], [`M${c}L${b}L${l}Z`, 'h'], [`M${c}L${l}L${t}Z`, 'v']]
  return <g>
    {quads.map(([path, dir], q) => <path key={q} d={path} fill={`url(#${id}s${d.silk}${dir})`} className={'pb-q is-' + dir}
      style={{ transformOrigin: `${x}px ${y}px`, '--d': delay + d.step * 230 + q * 45 } as CSSProperties} />)}
    <path d={`M${t}L${rr}L${b}L${l}Z M${t}L${b} M${l}L${rr}`} className="pb-q-edge" style={{ '--d': delay + d.step * 230 + 120 } as CSSProperties} />
  </g>
}

const axis = (distance: number, r: number, silk: Silk, step: number): Diamond[] =>
  [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => ({ x: dx * distance, y: dy * distance, r, silk, step }))
const diagonal = (distance: number, r: number, silk: Silk, step: number): Diamond[] =>
  [[1, -1], [1, 1], [-1, 1], [-1, -1]].map(([dx, dy]) => ({ x: dx * distance, y: dy * distance, r, silk, step }))

const bloom: Diamond[] = [
  { x: 0, y: 0, r: 23, silk: 1, step: 0 },
  ...axis(38, 15, 2, 1), ...diagonal(27, 13, 3, 2),
  ...axis(64, 10, 1, 3), ...diagonal(40, 7, 5, 3),
  ...[[20, -60], [60, -20], [60, 20], [20, 60], [-20, 60], [-60, 20], [-60, -20], [-20, -60]].map(([x, y]) => ({ x, y, r: 6, silk: 2 as Silk, step: 4 })),
  ...axis(82, 6, 4, 4),
]
const diamondPath = (r: number) => `M0 ${-r}L${r} 0L0 ${r}L${-r} 0Z`

// The bagh: the large eight-way bloom at the heart of the design.
// state "traced" shows only the chalk outline; "stitch" plays the stitching;
// anything else shows the finished embroidery.
export function Bloom({ className, state }: { className?: string; state?: 'traced' | 'stitch' | 'done' }) {
  const id = useId().replace(/:/g, '')
  return <svg className={'pb-bloom ' + (className ?? '')} viewBox="-100 -100 200 200" data-state={state ?? 'done'} aria-hidden="true" focusable="false">
    <defs><Threads id={id} /></defs>
    <g className="pb-trace">
      <path d={diamondPath(96)} /><path d={diamondPath(88)} />
      {bloom.map((d, i) => <path key={i} d={diamondPath(d.r)} transform={`translate(${d.x} ${d.y})`} />)}
    </g>
    {bloom.map((d, i) => <Stitched key={i} d={d} id={id} />)}
    <path d={diamondPath(9)} fill={`url(#${id}s3v)`} className="pb-q" style={{ transformOrigin: '0 0', '--d': 160 } as CSSProperties} />
    <path d={diamondPath(3.5)} className="pb-silk-4 pb-q" style={{ transformOrigin: '0 0', '--d': 260 } as CSSProperties} />
    <path d={diamondPath(96)} className="pb-run is-outer" style={{ '--d': 1150 } as CSSProperties} />
    <path d={diamondPath(89)} className="pb-run is-inner" style={{ '--d': 1300 } as CSSProperties} />
  </svg>
}

// A small four-quadrant diamond, used as a scattered buti and on patches.
export function Buti({ className, silk = 1, style }: { className?: string; silk?: Silk; style?: CSSProperties }) {
  const id = useId().replace(/:/g, '')
  return <svg className={'pb-buti ' + (className ?? '')} viewBox="-12 -12 24 24" aria-hidden="true" focusable="false" style={style}>
    <defs><Threads id={id} /></defs>
    <Stitched d={{ x: 0, y: 0, r: 11, silk, step: 0 }} id={id} />
    <path d={diamondPath(3.4)} className="pb-silk-4" />
  </svg>
}

// A woven border band of triangles and diamonds, tiled to any width.
export function Band({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '')
  return <svg className={'pb-band ' + (className ?? '')} aria-hidden="true" focusable="false" width="100%" height="30">
    <defs>
      <Threads id={id} />
      <pattern id={id + 'band'} width="36" height="30" patternUnits="userSpaceOnUse">
        <rect width="36" height="30" className="pb-band-ground" />
        <path d="M0 26L9 6L18 26Z" fill={`url(#${id}s1v)`} />
        <path d="M18 4L27 24L36 4Z" fill={`url(#${id}s3v)`} />
        <path d="M18 26L22.5 19L27 26Z M0 4L4.5 11L9 4Z M27 4L31.5 11L36 4Z" fill={`url(#${id}s2h)`} />
        <path d="M9 15.5L11 13L13 15.5L11 18Z" className="pb-silk-4" />
        <path d="M0 1.5H36M0 28.5H36" className="pb-band-run" />
      </pattern>
    </defs>
    <rect width="100%" height="30" fill={`url(#${id}band)`} />
  </svg>
}

// A scattered field of small butis for the cloth blocks, tiled.
export function ButiField({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '')
  return <svg className={'pb-field ' + (className ?? '')} aria-hidden="true" focusable="false" width="100%" height="100%">
    <defs>
      <Threads id={id} />
      <pattern id={id + 'f'} width="96" height="96" patternUnits="userSpaceOnUse">
        <path d="M24 16L31 24L24 32L17 24Z" fill={`url(#${id}s1h)`} />
        <path d="M24 16L24 32M17 24L31 24" className="pb-field-line" />
        <path d="M72 64L79 72L72 80L65 72Z" fill={`url(#${id}s2v)`} />
        <path d="M72 64L72 80M65 72L79 72" className="pb-field-line" />
        <path d="M72 22l2 2-2 2-2-2Z M24 70l2 2-2 2-2-2Z" className="pb-silk-4" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill={`url(#${id}f)`} />
  </svg>
}

// A needle trailing its silk thread, for the opening.
export function Needle({ className }: { className?: string }) {
  return <svg className={'pb-needle ' + (className ?? '')} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
    <path d="M30 96C10 84 14 58 36 60C58 62 54 92 80 82C96 76 98 56 94 40" className="pb-needle-thread" />
    <g transform="rotate(38 94 40)">
      <path d="M94 4C96.4 4 97.2 9 97.2 18L95.2 76L94 82L92.8 76L90.8 18C90.8 9 91.6 4 94 4Z" className="pb-needle-steel" />
      <path d="M94 8.5C95 8.5 95.4 10 95.4 13S95 17.5 94 17.5 92.6 16 92.6 13 93 8.5 94 8.5Z" className="pb-needle-eye" />
      <path d="M92.4 22L93.4 70" className="pb-needle-shine" />
    </g>
  </svg>
}

// A dhol, drawn flat with its rope lacing.
export function Dhol({ className }: { className?: string }) {
  const laces = Array.from({ length: 7 }, (_, i) => 22 + i * 10)
  return <svg className={'pb-dhol ' + (className ?? '')} viewBox="0 0 120 80" aria-hidden="true" focusable="false">
    <path d="M14 8Q60 -2 106 8" className="pb-dhol-strap" />
    <path d="M18 16Q60 6 102 16V64Q60 74 18 64Z" className="pb-dhol-shell" />
    <path d="M18 16Q60 6 102 16V24Q60 14 18 24Z M18 56Q60 66 102 56V64Q60 74 18 64Z" className="pb-dhol-band" />
    <path d={laces.map((x, i) => `M${x} ${i % 2 ? 23 : 21}L${x + 5} 57L${x + 10} ${i % 2 ? 21 : 23}`).join('')} className="pb-dhol-lace" />
    <ellipse cx="18" cy="40" rx="8" ry="24" className="pb-dhol-skin" />
    <ellipse cx="102" cy="40" rx="8" ry="24" className="pb-dhol-skin" />
    <ellipse cx="18" cy="40" rx="8" ry="24" className="pb-dhol-rim" />
    <ellipse cx="102" cy="40" rx="8" ry="24" className="pb-dhol-rim" />
    <path d="M4 74L20 44M116 74L106 50" className="pb-dhol-stick" />
  </svg>
}

// The family's chosen symbol, set inside a stitched diamond tile.
export function SymbolTile({ symbol, large }: { symbol: InvitationSymbol; large?: boolean }) {
  const id = useId().replace(/:/g, '')
  const ring: Diamond[] = [{ x: 0, y: 0, r: 48, silk: 1, step: 0 }]
  return <svg className={'pb-symbol' + (large ? ' is-large' : '')} viewBox="-50 -50 100 100" role="img" aria-label={symbol}>
    <defs><Threads id={id} /></defs>
    {ring.map((d, i) => <Stitched key={i} d={d} id={id} />)}
    <path d={diamondPath(34)} className="pb-symbol-face" />
    <path d={diamondPath(30)} className="pb-symbol-run" />
    {symbol === 'om' && <text y="12" textAnchor="middle" className="pb-glyph">ॐ</text>}
    {symbol === 'shri' && <text y="9" textAnchor="middle" className="pb-glyph is-shri">श्री</text>}
    {symbol === 'swastik' && <g className="pb-glyph-line" transform="translate(-13 -13)">
      <path d="M13 13V1H22M13 13H25V22M13 13V25H4M13 13H1V4" />
      <g className="pb-glyph-dot"><circle cx="6.5" cy="6.5" r="1.8" /><circle cx="19.5" cy="6.5" r="1.8" /><circle cx="19.5" cy="19.5" r="1.8" /><circle cx="6.5" cy="19.5" r="1.8" /></g>
    </g>}
    {symbol === 'kalash' && <g className="pb-glyph-line" transform="translate(0 2)">
      <path d="M-7 -8C-12 -11 -15 -10 -17 -7C-13 -6 -10 -6 -7 -8ZM7 -8C12 -11 15 -10 17 -7C13 -6 10 -6 7 -8Z" className="pb-glyph-leaf" />
      <circle cy="-14" r="4.5" className="pb-glyph-fill" />
      <path d="M-7 -9H7V-5H-7Z" className="pb-glyph-fill" />
      <path d="M-7 -5C-15 2 -12 14 0 14C12 14 15 2 7 -5Z" className="pb-glyph-fill" />
      <path d="M-10 3Q0 7 10 3" />
    </g>}
  </svg>
}

// The zigzag running stitch where the cloth will part.
export function Seam({ className }: { className?: string }) {
  const points = Array.from({ length: 21 }, (_, i) => `${i * 5},${i % 2 ? 3 : 0}`).join(' ')
  return <svg className={'pb-seam ' + (className ?? '')} viewBox="0 0 100 3" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <polyline points={points} vectorEffect="non-scaling-stroke" />
  </svg>
}

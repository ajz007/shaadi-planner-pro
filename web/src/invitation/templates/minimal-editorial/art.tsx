// Ivory Editorial draws almost nothing: a typographic monogram, symbols set
// in ink inside a hairline ring, and a set of fine single-line function marks
// on a 24 × 24 grid. Everything takes its colour from currentColor.
import type { EventIcon, InvitationSymbol } from '../../model'

const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.15, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

// Two initials split by a hairline diagonal inside a thin square.
export function Monogram({ initials, className }: { initials: [string, string]; className?: string }) {
  return <span className={'me-mono ' + (className ?? '')} aria-hidden="true">
    <span className="me-mono-a">{initials[0]}</span>
    <span className="me-mono-b">{initials[1]}</span>
  </span>
}

export function SymbolMark({ symbol, large }: { symbol: InvitationSymbol; large?: boolean }) {
  const label = { om: 'Om', shri: 'Shri', swastik: 'Swastik', kalash: 'Kalash' }[symbol]
  return <span className={'me-symbol' + (large ? ' is-large' : '')} role="img" aria-label={label}>
    {symbol === 'om' && <span className="me-symbol-glyph" lang="sa" aria-hidden="true">ॐ</span>}
    {symbol === 'shri' && <span className="me-symbol-glyph is-shri" lang="sa" aria-hidden="true">श्री</span>}
    {symbol === 'swastik' && <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path {...line} strokeWidth={1.6} strokeLinecap="square" d="M12 12V5h5M12 12h7v5M12 12v7H7M12 12H5V7" />
      <g fill="currentColor"><circle cx="8.3" cy="8.3" r=".9" /><circle cx="15.7" cy="8.3" r=".9" /><circle cx="15.7" cy="15.7" r=".9" /><circle cx="8.3" cy="15.7" r=".9" /></g>
    </svg>}
    {symbol === 'kalash' && <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g {...line}><KalashLines /></g></svg>}
  </span>
}

function KalashLines() {
  return <>
    <circle cx="12" cy="5.2" r="1.9" />
    <path d="M10.2 7.2C8.4 6.4 7 6.8 6 8M13.8 7.2c1.8-.8 3.2-.4 4.2.8" />
    <path d="M9 8.6h6M9.6 8.6v1.6h4.8V8.6" />
    <path d="M9.6 10.2C6.6 11.6 5.8 15.4 7.6 18c1.4 2 7.4 2 8.8 0 1.8-2.6 1-6.4-2-7.8" />
    <path d="M7 14.6h10" />
  </>
}

function Glyph({ icon }: { icon: Exclude<EventIcon, ''> }) {
  switch (icon) {
    case 'diya': return <>
      <path d="M12 3.5c2 2.4 2.2 4.4 0 6.2-2.2-1.8-2-3.8 0-6.2Z" />
      <path d="M3.5 12.5h17c-.8 3.6-4 5.8-8.5 5.8s-7.7-2.2-8.5-5.8Z" />
      <path d="M10 18.3l-.6 2.2h5.2l-.6-2.2" />
    </>
    case 'kalash': return <KalashLines />
    case 'haldi': return <>
      <path d="M3.5 12h17a8.5 7 0 0 1-17 0Z" />
      <path d="M8 19.4h8" />
      <circle cx="9" cy="8.4" r="1.3" /><circle cx="12.6" cy="6.4" r="1.3" /><circle cx="15.4" cy="9" r="1.3" />
    </>
    case 'mehendi': return <>
      <path d="M4.5 19.5l2.6-6.6 8.6-8.6a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3l-8.6 8.6-6.6 2.6Z" />
      <path d="M7.1 12.9l4 4M14 6l4 4" />
      <circle cx="4" cy="20" r=".6" fill="currentColor" />
    </>
    case 'sangeet': return <>
      <path d="M4.5 8.2C9.5 6.6 14.5 6.6 19.5 8.2v7.6c-5 1.6-10 1.6-15 0Z" />
      <path d="M4.5 8.2v7.6M19.5 8.2v7.6M9 7.2v9.6M15 7.2v9.6" />
      <path d="M2.5 12h2M19.5 12h2" />
    </>
    case 'baraat': return <>
      <path d="M3 12.5a9 7.5 0 0 1 18 0Z" />
      <path d="M7.5 12.5a4.5 7.5 0 0 1 9 0" />
      <path d="M12 12.5v6.2a1.8 1.8 0 0 1-3.6 0M12 3.6V5" />
    </>
    case 'varmala': return <>
      <path d="M6 3.5c0 9.5 12 9.5 12 0" />
      {[[6.4, 6.6], [8.2, 10], [12, 11.6], [15.8, 10], [17.6, 6.6]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.35" />)}
      <path d="M12 13v3M10.6 19.5l1.4-3.5 1.4 3.5" />
    </>
    case 'pheras': return <>
      <path d="M12 3.6c3 2.8 4 5.8 1.6 9.2.4-1.8-.8-3-1.6-3.6-.4 1.6-2 2.2-2 3.6-2-2.6-1.2-6.2 2-9.2Z" />
      <path d="M4.5 15h15l-2 5h-11Z" />
      <path d="M7 15l1-2h8l1 2" />
    </>
    case 'vidaai': return <>
      <path d="M7 9.5h10v8H7Z" />
      <path d="M6 9.5l6-4.5 6 4.5" />
      <path d="M2.5 13h4.5M17 13h4.5M10 17.5v-4h4v4" />
    </>
    case 'reception': return <>
      <path d="M5.5 4.5h4.6l-.6 4.8a1.7 1.7 0 0 1-3.4 0Z" transform="rotate(-12 8 8)" />
      <path d="M13.9 4.5h4.6l-.6 4.8a1.7 1.7 0 0 1-3.4 0Z" transform="rotate(12 16 8)" />
      <path d="M7.4 11.3l1 7M16.6 11.3l-1 7M6 18.6h4.4M13.6 18.6H18" />
      <path d="M12 2.5v1.6M10.4 3.3h3.2" />
    </>
    case 'rings': return <>
      <circle cx="9" cy="14.5" r="5" /><circle cx="15" cy="14.5" r="5" />
      <path d="M15 5.5l1.6 1.6L15 8.7l-1.6-1.6Z" />
    </>
    case 'dinner': return <>
      <circle cx="12" cy="12" r="5.6" /><circle cx="12" cy="12" r="3.4" />
      <path d="M3.4 4.6v4a1.4 1.4 0 0 0 2.8 0v-4M4.8 8.6v10.8" />
      <path d="M20.4 4.6c-1.4.9-2 2.8-2 5.6h2v9.2" />
    </>
  }
}

export function AgendaMark({ icon }: { icon: Exclude<EventIcon, ''> }) {
  return <svg className="me-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g {...line}><Glyph icon={icon} /></g></svg>
}

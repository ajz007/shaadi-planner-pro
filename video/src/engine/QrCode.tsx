// A QR code drawn as SVG, generated synchronously so it is ready on the
// first frame. Used for "scan to RSVP" or "scan to buy" end cards.
import { useMemo } from 'react'
import QR from 'qrcode'

export function QrCode({ value, size, color = '#000', background = '#fff' }: { value: string; size: number; color?: string; background?: string }) {
  const path = useMemo(() => {
    const { modules } = QR.create(value, { errorCorrectionLevel: 'M' })
    let d = ''
    for (let y = 0; y < modules.size; y++)
      for (let x = 0; x < modules.size; x++)
        if (modules.get(x, y)) d += `M${x} ${y}h1v1h-1z`
    return { d, size: modules.size }
  }, [value])
  const quiet = 2
  const box = path.size + quiet * 2
  return <svg width={size} height={size} viewBox={`${-quiet} ${-quiet} ${box} ${box}`} shapeRendering="crispEdges" role="img" aria-label={'QR code for ' + value}>
    <rect x={-quiet} y={-quiet} width={box} height={box} fill={background} rx={1.5} />
    <path d={path.d} fill={color} />
  </svg>
}

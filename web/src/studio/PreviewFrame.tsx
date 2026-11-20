import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PreviewDraft, PreviewMessage, StudioMessage } from '../invitation/InvitationPreview'
import type { SectionKey } from '../invitation/model'

type Device = 'phone' | 'desktop'
type Outgoing = StudioMessage extends infer M ? M extends StudioMessage ? Omit<M, 'source'> : never : never
const devices: Record<Device, { width: number; height: number; label: string }> = {
  phone: { width: 390, height: 820, label: 'Phone' },
  desktop: { width: 1280, height: 800, label: 'Desktop' },
}

// The live preview runs the real guest page inside an iframe. Designs use
// full-screen openings, lock scrolling and bring their own fonts and styles,
// so they need their own document; the iframe gets the draft by postMessage.
export function PreviewFrame({ draft, focus, label = 'Live preview' }: { draft: PreviewDraft; focus?: SectionKey; label?: string }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const ready = useRef(false)
  const [device, setDevice] = useState<Device>('phone')
  const [scale, setScale] = useState(1)
  const size = devices[device]

  const send = (message: Outgoing) => {
    if (ready.current) frame.current?.contentWindow?.postMessage({ source: 'shaadi-studio', ...message }, window.location.origin)
  }

  useEffect(() => {
    const receive = (event: MessageEvent<PreviewMessage>) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || event.data?.source !== 'shaadi-preview') return
      ready.current = true
      send({ type: 'draft', draft })
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  })

  // Typing updates the preview after a short pause instead of on every key.
  useEffect(() => {
    const timer = window.setTimeout(() => send({ type: 'draft', draft }), 200)
    return () => clearTimeout(timer)
  }, [draft]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (focus) send({ type: 'focus', section: focus }) }, [focus]) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const element = stage.current
    if (!element) return
    const fit = () => setScale(Math.min(1, element.clientWidth / size.width, (window.innerHeight - 220) / size.height))
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(element)
    window.addEventListener('resize', fit)
    return () => { observer.disconnect(); window.removeEventListener('resize', fit) }
  }, [size.width, size.height])

  return <section className="studio-preview" aria-label={label}>
    <div className="studio-preview-bar">
      <div className="studio-segmented" role="group" aria-label="Preview size">
        {(Object.keys(devices) as Device[]).map(key => <button key={key} type="button" aria-pressed={device === key}
          onClick={() => { ready.current = false; setDevice(key) }}>{devices[key].label}</button>)}
      </div>
      <button type="button" className="focus-secondary" onClick={() => send({ type: 'replay' })}>Replay opening</button>
    </div>
    <div className="studio-stage" ref={stage}>
      <div className="studio-device-box" style={{ width: size.width * scale, height: size.height * scale }}>
        <div className={'studio-device is-' + device} style={{ width: size.width, height: size.height, transform: `scale(${scale})` }}>
          <iframe key={device} ref={frame} src="/invitation-preview?embed" title={label} width={size.width} height={size.height} />
        </div>
      </div>
    </div>
  </section>
}

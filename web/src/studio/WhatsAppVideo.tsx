import { useCallback, useEffect, useState } from 'react'
import { useWorkspaceData } from '../WorkspaceData'

type Kind = 'save-the-date' | 'invite'
type Language = 'english' | 'hindi' | 'tamil' | 'telugu'
type Video = { kind: Kind; language: Language; status: 'rendering' | 'ready' | 'failed'; progress: number; hasFile: boolean; bytes: number; requestedAt: string; finishedAt?: string }
type State = { enabled: boolean; published: boolean; videos: Video[] }

const kinds: { kind: Kind; title: string; hint: string }[] = [
  { kind: 'save-the-date', title: 'Save-the-date', hint: '15 seconds · the couple and the date' },
  { kind: 'invite', title: 'Invitation', hint: '30 seconds · blessing, couple, functions and an RSVP reminder' },
]
const languages: { value: Language; label: string }[] = [
  { value: 'english', label: 'English' }, { value: 'hindi', label: 'हिंदी' }, { value: 'tamil', label: 'தமிழ்' }, { value: 'telugu', label: 'తెలుగు' },
]
const busy = (video?: Video) => video?.status === 'rendering'
const sizeLabel = (bytes: number) => (bytes / 1048576).toFixed(1) + ' MB'

// Vertical MP4s made from the published invitation, for WhatsApp chats,
// Status and Instagram. A worker renders them in the background; this panel
// asks for a video, polls until it is ready, then plays, downloads or shares it.
// Renders run on AWS Lambda and usually take under a minute.
export function WhatsAppVideo({ path, publishedAt, weddingName, photoHref }: { path: string; publishedAt?: string; weddingName: string; photoHref: string }) {
  const { request } = useWorkspaceData()
  const [state, setState] = useState<State>()
  const [language, setLanguage] = useState<Language>('english')
  const [error, setError] = useState('')
  const [sharing, setSharing] = useState<Kind>()
  const [starting, setStarting] = useState<Kind>()
  const base = path + '/videos'

  const load = useCallback(async (signal?: AbortSignal) => {
    const next = await request<State>(base, undefined, signal)
    setState(next)
    return next
  }, [base, request])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal).then(next => {
      const last = next.videos.find(video => video.kind === 'invite') ?? next.videos[0]
      if (last) setLanguage(last.language)
    }).catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not load videos.') })
    return () => controller.abort()
  }, [load])

  // Poll while a video is being made.
  const pending = state?.videos.some(busy)
  useEffect(() => {
    if (!pending) return
    const timer = setInterval(() => { load().catch(() => undefined) }, 4000)
    return () => clearInterval(timer)
  }, [pending, load])

  async function make(kind: Kind) {
    setError('')
    setStarting(kind)
    try {
      await request(base, { kind, language })
      await load()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not start the video.') }
    finally { setStarting(undefined) }
  }

  const fileURL = (video: Video, mode?: 'download' | 'share') => '/api/workspace' + base + '/' + video.kind +
    '?v=' + encodeURIComponent(video.finishedAt ?? video.requestedAt) + (mode ? '&' + mode + '=1' : '')

  // On phones, share the MP4 itself so WhatsApp gets a playable video.
  async function share(video: Video) {
    setError('')
    setSharing(video.kind)
    try {
      const response = await fetch(fileURL(video, 'share'))
      if (!response.ok) throw new Error('Could not load the video.')
      const name = (weddingName.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'wedding') + '-' + video.kind + '.mp4'
      const file = new File([await response.blob()], name, { type: 'video/mp4' })
      await navigator.share({ files: [file] })
    } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === 'AbortError')) setError('Sharing didn’t work on this device. Download the video and send it from WhatsApp.')
    } finally { setSharing(undefined) }
  }
  const canShareFiles = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [new File([''], 'test.mp4', { type: 'video/mp4' })] })

  return <section className="focus-card studio-video" aria-labelledby="studio-video-title">
    <p className="studio-video-badge">Included with your Family Pass</p>
    <h2 id="studio-video-title">WhatsApp videos</h2>
    <p>Vertical videos of your published invitation for WhatsApp chats, Status and Instagram. Send the video to everyone, then each guest’s
      own RSVP link as you do now: the video asks guests to reply using that link.</p>
    {!state ? <p role="status">{error || 'Loading videos…'}</p> : !state.enabled
      ? <p className="studio-video-note">WhatsApp videos aren’t switched on yet. They’ll appear here soon.</p>
      : !state.published
      ? <p className="studio-video-note">Publish the invitation first. Videos use what guests see.</p>
      : <>
        <label className="focus-field studio-video-language">Words in the video
          <select value={language} onChange={event => setLanguage(event.target.value as Language)}>
            {languages.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <small>Changes the fixed words and dates. Names, functions and venues appear as you typed them.</small>
        </label>
        <div className="studio-video-grid">
          {kinds.map(({ kind, title, hint }) => {
            const video = state.videos.find(item => item.kind === kind)
            const outdated = video?.finishedAt && publishedAt && new Date(publishedAt) > new Date(video.finishedAt)
            return <article key={kind} className="studio-video-item" data-kind={kind}>
              <h3>{title}</h3>
              <p className="studio-video-hint">{hint}</p>
              {video?.hasFile && <video className="studio-video-player" src={fileURL(video)} controls playsInline preload="metadata" />}
              {busy(video) && <p className="studio-video-status" role="status"><span className="studio-video-spinner" aria-hidden="true" />
                Making your video{video && video.progress > 0 ? ' · ' + Math.round(video.progress * 100) + '%' : ''}. This usually takes under a minute.</p>}
              {video?.status === 'failed' && <p className="studio-video-status" role="alert">We couldn’t make this video. Try again.</p>}
              {outdated && !busy(video) && <p className="studio-video-status">Made before your latest publish. Make it again to include the changes.</p>}
              <div className="focus-actions">
                <button type="button" className={video?.hasFile ? 'focus-secondary' : undefined} disabled={busy(video) || starting === kind} onClick={() => void make(kind)}>
                  {busy(video) || starting === kind ? 'Making…' : video?.hasFile ? 'Make again' : 'Make video'}</button>
                {video?.hasFile && <a className={canShareFiles ? 'focus-secondary' : undefined} href={fileURL(video, 'download')}>
                  Download · {sizeLabel(video.bytes)}</a>}
                {video?.hasFile && canShareFiles && <button type="button" disabled={sharing === kind} onClick={() => void share(video)}>
                  {sharing === kind ? 'Opening…' : 'Share to WhatsApp'}</button>}
              </div>
            </article>
          })}
        </div>
        <p className="inv-editor-hint">The couple photo comes from <a href={photoHref}>Guest RSVP → Customize the wedding page</a>.
          After you change the invitation, publish and make the video again.</p>
      </>}
    {error && state && <p role="alert">{error}</p>}
  </section>
}

import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { Plan } from './Workspace'
import { useWorkspaceData } from './WorkspaceData'
import { WeddingInvitationHeader, weddingDay } from './GuestWeddingPage'
import type { GuestPage } from './GuestWeddingPage'

type PageSettings = GuestPage & { revision: number }
type ScheduleLink = { id: string; date: string; functionId: string; expiresAt: string }
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Try again.'

export function whatsappShare(message: string, url: string) {
  return 'https://wa.me/?text=' + encodeURIComponent(message + '\n\n' + url)
}

async function prepareCover(file: File): Promise<string> {
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a photo smaller than 20 MB.')
  const image = await createImageBitmap(file).catch(() => { throw new Error('Choose a JPG, PNG, or WebP photo.') })
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  try {
    if (!context) throw new Error('Could not prepare the cover photo.')
    for (const maxSide of [1440, 1100, 850, 640]) {
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const encoded = canvas.toDataURL('image/jpeg', 0.82).split(',')[1]
      if (encoded.length <= Math.floor(160 * 1024 / 3) * 4) return encoded
    }
  } finally {
    image.close()
  }
  throw new Error('Could not reduce this photo enough. Try a smaller image.')
}

export function WorkspaceGuestPage({ path, wedding, functions }: {
  path: string; wedding: Plan['wedding']; functions: Plan['functions']
}) {
  const { request } = useWorkspaceData()
  const [page, setPage] = useState<PageSettings>()
  const [coverEdited, setCoverEdited] = useState(false)
  const [pageBusy, setPageBusy] = useState(false)
  const [pageError, setPageError] = useState('')
  const [pageNotice, setPageNotice] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    request<PageSettings>(path + '/page', undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) setPage(result) })
      .catch(error => { if (!controller.signal.aborted) setPageError(errorText(error)) })
    return () => controller.abort()
  }, [path, request])

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    setPageBusy(true)
    setPageError('')
    setPageNotice('')
    try {
      const photo = await prepareCover(file)
      setPage(current => current && { ...current, design: { ...current.design, coverPhoto: photo } })
      setCoverEdited(true)
    } catch (error) { setPageError(errorText(error)) }
    finally { setPageBusy(false); input.value = '' }
  }
  async function savePage(event: FormEvent) {
    event.preventDefault()
    if (!page) return
    setPageBusy(true)
    setPageError('')
    setPageNotice('')
    try {
      const { coverPhoto, ...design } = page.design
      const result = await request<{ revision: number }>(path + '/page', {
        ...design, revision: page.revision, ...(coverEdited && (coverPhoto ? { coverPhoto } : { removePhoto: true })),
      })
      setPage({ ...page, revision: result.revision })
      setCoverEdited(false)
      setPageNotice('Guest page saved. Existing wedding links now show this design.')
    } catch (error) { setPageError(errorText(error)) }
    finally { setPageBusy(false) }
  }
  return <>
    <details className="focus-card guest-page-editor">
      <summary>Customize the wedding page</summary>
      <p>Your cover, welcome message, and style appear on RSVP and shared schedule links.</p>
      {pageError && <p role="alert">{pageError}</p>}
      {pageNotice && <p role="status">{pageNotice}</p>}
      {page && <form onSubmit={event => void savePage(event)}>
        <fieldset className="workspace-fields" disabled={pageBusy}>
          <label className="focus-field">Names or page heading<input maxLength={120} placeholder={page.name} value={page.design.heading}
            onChange={event => setPage({ ...page, design: { ...page.design, heading: event.target.value } })} /></label>
          <label className="focus-field">Welcome message<textarea maxLength={600} rows={3} value={page.design.welcome}
            onChange={event => setPage({ ...page, design: { ...page.design, welcome: event.target.value } })} /></label>
          <label className="focus-field">Style<select value={page.design.theme} onChange={event =>
            setPage({ ...page, design: { ...page.design, theme: event.target.value === 'rose' ? 'rose' : 'marigold' } })}>
            <option value="marigold">Marigold</option><option value="rose">Rose Garden</option>
          </select></label>
          <label className="focus-field">Cover photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void choosePhoto(event)} /></label>
          <div className="focus-actions">
            <button>{pageBusy ? 'Working…' : 'Save wedding page'}</button>
            {page.design.coverPhoto && <button type="button" className="focus-secondary" onClick={() => {
              setCoverEdited(true); setPage({ ...page, design: { ...page.design, coverPhoto: undefined } }); setPageNotice('')
            }}>Remove photo</button>}
          </div>
        </fieldset>
        <WeddingInvitationHeader page={page} label="Guest preview" preview />
      </form>}
    </details>
    <ScheduleLinks path={path + '/schedule'} wedding={wedding} functions={functions} />
  </>
}

function ScheduleLinks({ path, wedding, functions }: { path: string; wedding: Plan['wedding']; functions: Plan['functions'] }) {
  const { request } = useWorkspaceData()
  const [links, setLinks] = useState<ScheduleLink[]>([])
  const [addresses, setAddresses] = useState<Record<string, string>>({})
  const [scope, setScope] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const days = [...new Set(functions.map(fn => weddingDay(fn.startsAt, wedding.timeZone)))].sort()
  useEffect(() => {
    const controller = new AbortController()
    request<ScheduleLink[]>(path, undefined, controller.signal)
      .then(rows => { if (!controller.signal.aborted) setLinks(rows) })
      .catch(error => { if (!controller.signal.aborted) setError(errorText(error)) })
    return () => controller.abort()
  }, [path, request])

  async function change(id?: string) {
    setBusy(true)
    setError('')
    try {
      if (id) await request<void>(path + '/' + id, {})
      else {
        const [kind, value] = scope.split(':')
        const created = await request<{ id: string; url: string }>(path, kind === 'day' ? { date: value } : kind === 'function' ? { functionId: value } : {})
        setAddresses(current => ({ ...current, [created.id]: created.url }))
      }
      setLinks(await request<ScheduleLink[]>(path))
    } catch (error) { setError(errorText(error)) }
    finally { setBusy(false) }
  }
  return <details className="focus-card guest-page-editor">
    <summary>Share a read-only schedule</summary>
    <p>Anyone with this link can see the selected functions, venues, and cover. Use it in group chats. Household replies and arrival plans stay private.</p>
    {error && <p role="alert">{error}</p>}
    {functions.length > 0 ? <div className="focus-actions">
      <label className="focus-field">Include<select value={scope} onChange={event => setScope(event.target.value)}>
        <option value="">All wedding functions</option>
        {days.map(day => <option key={day} value={'day:' + day}>{day}</option>)}
        {functions.map(fn => <option key={fn.id} value={'function:' + fn.id}>{fn.name} · {weddingDay(fn.startsAt, wedding.timeZone)}</option>)}
      </select></label>
      <button type="button" disabled={busy} onClick={() => void change()}>Create schedule link</button>
    </div> : <p>Add a function before creating a schedule link.</p>}
    {links.map(link => {
      const address = addresses[link.id]
      return <div className="rsvp-link" key={link.id}>
        <strong>{functions.find(fn => fn.id === link.functionId)?.name ?? (link.date || 'Whole wedding')}</strong>
        <p>Expires {weddingDay(link.expiresAt, wedding.timeZone)}</p>
        {address && <label className="focus-field">Schedule link<input readOnly value={address} onFocus={event => event.target.select()} /></label>}
        <div className="focus-actions">
          {address && <><a href={address} target="_blank" rel="noreferrer">Open schedule</a>
            <a href={whatsappShare('Here’s the schedule for ' + wedding.name + '.', address)} target="_blank" rel="noreferrer">Share on WhatsApp</a></>}
          <button className="focus-secondary" type="button" disabled={busy} onClick={() => {
            if (window.confirm('Revoke this schedule link?')) void change(link.id)
          }}>Revoke link</button>
        </div>
      </div>
    })}
  </details>
}

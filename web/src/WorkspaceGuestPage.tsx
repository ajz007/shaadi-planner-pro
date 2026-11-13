import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { Plan } from './Workspace'
import { useWorkspaceData } from './WorkspaceData'
import { WeddingInvitationHeader, weddingDay } from './GuestWeddingPage'
import type { GuestPage } from './GuestWeddingPage'

type PageSettings = GuestPage & { revision: number }
type ScheduleLink = { id: string; date: string; functionId: string; familyFunctionIds: string[]; expiresAt: string; url: string }
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

export function WorkspaceGuestPage({ path, wedding, functions, onSavedDesign }: {
  path: string; wedding: Plan['wedding']; functions: Plan['functions']; onSavedDesign: (page: GuestPage) => void
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
      .then(result => {
        if (controller.signal.aborted) return
        setPage(result)
        onSavedDesign(result)
      })
      .catch(error => { if (!controller.signal.aborted) setPageError(errorText(error)) })
    return () => controller.abort()
  }, [path, request, onSavedDesign])

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
      onSavedDesign(page)
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
  const [scope, setScope] = useState('')
  const [familyIds, setFamilyIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const days = [...new Set(functions.map(fn => weddingDay(fn.startsAt, wedding.timeZone)))].sort()
  const [kind, value] = scope.split(':')
  const inScope = functions.filter(fn => kind === 'day' ? weddingDay(fn.startsAt, wedding.timeZone) === value
    : kind === 'function' ? fn.id === value : true)
  const familyOptions = inScope.filter(fn => fn.familyOnly)
  const selectedFamily = familyOptions.filter(fn => familyIds.includes(fn.id)).map(fn => fn.id)
  const hasEvents = inScope.some(fn => !fn.familyOnly) || selectedFamily.length > 0
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
    setNotice('')
    try {
      if (id) await request<void>(path + '/' + id, {})
      else {
        const selection = kind === 'day' ? { date: value } : kind === 'function' ? { functionId: value } : {}
        await request(path, { ...selection, familyFunctionIds: selectedFamily })
      }
      setLinks(await request<ScheduleLink[]>(path))
      if (!id) setNotice('The schedule link is ready below.')
    } catch (error) { setError(errorText(error)) }
    finally { setBusy(false) }
  }
  return <details className="focus-card guest-page-editor">
    <summary>Share a read-only schedule</summary>
    <p>Guest functions appear by default. Include family-only functions only for a group you want to share them with. Anyone with the link can view its schedule.</p>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {functions.length > 0 ? <div>
      <label className="focus-field">Schedule scope<select value={scope} onChange={event => {
        setScope(event.target.value)
        setFamilyIds([])
      }}>
        <option value="">All guest functions</option>
        {days.map(day => <option key={day} value={'day:' + day}>{day}</option>)}
        {functions.map(fn => <option key={fn.id} value={'function:' + fn.id}>{fn.name} · {weddingDay(fn.startsAt, wedding.timeZone)}{fn.familyOnly && ' · Family only'}</option>)}
      </select></label>
      {familyOptions.length > 0 && <fieldset className="rsvp-picker-days">
        <legend>Also include family-only functions</legend>
        {familyOptions.map(fn => <label key={fn.id} className="rsvp-picker-day">
          <input type="checkbox" checked={familyIds.includes(fn.id)} onChange={event => {
            setFamilyIds(current => event.target.checked ? [...current, fn.id] : current.filter(id => id !== fn.id))
          }} />
          <span>{fn.name}<small>{weddingDay(fn.startsAt, wedding.timeZone)}</small></span>
        </label>)}
      </fieldset>}
      {!hasEvents && <p>Select a family-only function to share, or choose a scope with guest functions.</p>}
      <button type="button" disabled={busy || !hasEvents} onClick={() => void change()}>Get schedule link</button>
    </div> : <p>Add a function before creating a schedule link.</p>}
    {links.map(link => {
      const address = link.url
      return <div className="rsvp-link" key={link.id}>
        <strong>{functions.find(fn => fn.id === link.functionId)?.name ?? (link.date || 'All guest functions')}</strong>
        {!!link.familyFunctionIds?.length && <p>Family-only functions added: {functions.filter(fn => link.familyFunctionIds.includes(fn.id)).map(fn => fn.name).join(', ') || 'None remain'}</p>}
        <p>Expires {weddingDay(link.expiresAt, wedding.timeZone)}</p>
        <label className="focus-field">Schedule link<input readOnly value={address} onFocus={event => event.target.select()} /></label>
        <div className="focus-actions">
          <button type="button" className="focus-secondary" onClick={event => {
            const input = event.currentTarget.closest('.rsvp-link')?.querySelector('input')
            const selectLink = () => { input?.focus(); input?.select() }
            if (navigator.clipboard) void navigator.clipboard.writeText(address).then(() => setNotice('Schedule link copied.')).catch(selectLink)
            else selectLink()
          }}>Copy link</button>
          <a href={address} target="_blank" rel="noreferrer">Open schedule</a>
          <a href={whatsappShare('Here’s the schedule for ' + wedding.name + '.', address)} target="_blank" rel="noreferrer">Share on WhatsApp</a>
          <button className="focus-secondary" type="button" disabled={busy} onClick={() => {
            if (window.confirm('Revoke this schedule link?')) void change(link.id)
          }}>Revoke link</button>
        </div>
      </div>
    })}
  </details>
}

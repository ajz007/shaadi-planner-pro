import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { functionLocalTime } from './WorkspacePlanning'
import './guest-wedding.css'

export type GuestPageDesign = { heading: string; welcome: string; theme: 'marigold' | 'rose'; coverPhoto?: string }
export type GuestPage = { name: string; date: string; timeZone: string; design: GuestPageDesign }
export type GuestTravel = {
  guestId: string; guest: string; arrivalDate: string; arrivalTime: string; pickup: string; stay: string; revision: number; updatedAt?: string
}
type ReplyStatus = 'attending' | 'declined'
type Invitation = {
  id: string; guest: string; guestId: string; function: string; functionId: string; startsAt: string; venue?: string
  status: 'pending' | ReplyStatus; revision: number
}
type GuestData = GuestPage & { invitations: Invitation[]; travel: GuestTravel[] }
type Event = { name: string; startsAt: string; venue: string; mapUrl: string }
type Schedule = GuestPage & { events: Event[] }

export const weddingDay = (startsAt: string, zone: string) => functionLocalTime(startsAt, zone).split('T')[0]
const formatDay = (date: string) => new Intl.DateTimeFormat('en-IN', {
  weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
}).format(new Date(date + 'T00:00:00Z'))
const shortDay = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const formatCoverDate = new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeZone: 'UTC' })
const formatTime = (time: string, zone: string) =>
  new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: zone }).format(new Date(time))
const replyLabels = { pending: 'Awaiting reply', attending: 'Attending', declined: 'Can’t attend' }
const photoSource = (photo: string) => 'data:image/jpeg;base64,' + photo

export function WeddingInvitationHeader({ page, label, preview }: { page: GuestPage; label: string; preview?: boolean }) {
  const Title = preview ? 'h3' : 'h1'
  const hasPhoto = !!page.design.coverPhoto
  return <header className={'invite-cover' + (hasPhoto ? ' invite-cover-photo' : '')} data-theme={page.design.theme}>
    {page.design.coverPhoto && <img src={photoSource(page.design.coverPhoto)} alt="" />}
    <div className="invite-cover-copy">
      <p className="invite-label">{label}</p>
      <Title>{page.design.heading || page.name}</Title>
      <p className="invite-date">{formatCoverDate.format(new Date(page.date + 'T00:00:00Z'))}</p>
      {page.design.welcome && <p className="invite-welcome">{page.design.welcome}</p>}
    </div>
  </header>
}

async function pageRequest<T>(route: 'guest-rsvp' | 'guest-schedule', token: string, input?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/' + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
    body: JSON.stringify({ token, ...input }), signal,
  })
  if (response.status === 204) return undefined as T
  if (response.status === 404) throw new Error('This link has expired or is unavailable. Ask the organizer for a new link.')
  if (response.status === 409) throw new Error('These plans changed. Reload the page to see the latest replies.')
  if (!response.ok) throw new Error('Could not complete the request. Check the details and try again.')
  return response.json()
}

export function LiveGuestRSVP({ token, initialDay, initialFunction }: { token: string; initialDay: string; initialFunction: string }) {
  const [data, setData] = useState<GuestData>()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<Record<string, ReplyStatus>>({})
  const [day, setDay] = useState(initialDay)
  const [functionId, setFunction] = useState(initialFunction)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    pageRequest<GuestData>('guest-rsvp', token, undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) setData(result) })
      .catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [token, reload])

  function setReplies(rows: Invitation[], status: ReplyStatus) {
    setNotice('')
    setDraft(current => {
      const next = { ...current }
      for (const row of rows) {
        if (row.status === status) delete next[row.id]
        else next[row.id] = status
      }
      return next
    })
  }
  async function saveReplies() {
    if (!data) return
    const replies = data.invitations.filter(row => draft[row.id]).map(row => ({ id: row.id, revision: row.revision, status: draft[row.id] }))
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await pageRequest('guest-rsvp', token, { replies })
      setData({ ...data, invitations: data.invitations.map(row => draft[row.id] ? {
        ...row, status: draft[row.id], revision: row.revision + 1,
      } : row) })
      setDraft({})
      setNotice('RSVP saved. You can update your answers here.')
    } catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  async function saveTravel(travel: GuestTravel) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await pageRequest('guest-rsvp', token, { travel })
      setData(current => current && { ...current, travel: current.travel.map(row => row.guestId === travel.guestId ? {
        ...travel, revision: travel.revision + 1,
      } : row) })
      setNotice('Arrival plans saved for ' + travel.guest + '.')
    } catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  const invitations = data?.invitations ?? []
  const days = data ? [...new Set(invitations.map(row => weddingDay(row.startsAt, data.timeZone)))].sort() : []
  const functions = [...new Map(invitations.map(row => [row.functionId, row.function])).entries()]
  const visible = data ? invitations.filter(row => (!days.includes(day) || weddingDay(row.startsAt, data.timeZone) === day) &&
    (!functions.some(([id]) => id === functionId) || row.functionId === functionId)) : []
  const activeFilter = visible.length !== invitations.length
  const changes = Object.keys(draft).length
  return <main className="guest-wedding-page" data-theme={data?.design.theme}>
    {data ? <WeddingInvitationHeader page={data} label="You’re invited" /> : <h1>Wedding invitation</h1>}
    {!data && !error && <p role="status">Opening your invitation…</p>}
    {data && <>
      <nav className="invite-page-nav" aria-label="Wedding invitation">
        <button type="button" onClick={() => document.getElementById('attendance')?.scrollIntoView()}>RSVP</button>
        <button type="button" onClick={() => document.getElementById('arrival')?.scrollIntoView()}>Arrival plans</button>
      </nav>
      <section className="invite-panel" id="attendance">
        <h2>Will you join us?</h2>
        <p>Reply for everyone on this invitation. You can come back to change your plans.</p>
        <div className="invite-toolbar">
          <label>Day<select value={days.includes(day) ? day : ''} onChange={event => { setDay(event.target.value); setFunction('') }}>
            <option value="">All days</option>{days.map(date => <option key={date} value={date}>{shortDay.format(new Date(date + 'T00:00:00Z'))}</option>)}
          </select></label>
          <label>Function<select value={functions.some(([id]) => id === functionId) ? functionId : ''}
            onChange={event => { setFunction(event.target.value); setDay('') }}>
            <option value="">All functions</option>{functions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select></label>
        </div>
        <div className="invite-actions">
          <button type="button" className="invite-secondary" disabled={busy} onClick={() => setReplies(visible, 'attending')}>
            {activeFilter ? 'Attend all shown' : 'Attend all invited events'}
          </button>
          <button type="button" className="invite-secondary" disabled={busy} onClick={() => setReplies(visible, 'declined')}>
            {activeFilter ? 'Decline all shown' : 'Decline all invited events'}
          </button>
        </div>
        {data.travel.map(person => {
          const events = visible.filter(row => row.guestId === person.guestId)
          if (!events.length) return null
          return <section className="invite-person" key={person.guestId}><h3>{person.guest}</h3>
            {events.map(row => <div className="invite-event" key={row.id}>
              <div><strong>{row.function}</strong>
                <small>{formatDay(weddingDay(row.startsAt, data.timeZone))} · {formatTime(row.startsAt, data.timeZone)}</small>
                {row.venue && <small>{row.venue}</small>}
              </div>
              <div className="invite-reply">
                <span className="invite-reply-status">{replyLabels[draft[row.id] ?? row.status]}{draft[row.id] ? ' · Unsaved' : ''}</span>
                <div className="invite-actions">{(['attending', 'declined'] as const).map(status =>
                  <button key={status} type="button" className="invite-secondary" disabled={busy}
                    aria-label={replyLabels[status] + ' · ' + row.guest + ' · ' + row.function}
                    aria-pressed={(draft[row.id] ?? row.status) === status}
                    onClick={() => setReplies([row], status)}>{replyLabels[status]}</button>)}</div>
              </div>
            </div>)}
          </section>
        })}
        <div className="invite-actions invite-save">
          <button type="button" disabled={busy || !changes} onClick={() => void saveReplies()}>Save RSVP{changes ? ' (' + changes + ')' : ''}</button>
          {changes > 0 && <button type="button" className="invite-secondary" disabled={busy} onClick={() => setDraft({})}>Undo changes</button>}
        </div>
      </section>
      <section className="invite-panel" id="arrival">
        <h2>Arrival plans</h2>
        <p>Share what you know. You can update the details when your travel is confirmed.</p>
        {data.travel.map(person => <TravelForm key={person.guestId} person={person} busy={busy} save={saveTravel} />)}
      </section>
    </>}
    {notice && <p role="status" className="invite-feedback">{notice}</p>}
    {error && <p role="alert" className="invite-feedback">{error} <button type="button" className="invite-secondary" onClick={() => {
      setError(''); setNotice(''); setDraft({}); setData(undefined); setReload(value => value + 1)
    }}>Reload page</button></p>}
  </main>
}

function TravelForm({ person, busy, save }: { person: GuestTravel; busy: boolean; save: (value: GuestTravel) => Promise<void> }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const get = (key: string) => String(fields.get(key) ?? '')
    void save({ ...person, arrivalDate: get('arrivalDate'), arrivalTime: get('arrivalDate') ? get('arrivalTime') : '', pickup: get('pickup'), stay: get('stay') })
  }
  return <form className="invite-person" onSubmit={submit}>
    <h3>{person.guest}</h3>
    <fieldset className="invite-toolbar" disabled={busy}>
      <label>Arrival date<input type="date" name="arrivalDate" defaultValue={person.arrivalDate} /></label>
      <label>Approximate arrival time<input type="time" name="arrivalTime" defaultValue={person.arrivalTime} /></label>
      <label>Need a pickup?<select name="pickup" defaultValue={person.pickup}>
        <option value="">Not sure yet</option><option value="yes">Yes</option><option value="no">No</option>
      </select></label>
      <label>Need accommodation?<select name="stay" defaultValue={person.stay}>
        <option value="">Not sure yet</option><option value="yes">Yes</option><option value="no">No</option>
      </select></label>
      <button className="invite-secondary">Save arrival plans</button>
    </fieldset>
  </form>
}

export function LiveWeddingSchedule({ token }: { token: string }) {
  const [data, setData] = useState<Schedule>()
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    pageRequest<Schedule>('guest-schedule', token, undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) setData(result) })
      .catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [token])
  const days = data ? [...new Set(data.events.map(row => weddingDay(row.startsAt, data.timeZone)))] : []
  return <main className="guest-wedding-page" data-theme={data?.design.theme}>
    {data ? <WeddingInvitationHeader page={data} label="Wedding schedule" /> : <h1>Wedding schedule</h1>}
    {!data && !error && <p role="status">Opening the schedule…</p>}
    {error && <p role="alert">{error}</p>}
    {data && <section className="invite-panel">
      <h2>What’s planned</h2>
      {!days.length && <p>No functions are currently scheduled for this link.</p>}
      {days.map(day => <section key={day} className="invite-person"><h3>{formatDay(day)}</h3>
        {data.events.filter(row => weddingDay(row.startsAt, data.timeZone) === day).map((row, index) =>
          <div className="invite-event" key={row.startsAt + ':' + index}>
            <div><strong>{row.name}</strong><small>{formatTime(row.startsAt, data.timeZone)}{row.venue && ' · ' + row.venue}</small></div>
            {row.mapUrl && <a href={row.mapUrl} rel="noreferrer" target="_blank">Open map</a>}
          </div>)}
      </section>)}
    </section>}
  </main>
}

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
type ReplyDraft = Partial<Record<string, ReplyStatus>>
type Invitation = {
  id: string; guest: string; guestId: string; function: string; functionId: string; startsAt: string; venue?: string
  status: 'pending' | ReplyStatus; revision: number
}
type GuestData = GuestPage & { invitations: Invitation[]; travel: GuestTravel[] }
type Event = { name: string; startsAt: string; venue: string; mapUrl: string }
type Schedule = GuestPage & { events: Event[] }

export const weddingDay = (startsAt: string, zone: string) => functionLocalTime(startsAt, zone).split('T')[0]
export const formatDay = (date: string) => new Intl.DateTimeFormat('en-IN', {
  weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
}).format(new Date(date + 'T00:00:00Z'))
const formatCoverDate = new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeZone: 'UTC' })
const formatTime = (time: string, zone: string) =>
  new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: zone }).format(new Date(time))
const replyLabels = { pending: 'Awaiting reply', attending: 'Attending', declined: 'Can’t attend' }
const photoSource = (photo: string) => 'data:image/jpeg;base64,' + photo

function focusedInvitations(data: GuestData, day: string, functionId: string) {
  const rows = functionId ? data.invitations.filter(row => row.functionId === functionId)
    : day ? data.invitations.filter(row => weddingDay(row.startsAt, data.timeZone) === day) : []
  return rows.length ? rows : data.invitations
}

function invitationsByDay(rows: Invitation[], timeZone: string) {
  const days = new Map<string, Invitation[]>()
  for (const row of rows) {
    const day = weddingDay(row.startsAt, timeZone)
    const entries = days.get(day) ?? []
    entries.push(row)
    days.set(day, entries)
  }
  return [...days].sort(([left], [right]) => left.localeCompare(right))
}

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
  const [draft, setDraft] = useState<ReplyDraft>({})
  const [showFullInvitation, setShowFullInvitation] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    pageRequest<GuestData>('guest-rsvp', token, undefined, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return
        const rows = focusedInvitations(result, initialDay, initialFunction)
        const defaults: ReplyDraft = {}
        if (rows.every(row => row.status === 'pending')) {
          for (const row of rows) defaults[row.id] = 'attending'
        }
        setDraft(defaults)
        setData(result)
      })
      .catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [token, initialDay, initialFunction, reload])

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
    const replies = data.invitations.flatMap(row => {
      const status = draft[row.id]
      return status ? [{ id: row.id, revision: row.revision, status }] : []
    })
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await pageRequest('guest-rsvp', token, { replies })
      setData({ ...data, invitations: data.invitations.map(row => {
        const status = draft[row.id]
        return status ? { ...row, status, revision: row.revision + 1 } : row
      }) })
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
  function undoReplies(rows: Invitation[]) {
    setNotice('')
    setDraft(current => {
      const next = { ...current }
      for (const row of rows) delete next[row.id]
      return next
    })
  }
  const visible = data ? showFullInvitation ? data.invitations : focusedInvitations(data, initialDay, initialFunction) : []
  const days = data ? invitationsByDay(visible, data.timeZone) : []
  const activeFilter = data && visible.length !== data.invitations.length
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
        <p>Confirm the days that work for your household. Open a day to change plans for a guest or function.</p>
        {activeFilter && <button type="button" className="invite-secondary" onClick={() => setShowFullInvitation(true)}>Show full invitation</button>}
        {days.map(([day, rows]) => <AttendanceDay key={day} day={day} rows={rows} zone={data.timeZone}
          draft={draft} busy={busy} setReplies={setReplies} undoReplies={undoReplies} />)}
        <div className="invite-actions invite-save">
          <button type="button" disabled={busy || !changes} onClick={() => void saveReplies()}>{busy ? 'Saving…' : 'Confirm RSVP'}</button>
          {changes > 0 && <button type="button" className="invite-secondary" disabled={busy} onClick={() => undoReplies(visible)}>Clear unsaved choices</button>}
        </div>
      </section>
      <section className="invite-panel" id="arrival">
        <h2>Arrival plans</h2>
        <p>Share what you know. You can update the details when your travel is confirmed.</p>
        {data.travel.map(person => <details key={person.guestId} className="invite-travel">
          <summary>{person.guest} <small>{person.arrivalDate ? formatDay(person.arrivalDate) : 'Arrival date pending'}</small></summary>
          <TravelForm person={person} busy={busy} save={saveTravel} />
        </details>)}
      </section>
    </>}
    {notice && <p role="status" className="invite-feedback">{notice}</p>}
    {error && <p role="alert" className="invite-feedback">{error} <button type="button" className="invite-secondary" onClick={() => {
      setError(''); setNotice(''); setDraft({}); setShowFullInvitation(false); setData(undefined); setReload(value => value + 1)
    }}>Reload page</button></p>}
  </main>
}

function AttendanceDay({ day, rows, zone, draft, busy, setReplies, undoReplies }: {
  day: string; rows: Invitation[]; zone: string; draft: ReplyDraft; busy: boolean
  setReplies: (rows: Invitation[], status: ReplyStatus) => void; undoReplies: (rows: Invitation[]) => void
}) {
  const guests = new Map<string, Invitation[]>()
  for (const row of rows) {
    const group = guests.get(row.guestId) ?? []
    group.push(row)
    guests.set(row.guestId, group)
  }
  const functions = [...new Map([...rows].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map(row => [row.functionId, row.function])).values()]
  const statusOf = (row: Invitation) => draft[row.id] ?? row.status
  const allAttending = rows.every(row => statusOf(row) === 'attending')
  const allDeclined = rows.every(row => statusOf(row) === 'declined')
  const hasDraft = rows.some(row => draft[row.id])
  const waiting = rows.every(row => statusOf(row) === 'pending')
  return <section className="invite-day" aria-labelledby={'rsvp-day-' + day}>
    <h3 id={'rsvp-day-' + day}>{formatDay(day)}</h3>
    <p className="invite-day-functions">{functions.join(' · ')}</p>
    <p>{[...guests.values()].map(events => events[0].guest).join(', ')}</p>
    <p className="invite-reply-status">{hasDraft ? 'Confirm to save these choices'
      : allAttending || allDeclined ? 'Reply saved' : waiting ? 'Awaiting reply' : 'Individual replies'}</p>
    <div className="invite-actions">
      <button type="button" className="invite-secondary" aria-pressed={allAttending} disabled={busy}
        onClick={() => setReplies(rows, 'attending')}>Everyone attending</button>
      <button type="button" className="invite-secondary" aria-pressed={allDeclined} disabled={busy}
        onClick={() => setReplies(rows, 'declined')}>No one attending</button>
      {hasDraft && rows.every(row => row.status === 'pending') &&
        <button type="button" className="invite-secondary" disabled={busy} onClick={() => undoReplies(rows)}>Decide later</button>}
    </div>
    <details className="invite-day-details">
      <summary>Adjust by guest or function</summary>
      {[...guests.entries()].map(([guestId, events]) => <div className="invite-person" key={guestId}>
        <h4>{events[0].guest}</h4>
        <div className="invite-actions">
          <button type="button" className="invite-secondary" aria-pressed={events.every(row => statusOf(row) === 'attending')}
            disabled={busy} onClick={() => setReplies(events, 'attending')}>Attend this day</button>
          <button type="button" className="invite-secondary" aria-pressed={events.every(row => statusOf(row) === 'declined')}
            disabled={busy} onClick={() => setReplies(events, 'declined')}>Skip this day</button>
        </div>
        <details className="invite-day-details">
          <summary>{events.length === 1 ? 'Function details' : 'Choose individual functions'}</summary>
          {events.map(row => <div className="invite-event" key={row.id}>
            <div><strong>{row.function}</strong><small>{formatTime(row.startsAt, zone)}{row.venue && ' · ' + row.venue}</small></div>
            <div>
              <span className="invite-reply-status">{replyLabels[statusOf(row)]}</span>
              <div className="invite-actions">{(['attending', 'declined'] as const).map(status =>
                <button key={status} type="button" className="invite-secondary" disabled={busy}
                  aria-label={replyLabels[status] + ' · ' + row.guest + ' · ' + row.function}
                  aria-pressed={statusOf(row) === status} onClick={() => setReplies([row], status)}>{replyLabels[status]}</button>)}</div>
            </div>
          </div>)}
        </details>
      </div>)}
    </details>
  </section>
}

function TravelForm({ person, busy, save }: { person: GuestTravel; busy: boolean; save: (value: GuestTravel) => Promise<void> }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const get = (key: string) => String(fields.get(key) ?? '')
    void save({ ...person, arrivalDate: get('arrivalDate'), arrivalTime: get('arrivalDate') ? get('arrivalTime') : '', pickup: get('pickup'), stay: get('stay') })
  }
  return <form onSubmit={submit}>
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

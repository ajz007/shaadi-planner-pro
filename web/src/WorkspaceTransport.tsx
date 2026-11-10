import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { PrintSection } from './PlanActions'
import { VoiceField, VoiceNotice } from './VoiceField'
import type { Guest } from './WorkspaceGuests'
import { localDay, shownDate } from './WorkspaceGuests'
import { PlaceDetails } from './WorkspacePlanning'
import type { Place } from './WorkspacePlanning'

type Arrival = { date: string; time: string; mode: string; transport: string }
type Passenger = { id: string; name: string; arrival: Arrival; reviewed: Arrival }
type Pickup = {
  id: string; date: string; time: string; pickupPoint: string; dropPoint: string; vehicle: string
  vehicleNumber: string; driver: string; ownerId: string; owner: string; status: string
  driverConfirmed: string; notes: string; revision: number; passengers: Passenger[]; needsReview: boolean
  pickupPlaceId: string; dropPlaceId: string; pickupDetail: string; dropDetail: string
}
type Editor = { pickup?: Pickup; guestIds: string[]; date: string; time: string }
const statusOptions = ['Planned', 'Pending', 'Confirmed', 'Completed', 'Cancelled']
const fields = [
  ['date', 'Pickup date', 'date'], ['time', 'Pickup time', 'time'], ['pickupPoint', 'Pickup point', 'text'],
  ['dropPoint', 'Drop-off point', 'text'], ['vehicle', 'Vehicle', 'text'], ['vehicleNumber', 'Vehicle number', 'text'],
  ['driver', 'Driver', 'text'], ['notes', 'Notes', 'text'],
] as const
const arrivalLabels: Record<keyof Arrival, string> = {
  date: 'Arrival date', time: 'Arrival time', mode: 'Arrival mode', transport: 'Transport required',
}

const groupArrival = (guest: Guest) => [shownDate(guest.arrivalDate), guest.arrivalTime, guest.arrivalMode].filter(Boolean).join(' · ') || 'Arrival not recorded'
const displayChange = (field: keyof Arrival, value: string) => value ? (field === 'date' ? shownDate(value) : value) : 'Not recorded'
const pickupRoute = (pickup: Pickup) => pickup.pickupPoint + ' → ' + pickup.dropPoint
const vehicleDetails = (pickup: Pickup) => [pickup.vehicle, pickup.vehicleNumber, pickup.driver].filter(Boolean).join(' · ')
const byPickupTime = (a: Pickup, b: Pickup) => (a.date || '9999').localeCompare(b.date || '9999') ||
  (a.time || '99').localeCompare(b.time || '99') || pickupRoute(a).localeCompare(pickupRoute(b))

async function transportRequest<T>(url: string, body?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, body === undefined ? { signal } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Transportation could not be updated.')
  return data
}

export function WorkspaceTransport({ wedding, people, workbookView, places, placesHref }: {
  wedding: { id: string; name: string; timeZone: string }; people: { id: string; name: string }[]; workbookView: boolean
  places: Place[]; placesHref: string
}) {
  const [data, setData] = useState<{ guests: Guest[]; pickups: Pickup[] }>()
  const [date, setDate] = useState('')
  const [sortBy, setSortBy] = useState('date')
  const [reviewOnly, setReviewOnly] = useState(false)
  const [editor, setEditor] = useState<Editor>()
  const [editorKey, setEditorKey] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [guestQuery, setGuestQuery] = useState('')
  const base = '/api/workspace/weddings/' + wedding.id
  const today = localDay(wedding.timeZone)

  async function load(signal?: AbortSignal) {
    const [guests, pickups] = await Promise.all([
      transportRequest<Guest[]>(base + '/guests', undefined, signal),
      transportRequest<Pickup[]>(base + '/transportation', undefined, signal),
    ])
    setData({ guests, pickups })
  }

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [base])

  const guests = data?.guests ?? []
  const pickups = data?.pickups ?? []
  const scheduled = new Set(pickups.filter(pickup => pickup.status !== 'Cancelled').flatMap(pickup => pickup.passengers.map(guest => guest.id)))
  const dates = [...new Set([...guests.map(guest => guest.arrivalDate), ...pickups.map(pickup => pickup.date)].filter(Boolean))].sort()
  const visible = pickups.filter(pickup => (!date || (pickup.date || 'missing') === date) && (!reviewOnly || pickup.needsReview))
    .sort((a, b) => {
      if (sortBy === 'review') return Number(b.needsReview) - Number(a.needsReview) || byPickupTime(a, b)
      if (sortBy === 'route') return pickupRoute(a).localeCompare(pickupRoute(b)) || byPickupTime(a, b)
      return byPickupTime(a, b)
    })
  const pending = guests.filter(guest => guest.transportRequired === 'Yes' && !scheduled.has(guest.id) && (!date || (guest.arrivalDate || 'missing') === date))
  const groups = new Map<string, Guest[]>()
  for (const guest of pending) {
    const key = JSON.stringify([guest.arrivalDate, guest.household || guest.id])
    const group = groups.get(key) ?? []
    group.push(guest)
    groups.set(key, group)
  }
  const waiting = [...groups.values()].sort((a, b) => (a[0].arrivalDate || '9999').localeCompare(b[0].arrivalDate || '9999'))
  const changes = (pickup: Pickup) => pickup.status === 'Cancelled' ? [] : pickup.passengers.flatMap(passenger =>
    (Object.keys(arrivalLabels) as (keyof Arrival)[]).flatMap(field => passenger.arrival[field] === passenger.reviewed[field] ? [] : [{
      key: passenger.id + ':' + field, name: passenger.name, label: arrivalLabels[field],
      from: displayChange(field, passenger.reviewed[field]), to: displayChange(field, passenger.arrival[field]),
    }]))

  function open(next: Editor) {
    setEditorKey(current => current + 1)
    setEditor(next); setGuestQuery(''); setError(''); setFeedback('')
    document.getElementById('pickup-editor')?.scrollIntoView()
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor || !data) return
    const raw = Object.fromEntries([...new FormData(event.currentTarget)].map(([key, value]) => [key, String(value).trim()]))
    if ((!raw.pickupPoint && !raw.pickupPlaceId) || (!raw.dropPoint && !raw.dropPlaceId)) {
      setError('Choose a saved place or enter a pickup and drop-off point.')
      return
    }
    const passengers = editor.guestIds.flatMap(id => {
      const guest = guests.find(guest => guest.id === id)
      return guest ? [{ id, revision: guest.revision }] : []
    })
    if (!passengers.length) { setError('Select at least one passenger.'); return }
    setBusy(true); setError('')
    try {
      await transportRequest(base + '/transportation' + (editor.pickup ? '/' + editor.pickup.id : ''), {
        ...raw, passengers, revision: editor.pickup?.revision ?? 0,
      })
      setEditor(undefined); setFeedback('Pickup saved.')
      await load().catch(() => setError('Pickup saved. Refresh to see the latest plan.'))
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save the pickup.')
    } finally {
      setBusy(false)
    }
  }

  function editPickup(pickup: Pickup) {
    open({ pickup, guestIds: pickup.passengers.map(guest => guest.id), date: pickup.date, time: pickup.time })
  }

  const printable = visible.filter(pickup => pickup.status !== 'Cancelled')
  const placeFor = (id: string) => places.find(place => place.id === id)
  const routePlaces = (pickup: Pickup) => [
    { label: 'Pickup', place: placeFor(pickup.pickupPlaceId) }, { label: 'Drop-off', place: placeFor(pickup.dropPlaceId) },
  ]
  const routeDetails = (pickup: Pickup) => routePlaces(pickup).map(({ label, place }) => place &&
    <details key={label}><summary>{label} directions</summary><PlaceDetails place={place} /></details>)
  const selectedGuests = editor ? guests.filter(guest => editor.guestIds.includes(guest.id)) : []
  const query = guestQuery.trim().toLowerCase()
  const listedGuests = guests.filter(guest => !query || (guest.name + ' ' + guest.household).toLowerCase().includes(query))
  const current = editor?.pickup
  const pickupChanges = (pickup: Pickup) => <ul>{changes(pickup).map(change =>
    <li key={change.key}>{change.name} · {change.label}: {change.from} → {change.to}</li>)}</ul>

  return <>
    <section className="focus-card">
      <div className="focus-heading"><div><h2>Transportation</h2><p>Assign arrivals to pickups and share the saved plan.</p></div>
        <div className="focus-actions">
          <button disabled={!data || busy} onClick={() => open({ guestIds: [], date: date === 'missing' ? '' : date, time: '' })}>Add pickup</button>
          <button className="focus-secondary" disabled={busy} onClick={() => {
            setEditor(undefined); setError(''); setFeedback('')
            void load().catch(error => setError(error.message))
          }}>Refresh transportation</button>
          {data && <PrintSection title="Pickup plan" weddingName={wedding.name} buttonLabel="Print pickup plan"
            filters={(date === 'missing' ? 'Date not recorded' : date ? shownDate(date) : 'All pickup dates') + (reviewOnly ? ' · Needs review only' : '')}
            columns={['Date', 'Time', 'Route', 'Addresses', 'Passengers', 'Vehicle / driver', 'Owner', 'Status']}
            records={printable.map(pickup => [shownDate(pickup.date), pickup.time, pickupRoute(pickup),
              routePlaces(pickup).filter(({ place }) => place).map(({ label, place }) => label + ' ' + place?.address).join(' · '),
              pickup.passengers.map(passenger => passenger.name).join(', '), vehicleDetails(pickup),
              pickup.owner, pickup.needsReview ? 'Needs review' : pickup.status])} />}
        </div>
      </div>
      <div className="focus-filters transport-filters">
      <label className="focus-field">Pickup and arrival date<select aria-label="Pickup and arrival date" value={date} onChange={event => setDate(event.target.value)}>
        <option value="">All dates</option><option value={today}>Today · {shownDate(today)}</option>
        {dates.filter(value => value !== today).map(value => <option key={value} value={value}>{shownDate(value)}</option>)}
        <option value="missing">Date not recorded</option>
      </select></label>
      <label className="focus-field">Sort by<select aria-label="Sort by" value={sortBy} onChange={event => setSortBy(event.target.value)}>
        <option value="date">Pickup date and time</option><option value="review">Needs review first</option><option value="route">Route</option>
      </select></label>
      <label className="transport-review-filter"><input type="checkbox" checked={reviewOnly} onChange={event => setReviewOnly(event.target.checked)} /> Only pickups needing review</label>
      </div>
      {feedback && <p role="status">{feedback}</p>}
      {error && <p role="alert">{error}</p>}
      {data && <p>{visible.length} pickups · {visible.filter(pickup => pickup.needsReview).length} need review · {pending.length} guests still need transport</p>}
    </section>
    <div id="pickup-editor" />
    {editor && <form key={editorKey} className="focus-card transport-panel" onSubmit={event => void save(event)}>
      <h2>{current ? (current.needsReview ? 'Review pickup' : 'Edit pickup') : 'Add pickup'}</h2>
      {current?.needsReview && <><p>Compare these changes with the pickup time. Saving confirms you reviewed the selected passengers’ latest details.</p>
        <ul>{changes(current).map(change => <li key={change.key}>{change.name} · {change.label}: {change.from} → {change.to}</li>)}</ul></>}
      <fieldset className="workspace-fields" disabled={busy}>
        <div className="focus-form-grid">
          {[['pickupPlaceId', 'Saved pickup place'], ['dropPlaceId', 'Saved drop-off place']].map(([field, label]) =>
            <label key={field} className="focus-field">{label}<select name={field}
              defaultValue={field === 'pickupPlaceId' ? current?.pickupPlaceId : current?.dropPlaceId}>
              <option value="">Enter a point below</option>{places.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}
            </select></label>)}
          {fields.map(([field, label, type]) => type === 'text'
            ? <VoiceField key={field} name={field} label={label} multiline={field === 'notes'}
              defaultValue={field === 'pickupPoint' ? current?.pickupDetail : field === 'dropPoint' ? current?.dropDetail : current?.[field]} />
            : <label className="focus-field" key={field}>{label}
              <input name={field} type={type} required defaultValue={field === 'date' ? editor.date : editor.time} /></label>)}
          <label className="focus-field">Pickup owner<select name="ownerId" defaultValue={current?.ownerId ?? ''}>
            <option value="">{current?.owner && !current.ownerId ? 'Keep ' + current.owner : 'Unassigned'}</option>
            {people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select></label>
          <label className="focus-field">Pickup status<select name="status" defaultValue={statusOptions.includes(current?.status ?? '') ? current?.status : 'Planned'}>
            {statusOptions.map(status => <option key={status}>{status}</option>)}
          </select></label>
          <label className="focus-field">Driver confirmed<select name="driverConfirmed" defaultValue={current?.driverConfirmed ?? ''}>
            <option value="">Not recorded</option><option>Yes</option><option>No</option>
          </select></label>
        </div>
        <h3>Passengers · {editor.guestIds.length} selected</h3>
        {selectedGuests.length > 0 && <p>{selectedGuests.map(guest => guest.name + ' (' + groupArrival(guest) + ')').join(' · ')}</p>}
        <VoiceField label="Find passengers" value={guestQuery} onValueChange={setGuestQuery} search />
        <p><a href={placesHref}>Manage saved places</a></p>
        <VoiceNotice />
        <div className="transport-passengers">
          {listedGuests.map(guest => <label className="focus-item" key={guest.id}>
            <span>{guest.name}<small>{guest.household && guest.household + ' · '}{groupArrival(guest)}</small></span>
            <input type="checkbox" checked={editor.guestIds.includes(guest.id)} onChange={event => setEditor({
              ...editor, guestIds: event.target.checked ? [...editor.guestIds, guest.id] : editor.guestIds.filter(id => id !== guest.id),
            })} />
          </label>)}
        </div>
        <div className="focus-actions"><button disabled={busy}>{busy ? 'Saving…' : current?.needsReview ? 'Save and mark reviewed' : 'Save pickup'}</button>
          <button type="button" className="focus-secondary" onClick={() => { setEditor(undefined); setError('') }}>Cancel</button></div>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>}
    <section className="focus-card transport-panel">
      <h2>Saved pickups</h2>
      {data && !visible.length && <p>No pickups for this selection.</p>}
      {workbookView && visible.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Transportation table">
        <table className="imported-records workspace-sheet"><thead><tr>{['Route', 'Date and time', 'Passengers', 'Vehicle / driver', 'Owner', 'Status', 'Action'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{visible.map(pickup => <tr key={pickup.id}>
            <th scope="row">{pickupRoute(pickup)}{routeDetails(pickup)}</th><td>{shownDate(pickup.date)} {pickup.time}</td>
            <td>{pickup.passengers.length} · {pickup.passengers.map(guest => guest.name).join(', ')}</td>
            <td>{vehicleDetails(pickup)}{pickup.driverConfirmed && <small>Driver confirmed: {pickup.driverConfirmed}</small>}</td><td>{pickup.owner}</td>
            <td>{pickup.needsReview ? <><span className="focus-chip pickup-review">Needs review</span>
              <details className="focus-completed"><summary>Arrival changes</summary>{pickupChanges(pickup)}</details></> : pickup.status}</td>
            <td><button className="focus-secondary" disabled={busy} onClick={() => editPickup(pickup)}>{pickup.needsReview ? 'Review pickup' : 'Edit pickup'}</button></td>
          </tr>)}</tbody></table>
      </div> : <div className="focus-record-grid">{visible.map(pickup => <article className="focus-card" key={pickup.id}>
        <div className="focus-heading"><h3>{pickupRoute(pickup)}</h3>
          <span className={pickup.needsReview ? 'focus-chip pickup-review' : 'focus-chip'}>{pickup.needsReview ? 'Needs review' : pickup.status || 'Status not set'}</span></div>
        <p>{[shownDate(pickup.date), pickup.time, vehicleDetails(pickup), pickup.owner].filter(Boolean).join(' · ')}</p>
        <p>{pickup.passengers.length} passengers · {pickup.passengers.map(guest => guest.name).join(', ')}</p>
        {routeDetails(pickup)}
        {pickup.needsReview && pickupChanges(pickup)}
        <button className="focus-secondary" disabled={busy} onClick={() => editPickup(pickup)}>{pickup.needsReview ? 'Review pickup' : 'Edit pickup'}</button>
      </article>)}</div>}
    </section>
    <section className="focus-card transport-panel">
      <h2>Guests still needing transport</h2>
      {!data ? <p role="status">Loading transportation…</p> : !waiting.length ? <p>All guests in this selection who need transport have a pickup.</p> : <div className="focus-record-grid">
        {waiting.map(group => <article className="focus-card" key={group[0].id}>
          <h3>{group[0].household || group[0].name}</h3><p>{shownDate(group[0].arrivalDate) || 'Arrival date not recorded'}</p>
          <ul>{group.map(guest => <li key={guest.id}>{guest.name} · {groupArrival(guest)}</li>)}</ul>
          <button className="focus-secondary" disabled={busy} onClick={() => open({
            guestIds: group.map(guest => guest.id), date: group[0].arrivalDate,
            time: group.every(guest => guest.arrivalTime === group[0].arrivalTime) ? group[0].arrivalTime : '',
          })}>Assign pickup</button>
        </article>)}</div>}
    </section>
  </>
}

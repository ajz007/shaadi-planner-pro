import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { PrintSection } from './PlanActions'
import { VoiceField, VoiceNotice } from './VoiceField'
import { useWorkspaceData } from './WorkspaceData'

export type Place = { id: string; name: string; address: string; mapUrl: string; instructions: string; revision: number }
type Person = { id: string; name: string }
type RequiredPerson = { personId: string; role: string; neededBy: string }
type RequiredItem = {
  name: string; category: string; quantity: string; unit: string; personId: string; for: string
  neededBy: string; handoff: string; status: string
}
export type FunctionReadiness = {
  id: string; name: string; venue: string; startsAt: string; placeId: string; duration: number | null
  people: RequiredPerson[] | null; items: RequiredItem[]; revision: number; familyOnly?: boolean
}
export type RunSheetActivity = { id: string; functionId: string; function: string; ownerId: string; fields: string[]; revision: number }
export type Planning = { places: Place[]; functions: FunctionReadiness[]; timeline?: RunSheetActivity[] }
type Props = {
  data: Planning; people: Person[]; wedding: { name: string; timeZone: string }
  save: (kind: string, id: string, body: object) => Promise<void>
}

const emptyItem: RequiredItem = {
  name: '', category: '', quantity: '', unit: '', personId: '', for: '', neededBy: '', handoff: '', status: 'To arrange',
}
const itemFields = [
  ['name', 'Item'], ['category', 'Category'], ['quantity', 'Quantity'], ['unit', 'Unit'],
  ['for', 'For whom / exchange direction'], ['handoff', 'Handoff location or instructions'],
] as const
const itemStatuses = ['To arrange', 'Packed', 'At venue']
const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim()
const mapSearch = (place: Place) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(place.name + ', ' + place.address)
const directions = (place: Place) => 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(place.address)

export function PlaceDetails({ place }: { place: Place }) {
  return <div>
    <p>{place.address}</p>
    {place.instructions && <p>{place.instructions}</p>}
    <div className="focus-actions">
      <a href={place.mapUrl || mapSearch(place)} target="_blank" rel="noreferrer">Open in Maps</a>
      <a href={directions(place)} target="_blank" rel="noreferrer">Get directions</a>
    </div>
  </div>
}

export function WorkspacePlaces({ data, save }: Pick<Props, 'data' | 'save'>) {
  const { preview } = useWorkspaceData()
  const [editor, setEditor] = useState<Place | 'new'>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const current = editor === 'new' ? undefined : editor
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      await save('places', current?.id ?? 'new', {
        name: text(form, 'name'), address: text(form, 'address'), mapUrl: text(form, 'mapUrl'),
        instructions: text(form, 'instructions'), revision: current?.revision ?? 0,
      })
      setEditor(undefined)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save the place.') }
    finally { setBusy(false) }
  }
  return <section>
    <div className="focus-heading"><div><h2 className="workspace-section-title">Places</h2><p>Save venues, hotels and pickup points with their directions.</p></div>
      <button disabled={busy || preview} onClick={() => { setError(''); setEditor('new') }}>Add place</button></div>
    {error && <p role="alert">{error}</p>}
    {editor && <form className="focus-card" key={current?.id ?? 'new'} onSubmit={event => void submit(event)}>
      <h3>{current ? 'Edit place' : 'Add place'}</h3>
      <fieldset className="workspace-fields" disabled={busy}>
        <VoiceField label="Place name" name="name" defaultValue={current?.name} maxLength={120} required />
        <VoiceField label="Address" name="address" defaultValue={current?.address} required />
        <label className="focus-field">Map link (optional)<input type="url" name="mapUrl" defaultValue={current?.mapUrl} maxLength={2048} /></label>
        <VoiceField label="Arrival instructions" name="instructions" defaultValue={current?.instructions} maxLength={1000} multiline />
        <VoiceNotice />
        <div className="focus-actions"><button>Save place</button>
          <button type="button" className="focus-secondary" onClick={() => setEditor(undefined)}>Cancel</button></div>
      </fieldset>
    </form>}
    {!data.places.length && <p>No places saved yet.</p>}
    <div className="focus-record-grid">{data.places.map(place => <article key={place.id} className="focus-card">
      <h3>{place.name}</h3><PlaceDetails place={place} />
      <button className="focus-secondary" disabled={busy || preview} onClick={() => { setError(''); setEditor(place) }}>Edit place</button>
    </article>)}</div>
  </section>
}

export function functionLocalTime(date: string, zone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(date)).map(part => [part.type, part.value]))
  return parts.year + '-' + parts.month + '-' + parts.day + 'T' + parts.hour + ':' + parts.minute
}

function FunctionEditor({ current, data, people, wedding, save, close }: Props & {
  current?: FunctionReadiness; close: () => void
}) {
  const [required, setRequired] = useState<RequiredPerson[] | null>(current?.people ?? null)
  const [items, setItems] = useState(current?.items ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  function updateItem(index: number, patch: Partial<RequiredItem>) {
    setItems(items => items.map((item, i) => i === index ? { ...item, ...patch } : item))
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      await save('functions', current?.id ?? 'new', {
        name: text(form, 'name'), venue: text(form, 'venue'), start: text(form, 'start'), placeId: text(form, 'placeId'),
        duration: Number(text(form, 'duration')) || null, people: required, items, revision: current?.revision ?? 0,
        familyOnly: text(form, 'audience') === 'family',
      })
      close()
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save the function.') }
    finally { setBusy(false) }
  }
  return <form className="focus-card" onSubmit={event => void submit(event)}>
    <h3 ref={heading} tabIndex={-1}>{current ? 'Edit ' + current.name : 'Add function'}</h3>
    {error && <p role="alert">{error}</p>}
    <fieldset className="workspace-fields" disabled={busy}>
      <div className="focus-form-grid">
        <VoiceField label="Function name" name="name" defaultValue={current?.name} maxLength={120} required />
        <label className="focus-field">Starts in {wedding.timeZone}<input type="datetime-local" name="start" required
          defaultValue={current && functionLocalTime(current.startsAt, wedding.timeZone)} /></label>
        <label className="focus-field">Duration (minutes)<input type="number" name="duration" min="1" max="1440" defaultValue={current?.duration ?? ''} /></label>
        <label className="focus-field">Saved place<select name="placeId" defaultValue={current?.placeId ?? ''}>
          <option value="">Choose later</option>{data.places.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}
        </select></label>
        <VoiceField label="Venue or room within the place" name="venue" defaultValue={current?.venue} maxLength={200} />
        <label className="focus-field">Guest visibility
          <select name="audience" defaultValue={current?.familyOnly ? 'family' : 'guest'} aria-describedby="function-visibility-help">
            <option value="guest">Guest function</option><option value="family">Family only</option>
          </select>
        </label>
      </div>
      <p id="function-visibility-help" className="focus-note">Guest functions are included by default. Marking a function family only also hides it on links you’ve already shared, unless it was explicitly added as a family-only function.</p>
      <h4>Required people</h4>
      <p>{required === null ? 'Attendance not reviewed.' : required.length ? 'Selected people are required.' : 'Reviewed. No required people.'}</p>
      <div className="focus-actions"><button type="button" className="focus-secondary" onClick={() => setRequired([])}>No one required</button>
        <button type="button" className="focus-secondary" onClick={() => setRequired(null)}>Mark unreviewed</button></div>
      {people.map(person => {
        const entry = required?.find(entry => entry.personId === person.id)
        const update = (patch: Partial<RequiredPerson>) => setRequired(rows => (rows ?? []).map(row => row.personId === person.id ? { ...row, ...patch } : row))
        return <div key={person.id}>
          <label><input type="checkbox" checked={!!entry} onChange={event => setRequired(rows => event.target.checked
            ? [...(rows ?? []), { personId: person.id, role: '', neededBy: '' }]
            : (rows ?? []).filter(row => row.personId !== person.id))} /> {person.name}</label>
          {entry && <div className="focus-form-grid">
            <VoiceField label={'Role for ' + person.name} value={entry.role} onValueChange={role => update({ role })} maxLength={100} />
            <label className="focus-field">Needed by<input type="datetime-local" value={entry.neededBy}
              onChange={event => update({ neededBy: event.target.value })} /></label>
          </div>}
        </div>
      })}
      <h4>Required items</h4>
      <datalist id="function-item-categories">{['Puja', 'Family exchange', 'Attire & jewellery', 'Ceremony setup'].map(category => <option key={category} value={category} />)}</datalist>
      {items.map((item, index) => <fieldset className="focus-card workspace-fields" key={index}>
        <legend>Item {index + 1}</legend>
        <div className="focus-form-grid">
          {itemFields.map(([key, label]) => <VoiceField key={key} label={label} value={item[key]}
            required={key === 'name'} list={key === 'category' ? 'function-item-categories' : undefined}
            maxLength={key === 'quantity' ? 30 : key === 'unit' ? 60 : key === 'handoff' ? 160 : 120}
            onValueChange={value => updateItem(index, { [key]: value })} />)}
          <label className="focus-field">Responsible person<select value={item.personId} onChange={event => updateItem(index, { personId: event.target.value })}>
            <option value="">Unassigned</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select></label>
          <label className="focus-field">Ready by<input type="datetime-local" value={item.neededBy}
            onChange={event => updateItem(index, { neededBy: event.target.value })} /></label>
          <label className="focus-field">Status<select value={item.status} onChange={event => updateItem(index, { status: event.target.value })}>
            {itemStatuses.map(status => <option key={status}>{status}</option>)}</select></label>
        </div>
        <button type="button" className="focus-secondary" onClick={() => setItems(items => items.filter((_, i) => i !== index))}>Remove item</button>
      </fieldset>)}
      <div className="focus-actions">
        <button type="button" className="focus-secondary" onClick={() => setItems(items => [...items, { ...emptyItem }])}>Add required item</button>
        {data.functions.some(entry => entry.id !== current?.id && entry.items.length) && <label className="focus-field">Copy items from
          <select value="" onChange={event => {
            const source = data.functions.find(entry => entry.id === event.target.value)
            if (source) setItems(items => [...items, ...source.items.map(item => ({ ...item, neededBy: '', status: 'To arrange' }))])
          }}><option value="">Choose a function</option>
            {data.functions.filter(entry => entry.id !== current?.id && entry.items.length).map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select></label>}
      </div>
      <VoiceNotice />
      <div className="focus-actions"><button>{busy ? 'Saving…' : 'Save function'}</button>
        <button type="button" className="focus-secondary" onClick={close}>Cancel</button></div>
    </fieldset>
  </form>
}

export function WorkspaceFunctionReadiness(props: Props & { workbookView: boolean; placesHref: string }) {
  const { preview } = useWorkspaceData()
  const { data, people, wedding, workbookView, placesHref } = props
  const [editor, setEditor] = useState<FunctionReadiness | 'new'>()
  const [assigned, setAssigned] = useState('')
  const [printFunction, setPrintFunction] = useState('')
  const personName = (id: string) => people.find(person => person.id === id)?.name ?? 'Unassigned'
  const itemColumns = ['Item', 'Category', 'Quantity', 'Responsible person', 'For', 'Ready by', 'Handoff', 'Status']
  const itemCells = (item: RequiredItem) => [item.name, item.category, [item.quantity, item.unit].filter(Boolean).join(' '),
    personName(item.personId), item.for, item.neededBy.replace('T', ' '), item.handoff, item.status]
  const printRows = data.functions.filter(entry => !printFunction || entry.id === printFunction)
    .flatMap(entry => entry.items.filter(item => !assigned || item.personId === assigned)
      .map(item => [entry.name, ...itemCells(item)]))
  return <section>
    <div className="focus-heading"><div><h2 className="workspace-section-title">Functions &amp; Events</h2><p>See who and what each function needs.</p></div>
      <div className="focus-actions"><button disabled={preview} onClick={() => setEditor('new')}>Add function</button><a href={placesHref}>Manage places</a></div></div>
    {editor && <FunctionEditor key={editor === 'new' ? 'new' : editor.id} {...props}
      current={editor === 'new' ? undefined : editor} close={() => setEditor(undefined)} />}
    <label className="focus-field">Filter checklist by responsible person<select value={assigned} onChange={event => setAssigned(event.target.value)}>
      <option value="">Everyone</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
    </select></label>
    {!!data.functions.length && <div className="focus-actions">
      <label className="focus-field">Function to print<select value={printFunction} onChange={event => setPrintFunction(event.target.value)}>
        <option value="">All functions</option>{data.functions.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </select></label>
      {!!printRows.length && <PrintSection title="Function checklist" columns={['Function', ...itemColumns]} records={printRows}
        buttonLabel="Print checklist" weddingName={wedding.name} filters={assigned ? 'Responsible person: ' + personName(assigned) : undefined} />}
    </div>}
    {!data.functions.length && <p>No functions scheduled yet.</p>}
    {workbookView && !!data.functions.length && <div className="table-scroll" tabIndex={0} role="region" aria-label="Functions table">
      <table className="imported-records">
        <thead><tr>{['Function', 'Starts', 'Venue', 'Duration', 'Attendance', 'Items at venue', 'Action'].map(column =>
          <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{data.functions.map(entry => <tr key={entry.id}>
          <th scope="row">{entry.name}{entry.familyOnly && <small>Family only</small>}</th><td>{functionLocalTime(entry.startsAt, wedding.timeZone).replace('T', ' ')}</td>
          <td>{[data.places.find(place => place.id === entry.placeId)?.name, entry.venue].filter(Boolean).join(' · ')}</td>
          <td>{entry.duration ? entry.duration + ' min' : ''}</td>
          <td>{entry.people === null ? 'Needs review' : entry.people.map(person => personName(person.personId)).join(', ') || 'None required'}</td>
          <td>{entry.items.filter(item => item.status === 'At venue').length}/{entry.items.length}</td>
          <td><button className="focus-secondary" disabled={preview} onClick={() => setEditor(entry)}>Edit function</button></td>
        </tr>)}</tbody>
      </table>
    </div>}
    {data.functions.map(entry => {
      const place = data.places.find(place => place.id === entry.placeId)
      const items = entry.items.filter(item => !assigned || item.personId === assigned)
      return <article key={entry.id} className="focus-card">
        <div className="focus-heading"><h3>{entry.name}{entry.familyOnly && <> <span className="focus-chip">Family only</span></>}</h3>{!workbookView &&
          <button className="focus-secondary" disabled={preview} onClick={() => setEditor(entry)}>Edit function</button>}</div>
        <p>{functionLocalTime(entry.startsAt, wedding.timeZone).replace('T', ' ')}{entry.duration ? ' · ' + entry.duration + ' min' : ''}
          {entry.venue && ' · ' + entry.venue}{place && ' · ' + place.name}</p>
        {place && <PlaceDetails place={place} />}
        <h4>Required people</h4>
        {entry.people === null ? <p>Attendance not reviewed.</p> : !entry.people.length ? <p>No required people.</p>
          : <ul>{entry.people.map(person => <li key={person.personId}>{[personName(person.personId), person.role, person.neededBy.replace('T', ' ')].filter(Boolean).join(' · ')}</li>)}</ul>}
        <h4>Required items · {items.filter(item => item.status === 'At venue').length}/{items.length} at venue</h4>
        {!items.length ? <p>{assigned ? 'No items assigned to this person.' : 'No items added yet.'}</p> : <>
          {workbookView ? <div className="table-scroll"><table className="imported-records">
            <thead><tr>{itemColumns.map(column => <th key={column}>{column}</th>)}</tr></thead>
            <tbody>{items.map((item, index) => <tr key={index}>{itemCells(item).map((cell, i) => <td key={i}>{cell}</td>)}</tr>)}</tbody>
          </table></div> : <ul>{items.map((item, index) => <li key={index}>{itemCells(item).filter(Boolean).join(' · ')}</li>)}</ul>}
        </>}
      </article>
    })}
  </section>
}

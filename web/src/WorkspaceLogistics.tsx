import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { PrintSection } from './PlanActions'
import { VoiceField, VoiceNotice } from './VoiceField'
import { localDay } from './WorkspaceGuests'
import { useEditorFocus } from './useEditorFocus'
import { useWorkspaceData } from './WorkspaceData'
import type { Guest } from './WorkspaceGuests'
import { PlaceDetails } from './WorkspacePlanning'
import type { Place } from './WorkspacePlanning'
import workbook from './workbook-demo.json'

type Section = 'Accommodation' | 'RSVP Follow-up'
type RecordRow = { id: string; revision: number; values: string[]; guestLinks?: Record<number, string>; placeId: string }
type Request = <T>(path: string, body?: object, signal?: AbortSignal) => Promise<T>
const roomFields = [0, 1, 2, 3, 4, 5, 6, 10, 11, 12, 13, 15]
const followupFields = [0, 4, 5, 6, 7, 8]

export function WorkspaceLogistics({ section, wedding, people, workbookView, request, guestHref, places, placesHref }: {
  section: Section; wedding: { id: string; name: string; timeZone: string }; people: { id: string; name: string }[]
  workbookView: boolean; request: Request; guestHref: string; places: Place[]; placesHref: string
}) {
  const { preview } = useWorkspaceData()
  const room = section === 'Accommodation'
  const path = '/weddings/' + wedding.id
  const endpoint = path + '/logistics/' + (room ? 'accommodation' : 'rsvp-follow-up')
  const columns = workbook.tables.find(table => table.name === section)!.columns
  const [data, setData] = useState<{ records: RecordRow[]; guests: Guest[] }>()
  const [editor, setEditor] = useState<RecordRow | 'new'>()
  const [placeId, setPlaceId] = useState('')
  const [query, setQuery] = useState('')
  const [dueOnly, setDueOnly] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const today = localDay(wedding.timeZone)
  const { heading, returnTarget, fallback } = useEditorFocus(editor, busy)

  async function load(signal?: AbortSignal) {
    const [records, guests] = await Promise.all([
      request<RecordRow[]>(endpoint, undefined, signal), request<Guest[]>(path + '/guests', undefined, signal),
    ])
    if (!signal?.aborted) setData({ records, guests })
  }

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal).catch(error => {
      if (!controller.signal.aborted) setError(error.message)
    })
    return () => controller.abort()
  }, [endpoint])

  const editing = editor === 'new' ? undefined : editor
  const guestField = (index: number) => room ? index >= 3 && index <= 6 : index === 0
  const fields = room ? roomFields : followupFields
  const visible = (data?.records ?? []).filter(record =>
    (!dueOnly || (record.values[4] && record.values[4] <= today)) &&
    record.values.join(' ').toLowerCase().includes(query.trim().toLowerCase()),
  ).sort((a, b) => (a.values[room ? 0 : 4] || '9999').localeCompare(b.values[room ? 0 : 4] || '9999') ||
    a.values[1].localeCompare(b.values[1], undefined, { numeric: room }))
  const summary = (record: RecordRow) => room
    ? [record.values[0], 'Room ' + record.values[1]].join(' · ')
    : record.values[1] || record.values[0] || 'Follow-up'

  function open(value: RecordRow | 'new', trigger: HTMLButtonElement) {
    returnTarget.current = trigger
    setError('')
    setFeedback('')
    setEditor(value)
    setPlaceId(value === 'new' ? '' : value.placeId)
  }

  async function save(body: object, remove = false) {
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      await request(endpoint + '/' + (editing?.id ?? 'new'), { ...body, revision: editing?.revision ?? 0 })
      setEditor(undefined)
      setFeedback(remove ? 'Removed from the live plan.' : 'Saved to the live plan.')
      try { await load() }
      catch { setError('The change was saved. Refresh the page to see the latest records.'); setData(undefined) }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The change could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const values: Record<number, string> = {}
    const guestLinks: Record<number, string> = {}
    for (const index of fields) {
      const value = String(form.get(String(index)) ?? '').trim()
      if (!guestField(index)) values[index] = value
      else if (value) guestLinks[index] = value
    }
    void save({ values, guestLinks, placeId })
  }

  return <>
    <div className="focus-heading"><div><h2 className="workspace-section-title" ref={fallback} tabIndex={-1}>{section}</h2><p className="focus-note">{room
      ? 'Assign guests to rooms and see occupancy from the Guest List.'
      : 'Plan household follow-ups and see each contact’s current RSVP.'}</p></div>
      {data && <button disabled={busy || preview} onClick={event => open('new', event.currentTarget)}>{room ? 'Add room' : 'Add follow-up'}</button>}
    </div>
    {feedback && <p role="status">{feedback}</p>}
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p role="status">Loading records…</p>}
    {data && <>
      {editor && <form key={editing?.id ?? 'new'} className="focus-card" onSubmit={submit}>
        <h3 ref={heading} tabIndex={-1}>{editing ? 'Edit' : 'Add'} {room ? 'room' : 'follow-up'}</h3>
        <fieldset className="workspace-fields" disabled={busy}><div className="focus-form-grid">
          {room && <label className="focus-field">Saved hotel<select value={placeId} onChange={event => setPlaceId(event.target.value)}>
            <option value="">Use hotel name below</option>{places.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}
          </select></label>}
          {fields.map(index => {
            if (room && index === 0 && placeId) return null
            const date = (room ? [10, 11] : [4, 6]).includes(index)
            const owner = room ? index === 12 : index === 5
            if (!date && !guestField(index)) return <VoiceField key={index} label={columns[index]} name={String(index)}
              required={room && index < 2} list={owner ? 'logistics-people' : undefined}
              multiline={index === (room ? 15 : 8)} defaultValue={editing?.values[index]} />
            return <label key={index} className="focus-field">{columns[index]}
              {guestField(index)
                ? <select name={String(index)} required={!room} defaultValue={editing?.guestLinks?.[index] ?? ''}>
                  <option value="">{room ? 'No guest selected' : 'Choose a contact'}</option>
                  {data.guests.map(guest => <option key={guest.id} value={guest.workbookId}>
                    {guest.name} · {guest.household || guest.workbookId}
                  </option>)}
                </select>
                : <input name={String(index)} type="date" defaultValue={editing?.values[index] ?? ''} />}
            </label>
          })}
          </div><datalist id="logistics-people">{people.map(person => <option key={person.id} value={person.name} />)}</datalist>
          {room && <p><a href={placesHref}>Manage saved places</a></p>}
          <VoiceNotice />
          <div className="focus-actions">
            <button>{busy ? 'Saving…' : room ? 'Save room' : 'Save follow-up'}</button>
            <button type="button" className="focus-secondary" onClick={() => setEditor(undefined)}>Cancel</button>
            {editing && <button type="button" className="focus-secondary" onClick={() => {
              if (window.confirm('Remove this record from the live plan?')) void save({ remove: true }, true)
            }}>Remove</button>}
          </div>
        </fieldset>
        {!room && <p className="focus-note">Update the household contact’s RSVP in <a href={guestHref}>Guest List</a>.</p>}
      </form>}
      <div className="focus-filters">
        <VoiceField label={room ? 'Search hotels, rooms or guests' : 'Search households, guests or actions'}
          value={query} onValueChange={setQuery} search />
        {!room && <label className="transport-review-filter">
          <input type="checkbox" checked={dueOnly} onChange={event => setDueOnly(event.target.checked)} /> Due by today
        </label>}
        {visible.length > 0 && <PrintSection title={section} columns={room ? [...columns, 'Hotel address'] : columns}
          records={visible.map(record => room ? [...record.values, places.find(place => place.id === record.placeId)?.address ?? ''] : record.values)}
          filters={dueOnly ? 'Due by today' : undefined} weddingName={wedding.name} />}
        <VoiceNotice />
        <div className="filter-summary">
          <p role="status">{visible.length} of {data.records.length} {room ? 'rooms' : 'follow-ups'}</p>
          <button className="focus-secondary" disabled={!query && !dueOnly} onClick={() => { setQuery(''); setDueOnly(false) }}>Clear filters</button>
        </div>
      </div>
      {visible.length === 0 && <p>{data.records.length ? 'No records match these filters.' : room ? 'No rooms yet.' : 'No follow-ups yet.'}</p>}
      {workbookView && visible.length > 0 && <div className="table-scroll" tabIndex={0} role="region" aria-label={section + ' table'}><table className="imported-records workspace-sheet">
        <thead><tr>{columns.map(column => <th key={column}>{column}</th>)}<th>Actions</th></tr></thead>
        <tbody>{visible.map(record => <tr key={record.id}>{record.values.map((value, i) => <td key={i}>{value}
          {i === 0 && places.filter(place => place.id === record.placeId).map(place => <PlaceDetails key={place.id} place={place} />)}</td>)}
          <td><button className="focus-secondary" disabled={busy || preview} onClick={event => open(record, event.currentTarget)}
            aria-label={'Edit ' + summary(record)}>Edit</button></td></tr>)}</tbody>
      </table></div>}
      {!workbookView && <div className="focus-record-grid">{visible.map(record => {
        const values = record.values
        const detailFields = room ? [2, 3, 4, 5, 6, 9, 10, 11, 12, 14, 15] : [0, 2, 4, 5, 6, 7, 8]
        return <article key={record.id} className="focus-card">
          <div className="focus-heading"><h3>{summary(record)}</h3><span className="focus-chip">{values[room ? 13 : 3] || 'Status not set'}</span></div>
          {places.filter(place => place.id === record.placeId).map(place => <PlaceDetails key={place.id} place={place} />)}
          <dl className="focus-record-details">{detailFields.filter(index => values[index]).map(index => <div key={index}>
            <dt>{columns[index].replace(' (Auto)', '')}</dt><dd>{values[index]}</dd>
          </div>)}</dl>
          <button className="focus-secondary" disabled={busy || preview} onClick={event => open(record, event.currentTarget)}
            aria-label={'Edit ' + summary(record)}>Edit</button>
        </article>
      })}</div>}
    </>}
  </>
}

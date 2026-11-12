import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Plan } from './Workspace'
import { functionLocalTime } from './WorkspacePlanning'
import type { Planning, RunSheetActivity } from './WorkspacePlanning'
import { PrintSection } from './PlanActions'

const columns = ['Date', 'Time', 'Location', 'Activity', 'Owner', 'Vendor / team', 'Status', 'Dependencies', 'Duration', 'Notes']
const text = (error: unknown) => error instanceof Error ? error.message : 'Could not save the activity.'

export function WorkspaceRunSheet({ data, wedding, people, workbookView, editId, save, functionsHref }: {
  data: Planning; wedding: Plan['wedding']; people: Plan['people']; workbookView: boolean; editId: string
  save: (kind: string, id: string, values: object) => Promise<void>; functionsHref: string
}) {
  const activities = data.timeline ?? []
  const [day, setDay] = useState('')
  const [selected, setSelected] = useState(editId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const activity = activities.find(row => row.id === selected)
  const editing = selected === 'new' || !!activity
  const visible = activities.filter(row => !day || row.fields[0] === day)
  const functions = data.functions.map(fn => {
    const [date, time] = functionLocalTime(fn.startsAt, wedding.timeZone).split('T')
    const place = data.places.find(place => place.id === fn.placeId)
    return { id: fn.id, fields: [date, time, [place?.name, fn.venue].filter(Boolean).join(' · '), fn.name, '',
      '', '', '', fn.duration ? fn.duration + ' min' : '', ''], function: '' }
  })
  const days = [...new Set([...activities, ...functions].map(row => row.fields[0]).filter(Boolean))].sort()
  const entries = [...functions.filter(row => !day || row.fields[0] === day), ...visible].sort((a, b) =>
    (a.fields[0] + 'T' + a.fields[1]).localeCompare(b.fields[0] + 'T' + b.fields[1]))
  const functionIDs = new Set(functions.map(row => row.id))
  const printRecords = entries.map(row => {
    const [date, time, place, name, owner, team, status, dependencies, duration, notes] = row.fields
    return [date, [time, duration].filter(Boolean).join(' · '), name, row.function || (functionIDs.has(row.id) ? 'Function' : ''),
      place, [owner, team].filter(Boolean).join(' · '), [status, dependencies, notes].filter(Boolean).join(' · ')]
  })
  function open(id: string) {
    setSelected(id)
    setError('')
    setFeedback('')
  }
  async function change(values: object, removing = false) {
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      await save('timeline', selected, values)
      setSelected('')
      setFeedback(removing ? 'Activity removed.' : 'Activity saved.')
    } catch (error) { setError(text(error)) }
    finally { setBusy(false) }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const get = (name: string) => String(form.get(name) ?? '').trim()
    const ownerId = get('ownerId')
    const fields = columns.map((_, index) => index === 4 && ownerId
      ? people.find(person => person.id === ownerId)?.name ?? '' : get(String(index)))
    void change({ fields, ownerId, functionId: get('functionId'), revision: activity?.revision ?? 0 })
  }
  return <div className="workspace-run-sheet">
    {feedback && <p role="status">{feedback}</p>}
    {error && <p role="alert">{error}</p>}
    {editId && !activities.some(row => row.id === editId) && <p role="status">That activity is unavailable.</p>}
    <section className="focus-card">
      <div className="focus-heading"><h2>Wedding-day agenda</h2><button onClick={() => open('new')} disabled={busy}>Add activity</button></div>
      <div className="focus-filters">
        <label className="focus-field">Date<select value={day} onChange={event => setDay(event.target.value)}>
          <option value="">All dates</option>{days.map(date => <option key={date}>{date}</option>)}
        </select></label>
        {!!entries.length && <PrintSection title="Wedding-day run sheet" weddingName={wedding.name} buttonLabel="Print run sheet"
          columns={['Date', 'Time', 'Activity', 'Function', 'Location', 'Owner / team', 'Status / notes']}
          records={printRecords} filters={(day ? day + ' · ' : '') + wedding.timeZone} />}
      </div>
      {!entries.length && <p>Add an activity or <a href={functionsHref}>schedule a function</a> to start your run sheet.</p>}
      {workbookView && entries.length > 0 ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Wedding-day agenda">
        <table className="imported-records"><thead><tr>{[...columns, 'Function', 'Actions'].map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead>
          <tbody>{entries.map(row => <tr key={row.id}>{row.fields.map((value, index) => <td key={columns[index]}>{value}</td>)}
            <td>{row.function || (functionIDs.has(row.id) ? 'Function' : '')}</td><td>{functionIDs.has(row.id) ? <a href={functionsHref}>Functions</a>
              : <button className="focus-secondary" disabled={busy} onClick={() => open(row.id)}>Edit</button>}</td>
          </tr>)}</tbody></table>
      </div> : <div>{entries.map(row => {
        const [date, time, place, name, owner, team, status, dependencies, duration, notes] = row.fields
        const isFunction = functionIDs.has(row.id)
        return <div className="focus-item" key={row.id}><span><strong>{name}</strong>
          <small>{[date, time, place, duration].filter(Boolean).join(' · ')}</small>
          <small>{[row.function || (isFunction ? 'Function' : ''), owner, team, status].filter(Boolean).join(' · ')}</small>
          {dependencies && <small>Depends on {dependencies}</small>}{notes && <small>{notes}</small>}
        </span>{isFunction ? <a href={functionsHref}>Functions</a>
          : <button className="focus-secondary" disabled={busy} onClick={() => open(row.id)}>Edit</button>}</div>
      })}</div>}
    </section>
    {editing && <ActivityEditor key={selected} activity={activity} defaultDate={day || wedding.date} data={data} people={people}
      busy={busy} submit={submit} cancel={() => open('')} remove={() => {
        if (activity && window.confirm('Remove this activity from the wedding-day run sheet?')) {
          void change({ remove: true, revision: activity.revision }, true)
        }
      }} />}
  </div>
}

function ActivityEditor({ activity, defaultDate, data, people, busy, submit, cancel, remove }: {
  activity?: RunSheetActivity; defaultDate: string; data: Planning; people: Plan['people']; busy: boolean
  submit: (event: FormEvent<HTMLFormElement>) => void; cancel: () => void; remove: () => void
}) {
  const [owner, setOwner] = useState(activity?.ownerId ?? '')
  const editor = useRef<HTMLFormElement>(null)
  useEffect(() => {
    editor.current?.scrollIntoView({ block: 'start' })
  }, [])
  return <form className="focus-card" onSubmit={submit} ref={editor}>
    <h2>{activity ? 'Edit activity' : 'New activity'}</h2>
    <fieldset className="workspace-fields" disabled={busy}>
      <div className="focus-form-grid">
        <label className="focus-field">Activity<input name="3" required maxLength={240} defaultValue={activity?.fields[3]} /></label>
        <label className="focus-field">Linked function<select name="functionId" defaultValue={activity?.functionId ?? ''}>
          <option value="">No linked function</option>{data.functions.map(fn => <option key={fn.id} value={fn.id}>{fn.name}</option>)}
        </select></label>
        <label className="focus-field">Date<input name="0" type="date" required defaultValue={activity?.fields[0] || defaultDate} /></label>
        <label className="focus-field">Start time<input name="1" type="time" required defaultValue={activity?.fields[1]} /></label>
        <label className="focus-field">Location<input name="2" maxLength={200} defaultValue={activity?.fields[2]} list="run-sheet-places" /></label>
        <datalist id="run-sheet-places">{data.places.map(place => <option key={place.id} value={place.name} />)}</datalist>
        <label className="focus-field">Duration (minutes)<input name="8" type="number" min="1" max="1440" defaultValue={activity?.fields[8].replace(/ min$/, '')} /></label>
        <label className="focus-field">Planning person<select name="ownerId" value={owner} onChange={event => setOwner(event.target.value)}>
          <option value="">No planning person selected</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select></label>
        {!owner && <label className="focus-field">Owner name<input name="4" maxLength={120} defaultValue={activity?.ownerId ? '' : activity?.fields[4]} /></label>}
        <label className="focus-field">Vendor or team<input name="5" maxLength={200} defaultValue={activity?.fields[5]} /></label>
        <label className="focus-field">Status<input name="6" maxLength={120} defaultValue={activity?.fields[6]} list="run-sheet-statuses" /></label>
        <datalist id="run-sheet-statuses">{['Pending', 'In progress', 'Done'].map(status => <option key={status} value={status} />)}</datalist>
        <label className="focus-field">Dependencies<input name="7" maxLength={500} defaultValue={activity?.fields[7]} /></label>
        <label className="focus-field">Notes<textarea name="9" maxLength={2000} defaultValue={activity?.fields[9]} /></label>
      </div>
      <div className="focus-actions">
        <button>{busy ? 'Saving…' : 'Save activity'}</button>
        <button type="button" className="focus-secondary" onClick={cancel}>Cancel</button>
        {activity && <button type="button" className="focus-secondary" onClick={remove}>Remove activity</button>}
      </div>
    </fieldset>
  </form>
}

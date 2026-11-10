import { useRef, useState } from 'react'
import { usePlan } from './PlanData'
import { PrintSection } from './PlanActions'
import './schedule.css'

const dayMinutes = 1440

type ScheduleEntry = {
  id: string
  name: string
  date: string
  time: string
  place: string
  owner: string
  source: 'Function' | 'Run sheet'
  duration: number | null
  required: string[] | null
}

function clock(time: string) {
  const parts = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(time)
  if (!parts) return ''
  const hour = parts[3] ? Number(parts[1]) % 12 + (parts[3].toUpperCase() === 'PM' ? 12 : 0) : Number(parts[1])
  return String(hour).padStart(2, '0') + ':' + parts[2]
}

const requiredPeople = (value?: string): string[] | null => value ? JSON.parse(value) as string[] : null
const dayLabel = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const startOf = (date: string) => Date.parse(date + 'T00:00:00Z') / 60_000
const showDate = (date: string) => dayLabel.format(new Date(date + 'T00:00:00Z'))
const start = (entry: ScheduleEntry) => startOf(entry.date) + Number(entry.time.slice(0, 2)) * 60 + Number(entry.time.slice(3))
const hourLabel = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

export function scheduleEntries(functions: string[][], timeline: string[][]): ScheduleEntry[] {
  return [
    ...functions.map(([id, name, date, time, place, , , owner, , , duration, required]): ScheduleEntry =>
      ({ id, name, date, time: clock(time), place, owner, source: 'Function', duration: Number(duration) || null, required: requiredPeople(required) })),
    ...timeline.map(([date, time, place, name, owner, , , , duration, , required], index): ScheduleEntry =>
      ({ id: 'run-' + index, name, date, time: clock(time), place, owner, source: 'Run sheet', duration: Number.parseInt(duration, 10) || null, required: requiredPeople(required) })),
  ].filter(entry => entry.time && /^\d{4}-\d{2}-\d{2}$/.test(entry.date))
}

export function ScheduleBoard() {
  const { rows, setRows } = usePlan()
  return <ScheduleChart actual={scheduleEntries(rows('Functions & Events'), rows('Wedding Timeline'))} saveEntry={entry => {
    const section = entry.source === 'Function' ? 'Functions & Events' : 'Wedding Timeline'
    setRows(section, current => current.map((row, i) => {
      if (entry.id !== (entry.source === 'Function' ? row[0] : 'run-' + i)) return row
      const copy = [...row]
      if (entry.source === 'Function') {
        copy[3] = entry.time
        copy[10] = entry.duration === null ? '' : String(entry.duration)
        copy[11] = entry.required === null ? '' : JSON.stringify(entry.required)
      } else {
        copy[1] = entry.time
        copy[8] = entry.duration === null ? '' : entry.duration + ' min'
        copy[10] = entry.required === null ? '' : JSON.stringify(entry.required)
      }
      return copy
    }))
  }} />
}

export function ScheduleChart({ actual, weddingName, saveEntry, personLabel = value => value }: {
  actual: ScheduleEntry[]; weddingName?: string; saveEntry?: (entry: ScheduleEntry) => void; personLabel?: (id: string) => string
}) {
  const [scenario, setScenario] = useState<ScheduleEntry[]>()
  const entries = scenario ?? actual
  const people = [...new Set(['Aarav', 'Meera', ...entries.map(entry => entry.owner).filter(Boolean)])].sort()
  const [selectedDate, setDate] = useState(saveEntry ? '2027-02-14' : '')
  const [selected, setSelected] = useState<string>()
  const [draft, setDraft] = useState<ScheduleEntry>()
  const editor = useRef<HTMLElement>(null)
  const days = [...new Set([...entries.map(entry => entry.date), ...entries.flatMap(entry => {
    if (entry.duration === null || start(entry) + entry.duration <= startOf(entry.date) + dayMinutes) return []
    return [new Date((startOf(entry.date) + dayMinutes) * 60_000).toISOString().slice(0, 10)]
  })])].sort()
  const date = days.includes(selectedDate) ? selectedDate : days[0] || '2027-02-14'
  const day = startOf(date)
  const visible = entries.filter(entry => entry.date === date ||
    (entry.duration !== null && start(entry) < day && start(entry) + entry.duration > day))
    .sort((a, b) => start(a) - start(b))

  const pairs = visible.flatMap((a, index) => visible.slice(index + 1).flatMap(b => {
    if (a.duration === null || b.duration === null) return []
    const from = Math.max(start(a), start(b), day)
    const to = Math.min(start(a) + a.duration, start(b) + b.duration, day + dayMinutes)
    if (to <= from) return []
    const shared = a.required?.filter(person => b.required?.includes(person)) ?? []
    return [{ a, b, from: from - day, to: to - day, shared, unchecked: a.required === null || b.required === null }]
  }))
  const conflicts = pairs.filter(pair => pair.shared.length > 0)
  const incomplete = visible.filter(entry => entry.duration === null || entry.required === null).length
  const min = visible.length ? Math.min(...visible.map(entry => Math.max(0, start(entry) - day))) : 8 * 60
  const max = visible.length ? Math.max(...visible.map(entry => Math.min(dayMinutes, start(entry) - day + (entry.duration ?? 0)))) : 20 * 60
  const left = Math.floor(min / 120) * 120
  const right = Math.min(dayMinutes, Math.max(left + 120, Math.ceil(max / 120) * 120))
  const ticks = Array.from({ length: (right - left) / 120 + 1 }, (_, i) => left + i * 120)
  const scale = (minutes: number) => (minutes - left) / (right - left) * 100 + '%'

  function edit(entry: ScheduleEntry) {
    setSelected(entry.id)
    setDraft(entry)
    editor.current?.scrollIntoView({ block: 'nearest' })
  }

  function save(entry: ScheduleEntry) {
    if (scenario) {
      setScenario(scenario.map(item => item.id === entry.id ? entry : item))
      return
    }
    saveEntry?.(entry)
  }

  if (!days.length) return <p>No functions or activities with a scheduled date and time yet.</p>

  return <div className="schedule-board">
    <section className="focus-card">
      <div className="focus-heading">
        <h2>See the day side by side</h2>
        <label className="focus-field">Schedule date<select value={date} onChange={event => {
          setDate(event.target.value)
          setDraft(undefined)
          setSelected(undefined)
        }}>{days.map(value => <option key={value} value={value}>{showDate(value)}</option>)}</select></label>
      </div>
      <p>Functions and run-sheet activities share one time axis.{saveEntry ? ' Select a row to try a new time or review who must be there.' : ' This view shows saved times and imported durations.'}</p>
      {scenario && <p className="focus-note"><strong>Example scenario.</strong> Changes here stay separate from the current plan.</p>}
      <PrintSection title="Schedule Board" weddingName={weddingName} filters={showDate(date) + (scenario ? ' · Example scenario' : '')}
        columns={['Event', 'Source', 'Start', 'Duration', 'Venue', 'Required people']}
        records={visible.map(entry => [entry.name, entry.source, entry.date === date ? entry.time : 'Continues after midnight',
          entry.duration === null ? 'Unknown' : entry.duration + ' min', entry.place,
          entry.required === null ? 'Needs review' : entry.required.map(personLabel).join(', ') || 'None'])} />
      <p className="focus-note">Bars show known durations. A diamond marks a start with no duration. Workbook owners are shown separately from required attendees.</p>
      <div className="schedule-scroll" tabIndex={0} role="region" aria-label="Day timeline, scroll horizontally for later hours">
        <div className="schedule-plot">
          <div className="schedule-axis" aria-hidden="true"><span /> <div>{ticks.map(tick =>
            <span key={tick} style={{ left: scale(tick) }}>{hourLabel(tick)}</span>)}</div></div>
          {visible.map(entry => {
            const offset = Math.max(left, start(entry) - day)
            const end = Math.min(right, start(entry) - day + (entry.duration ?? 0))
            const clash = conflicts.some(pair => pair.a.id === entry.id || pair.b.id === entry.id)
            const Row = saveEntry ? 'button' : 'div'
            return <Row key={entry.id} className="schedule-row" aria-pressed={saveEntry ? selected === entry.id : undefined} onClick={saveEntry ? () => edit(entry) : undefined}>
              <span className="schedule-name"><strong>{entry.name}</strong>
                <small>{entry.source} · {entry.date === date ? entry.time : 'Continues after midnight'}</small>
                <small>{entry.duration === null ? 'Duration missing' : `${entry.duration} min`} · {entry.place}</small></span>
              <span className="schedule-track" aria-hidden="true">
                {ticks.map(tick => <i key={tick} className="schedule-tick" style={{ left: scale(tick) }} />)}
                <i className={'schedule-block ' + (entry.duration === null ? 'schedule-point' : '') + (clash ? ' schedule-clash' : '')}
                  style={{ left: scale(offset), width: entry.duration === null ? undefined : ((end - offset) / (right - left) * 100) + '%' }} />
              </span>
            </Row>
          })}
        </div>
      </div>
      {saveEntry && <button className="focus-secondary schedule-example" onClick={() => {
        setDate('2027-02-14')
        setScenario(actual.map(entry => entry.id === 'F002' ? { ...entry, time: '19:00', duration: 120, required: ['Aarav'] }
          : entry.id === 'run-2' ? { ...entry, time: '19:00', duration: 60, required: ['Aarav'] } : entry))
        setDraft(undefined)
        setSelected(undefined)
      }}>Try an example conflict</button>}
      {scenario && <button className="focus-secondary schedule-example" onClick={() => {
        setScenario(undefined); setDate('2027-02-14'); setDraft(undefined); setSelected(undefined)
      }}>Back to current plan</button>}
    </section>

    <div className={saveEntry ? 'schedule-panels' : undefined}>
      <section className="focus-card">
        <h2>Overlap check</h2>
        <p role="status"><strong>{conflicts.length} confirmed people {conflicts.length === 1 ? 'conflict' : 'conflicts'}</strong> · {incomplete} {incomplete === 1 ? 'entry needs' : 'entries need'} duration or attendance details</p>
        {incomplete > 0 && <p className="focus-note">Entries with missing durations can’t be checked for overlap. Entries without reviewed attendance can still overlap, but the planner can’t rule out a people conflict.</p>}
        {pairs.length === 0 && <p>No overlap found among entries with known durations for this day.</p>}
        {pairs.map(({ a, b, from, to, shared, unchecked }) => <div className="schedule-pair" key={a.id + ':' + b.id}>
          <strong>{shared.length ? shared.map(personLabel).join(', ') + ' needed in both' : unchecked ? 'Parallel · attendance needs review' : 'Parallel · no shared required people'}</strong>
          <p>{a.name} + {b.name} · {hourLabel(from)}–{hourLabel(to)}</p>
          {saveEntry && <button className="focus-secondary" onClick={() => edit(b)}>Review {b.name}</button>}
        </div>)}
      </section>

      {saveEntry && <section className="focus-card" ref={editor}>
        <h2>Review an event</h2>
        {!draft ? <p>Select a row in the timeline to add a duration or choose who is required.</p> : <form onSubmit={event => {
          event.preventDefault()
          save(draft)
          setDraft(undefined)
          setSelected(undefined)
        }}>
          <h3>{draft.name}</h3>
          <p className="focus-note">{draft.source} · {draft.place} · Owner: {draft.owner || 'Unassigned'}</p>
          <div className="focus-form-grid">
            <label className="focus-field">Start time<input type="time" required value={draft.time} onChange={event => setDraft({ ...draft, time: event.target.value })} /></label>
            <label className="focus-field">Duration (minutes)<input type="number" min="1" max="1440" placeholder="Unknown" value={draft.duration ?? ''}
              onChange={event => setDraft({ ...draft, duration: event.target.value ? Number(event.target.value) : null })} /></label>
          </div>
          <fieldset className="schedule-people">
            <legend>Required people</legend>
            {people.map(person => <label key={person}><input type="checkbox" checked={draft.required?.includes(person) ?? false}
              onChange={event => {
                const current = draft.required ?? []
                setDraft({ ...draft, required: event.target.checked ? [...current, person] : current.filter(name => name !== person) })
              }} />{person}</label>)}
            <div className="focus-actions">
              <button type="button" className="focus-secondary" onClick={() => setDraft({ ...draft, required: [] })}>No one required</button>
              <button type="button" className="focus-secondary" onClick={() => setDraft({ ...draft, required: null })}>Needs review</button>
            </div>
            <p className="focus-note">{draft.required === null ? 'Attendance not yet reviewed.' : draft.required.length ? 'Selected people are required.' : 'No required attendees.'}</p>
          </fieldset>
          <div className="focus-actions"><button>{scenario ? 'Apply to preview' : 'Save to plan'}</button><button type="button" className="focus-secondary" onClick={() => {
            setDraft(undefined); setSelected(undefined)
          }}>Cancel</button></div>
        </form>}
      </section>}
    </div>
    <p className="focus-note">{saveEntry && 'Sample data only. '}The board compares time and required people. Venue capacity, travel buffers and dependencies need separate checks.</p>
  </div>
}

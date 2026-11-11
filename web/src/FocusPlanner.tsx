import { useEffect, useRef, useState } from 'react'
import workbook from './workbook-demo.json'
import { FocusNavigation, FocusPage, focusLink } from './FocusPages'
import { ScheduleBoard } from './ScheduleBoard'
import { SnapshotDownload, usePlan } from './PlanData'
import { PrintSection } from './PlanActions'
import './focus.css'

const rows = (section: string) => workbook.tables.find(table => table.name === section)!.rows
const readEvents = (records: string[][]) => records.map(([id, name, date, time, venue, , , owner, , notes]) => ({ id, name, date, time, venue, owner, notes }))
const followups = rows('RSVP Follow-up').filter(row => row[3] === 'Pending')
const pickups = rows('Transportation').filter(row => row[16] === 'No')
const metrics = workbook.metrics
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const example = 'Ask Brother to confirm sound check for Sangeet'
const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const shortDate = (date: string) => dateFormat.format(new Date(date + 'T00:00:00Z'))

type TaskDraft = { name: string; owner: string; due: string; context: string }
type Task = TaskDraft & { id: number; done: boolean }
type Recognition = {
  lang: string
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition
  webkitSpeechRecognition?: new () => Recognition
}

function draftFromText(text: string, events: ReturnType<typeof readEvents>, owners: string[]): TaskDraft {
  const input = text.trim().replace(/[.!?]+$/, '')
  const match = /^ask (.+?) to (.+)$/i.exec(input)
  const event = events.find(event => input.toLowerCase().endsWith(' for ' + event.name.toLowerCase()))
  const owner = match?.[1] ?? ''
  let name = match?.[2] ?? input
  if (event && name.toLowerCase().endsWith(' for ' + event.name.toLowerCase())) {
    name = name.slice(0, -(event.name.length + 5))
  }
  return {
    name: name.charAt(0).toUpperCase() + name.slice(1),
    owner: owners.find(person => person.toLowerCase() === owner.toLowerCase()) ?? owner,
    due: event?.date ?? '',
    context: event ? 'Suggested date from ' + event.name : '',
  }
}

export function FocusPlanner({ section, filter }: { section?: string; filter: string }) {
  const { rows: currentRows, setRows, storageError } = usePlan()
  const events = readEvents(currentRows('Functions & Events')).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  const payments = currentRows('Vendor Payments').filter(row => Number(row[5]) > 0).sort((a, b) => a[6].localeCompare(b[6]))
  const vendorBalance = payments.reduce((total, row) => total + Number(row[5]), 0)
  const tasks: Task[] = currentRows('Family Responsibilities').map(([name, , owner, , due, status], id) => ({
    id, name, owner, due, done: status === 'Done', context: '',
  }))
  const owners = [...new Set([...events.map(event => event.owner), ...tasks.map(task => task.owner)].filter(Boolean))].sort()
  const [transcript, setTranscript] = useState('')
  const [draft, setDraft] = useState<TaskDraft>()
  const [listening, setListening] = useState(false)
  const [feedback, setFeedback] = useState('')
  const recognition = useRef<Recognition | null>(null)
  const composer = useRef<HTMLElement>(null)
  const taskName = useRef<HTMLInputElement>(null)
  const speechWindow = window as SpeechWindow
  const SpeechRecognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
  const open = tasks.filter(task => !task.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))
  const budget = metrics['Total Budget']
  const paid = metrics['Actual Paid']
  const percentPaid = Math.round(paid / budget * 100)

  useEffect(() => () => {
    if (recognition.current) {
      recognition.current.onresult = null
      recognition.current.onerror = null
      recognition.current.onend = null
      recognition.current.abort()
    }
  }, [])

  useEffect(() => {
    if (draft) taskName.current?.focus()
  }, [Boolean(draft)])

  useEffect(() => {
    if (section) recognition.current?.abort()
  }, [section])

  function openDraft(next: TaskDraft) {
    setFeedback('')
    setDraft(next)
    composer.current?.scrollIntoView({ block: 'nearest' })
  }

  function setDone(id: number, done: boolean) {
    setRows('Family Responsibilities', current => current.map((row, i) =>
      i === id ? row.map((value, column) => column === 5 ? (done ? 'Done' : 'Not Started') : column === 6 ? (done ? '100%' : '0%') : value) : row))
  }

  function startListening() {
    if (!SpeechRecognition || recognition.current) return
    setFeedback('')
    const session = new SpeechRecognition()
    recognition.current = session
    session.lang = 'en-IN'
    session.onresult = event => {
      setTranscript(event.results[0][0].transcript)
      setDraft(undefined)
      setFeedback('Transcript ready. Check the wording, then review your task.')
    }
    session.onerror = () => setFeedback('Voice input is unavailable right now. You can type or use the example.')
    session.onend = () => {
      recognition.current = null
      setListening(false)
    }
    try {
      session.start()
      setListening(true)
    } catch {
      recognition.current = null
      setFeedback('Could not start the microphone. You can type or use the example.')
    }
  }

  const checklist = <section className="focus-card">
    <div className="focus-heading"><h2>Family checklist</h2><span className="focus-chip" aria-live="polite">{open.length} open</span></div>
    {open.length === 0 && <p>All tasks complete.</p>}
    {open.map(task => <div className="focus-item" key={task.id}>
      <span><strong>{task.name}</strong><small>{task.owner || 'Unassigned'}{task.due && ' · ' + shortDate(task.due)}</small></span>
      <button className="focus-secondary" aria-label={'Mark done: ' + task.name}
        onClick={() => setDone(task.id, true)}>Done</button>
    </div>)}
    <details className="focus-completed"><summary>Completed ({tasks.length - open.length})</summary>
      {tasks.filter(task => task.done).map(task => <div className="focus-item" key={task.id}>
        <span>{task.name}</span><button className="focus-secondary" aria-label={'Reopen: ' + task.name}
          onClick={() => setDone(task.id, false)}>Reopen</button>
      </div>)}
    </details>
  </section>

  return <main className="focus">
    <header className="focus-hero">
      <div><p className="focus-kicker">SHAADI PLANNER PRO / ALTERNATE CONCEPT</p>
        <h1>{section ?? 'Aarav & Meera'}</h1><p>{section && 'Aarav & Meera · '}15 Feb 2027 · Varanasi</p></div>
      <div className="focus-actions">
        {!section && <a className="focus-secondary" href="#workspace">Start planning</a>}
        {!section && <button onClick={() => {
          composer.current?.scrollIntoView({ block: 'start' })
          composer.current?.querySelector('textarea')?.focus({ preventScroll: true })
        }}>+ Capture a task</button>}
        <a className="focus-secondary" href={section === 'Schedule Board' ? '#wedding-timeline' : section ? focusLink(section).replace('#focus/', '#') : '#dashboard'}>← Workbook view</a>
        <SnapshotDownload />
      </div>
    </header>
    <p className="focus-note">Sample wedding. Plan changes are saved in this browser. Use fictional details in this local workspace.</p>
    {storageError && <p role="alert">Browser storage is unavailable. Download a snapshot before closing this tab.</p>}
    <FocusNavigation section={section} />

    {section === 'Schedule Board' ? <ScheduleBoard /> : section === 'Family Responsibilities' ? <div className="focus-task-page">
      <PrintSection title={section} columns={['Task', 'Owner', 'Due date', 'Status']} records={tasks.map(task => [task.name, task.owner, task.due ? shortDate(task.due) : '', task.done ? 'Done' : 'Open'])} />
      <p><a href="#focus">Capture a task on the overview →</a></p>{checklist}
    </div> : section ? <FocusPage key={section + ':' + filter} section={section} initialFilter={filter} /> : <div className="focus-columns">
      <div className="focus-stack">
        <section className="focus-card focus-attention">
          <p className="focus-kicker">01 / WHAT NEEDS YOU</p>
          <h2>Next actions</h2>
          <a className="focus-item" href={focusLink('RSVP Follow-up')}>
            <span><strong>{metrics['Pending RSVP']} guests awaiting replies</strong><small>{followups.length} pending household follow-ups already listed</small></span><span aria-hidden="true">→</span>
          </a>
          {pickups.map(row => <div className="focus-item" key={row[4]}>
            <span><strong>Confirm pickup for {row[8]}</strong><small>{row[2]} · {row[10]} passengers · {shortDate(row[0])}</small></span>
            <button className="focus-secondary" onClick={() => openDraft({
              name: 'Confirm pickup for ' + row[8], owner: row[14], due: row[0], context: 'Suggested owner and date from Transportation',
            })}>Draft task</button>
          </div>)}
          <a className="focus-item" href={focusLink('Vendor Payments')}>
            <span><strong>{money.format(Number(payments[0][5]))} to {payments[0][1]}</strong><small>Earliest outstanding payment · {shortDate(payments[0][6])} · {payments[0][7]}</small></span><span aria-hidden="true">→</span>
          </a>
        </section>

        {checklist}
      </div>

      <div className="focus-stack">
        <section className="focus-card focus-compose" ref={composer}>
          <p className="focus-kicker">02 / CAPTURE IT QUICKLY</p>
          <h2>Say it. Make it a task.</h2>
          <p>Try “{example}.” Review the details before adding it.</p>
          <div className="focus-actions">
            {SpeechRecognition && <button disabled={listening} onClick={startListening}>{listening ? 'Listening…' : '🎙 Use microphone'}</button>}
            {listening && <button className="focus-secondary" onClick={() => recognition.current?.abort()}>Cancel recording</button>}
            <button className="focus-secondary" onClick={() => {
              setTranscript(example)
              openDraft(draftFromText(example, events, owners))
            }}>Try example</button>
          </div>
          <p className="focus-note">{SpeechRecognition
            ? 'Your browser may use its speech service to process audio. Use fictional details in this preview.'
            : 'Voice input is unavailable in this browser. Type below or try the example.'}</p>
          <label className="focus-field">Task idea or transcript
            <textarea rows={2} maxLength={300} value={transcript} onChange={event => setTranscript(event.target.value)} />
          </label>
          <button className="focus-secondary" disabled={!transcript.trim()} onClick={() => openDraft(draftFromText(transcript, events, owners))}>Review task</button>
          {feedback && <p role="status" className="focus-feedback">{feedback}</p>}
          {draft && <form className="focus-draft" onSubmit={event => {
            event.preventDefault()
            if (!draft.name.trim()) return
            setRows('Family Responsibilities', current => [...current, [
              draft.name.trim(), '', draft.owner.trim(), '', draft.due, 'Not Started', '0%', '', '', '',
            ]])
            setDraft(undefined)
            setTranscript('')
            setFeedback('Added to the family checklist.')
          }}>
            <h3>Review before adding</h3>
            {draft.context && <p className="focus-note">{draft.context}. Confirm or change below.</p>}
            <label className="focus-field">Task name<input ref={taskName} required maxLength={300} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
            <div className="focus-form-grid">
              <label className="focus-field">Assign to<input list="focus-owners" value={draft.owner} maxLength={120} onChange={event => setDraft({ ...draft, owner: event.target.value })} /></label>
              <datalist id="focus-owners">{owners.map(owner => <option key={owner} value={owner} />)}</datalist>
              <label className="focus-field">Due date<input type="date" value={draft.due} onChange={event => setDraft({ ...draft, due: event.target.value })} /></label>
            </div>
            <div className="focus-actions"><button disabled={!draft.name.trim()}>Add to checklist</button><button className="focus-secondary" type="button" onClick={() => setDraft(undefined)}>Discard draft</button></div>
          </form>}
        </section>

        <section className="focus-card">
          <div className="focus-heading"><h2>Money at a glance</h2><a href={focusLink('Budget vs Actual')}>See breakdown →</a></div>
          <div className="focus-money"><strong>{money.format(paid)}</strong><span>paid of {money.format(budget)} planned</span></div>
          <progress value={paid} max={budget} aria-label="Paid against planned budget" />
          <div className="focus-item"><span>{percentPaid}% paid</span><strong>{money.format(budget - paid)} remaining</strong></div>
          <p className="focus-note">Remaining budget uses the category plan. Outstanding vendor contracts total {money.format(vendorBalance)} separately.</p>
        </section>
        <section className="focus-card">
          <div className="focus-heading"><h2>Wedding schedule</h2><a href={focusLink('Functions & Events')}>Full plan →</a></div>
          <p><a href={focusLink('Schedule Board')}>Check schedule overlaps →</a></p>
          {events.map(event => <div className="focus-item" key={event.id}>
            <span><strong>{event.name}</strong><small>{shortDate(event.date)} · {event.time} · {event.venue}</small></span>
            {event.notes.startsWith('Sound check at ') && <button className="focus-secondary" onClick={() => openDraft({
              name: 'Confirm ' + event.notes.toLowerCase() + ' for ' + event.name,
              owner: event.owner, due: event.date, context: 'Suggested from ' + event.name + ' notes',
            })}>Draft sound check</button>}
          </div>)}
        </section>
      </div>
    </div>}
  </main>
}

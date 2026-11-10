import { useState } from 'react'
import type { FormEvent } from 'react'
import workbook from './workbook-demo.json'

export const blankWorkbookURL = '/Shaadi-Planner-Pro-English-Blank.xlsx'

export function SetupOptions() {
  return <div className="setup-options">
    <section className="planner-card">
      <h2>Upload my workbook</h2>
      <p>Already planning in Excel? See how a filled workbook becomes a wedding workspace.</p>
      <a className="package-button" href="#setup-upload">Try workbook upload</a>
      <a href={blankWorkbookURL} download>Download the blank Excel planner</a>
    </section>
    <section className="planner-card">
      <h2>Start a blank wedding</h2>
      <p>Enter your wedding details, add a function, and give someone their first task.</p>
      <a className="package-button" href="#setup-blank">Start a blank wedding</a>
    </section>
    <section className="planner-card">
      <h2>Explore the sample</h2>
      <p>See the filled Aarav & Meera wedding, including guests, budgets, rooms and transport.</p>
      <a className="package-button" href="#dashboard">Open sample dashboard</a>
    </section>
  </div>
}

export function WorkbookSetup() {
  const [review, setReview] = useState(false)
  return <section className="planner-card setup-panel">
    {!review ? <>
      <p className="eyebrow">Step 1 of 2 · Workbook</p>
      <h2>Choose a workbook</h2>
      <p>Try the import flow with the filled English v1.3.1 workbook for Aarav & Meera.</p>
      <p className="subtle">This walkthrough uses the included sample. To upload your own file, sign in to the private workspace.</p>
      <div className="actions">
        <button onClick={() => setReview(true)}>Use filled sample workbook</button>
        <a href="#workspace">Upload my own workbook →</a>
        <a href={blankWorkbookURL} download>Download the blank Excel planner</a>
      </div>
    </> : <>
      <p className="eyebrow">Step 2 of 2 · Review</p>
      <h2>Review workbook import</h2>
      <p><strong>Aarav & Meera Wedding</strong> · English v1.3.1 sample</p>
      <p>Here’s what would be carried into your wedding. Guest links in follow-ups, room assignments and transport are carried over with the guest records.</p>
      <dl className="import-counts">{workbook.tables.map(table => <div key={table.name}>
        <dt>{table.name}</dt><dd>{table.rows.length}</dd>
      </div>)}</dl>
      <details>
        <summary>How workbook issues will appear</summary>
        <p className="subtle">Illustrative issue</p>
        <p><strong>Accommodation · Row 9.</strong> Guest G099 is missing from the Guest List. Add the guest or correct the guest ID, then upload again.</p>
      </details>
      <div className="actions setup-actions">
        <button className="secondary" onClick={() => setReview(false)}>Back</button>
        <a className="package-button" href="#dashboard?import=sample">Create sample wedding</a>
      </div>
    </>}
  </section>
}

type WeddingDetails = { name: string; date: string; city: string }
type WeddingFunction = { name: string; date: string; time: string; venue: string }
type FamilyTask = { name: string; owner: string; due: string; done: boolean }
type Step = 'wedding' | 'function' | 'task' | 'dashboard'

function field(form: HTMLFormElement, name: string) {
  return String(new FormData(form).get(name) ?? '').trim()
}

function submit(event: FormEvent<HTMLFormElement>, textFields: string[], save: (form: HTMLFormElement) => void) {
  event.preventDefault()
  const form = event.currentTarget
  for (const name of textFields) {
    if (!field(form, name)) {
      const input = form.elements.namedItem(name) as HTMLInputElement
      input.setCustomValidity('Enter a value.')
      input.reportValidity()
      return
    }
  }
  save(form)
}

function TextInput({ label, name, value = '' }: { label: string; name: string; value?: string }) {
  return <label>{label}<input name={name} defaultValue={value} required maxLength={120}
    onInput={event => event.currentTarget.setCustomValidity('')} /></label>
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(value + 'T00:00:00Z'))
}

export function BlankSetup() {
  const [step, setStep] = useState<Step>('wedding')
  const [wedding, setWedding] = useState<WeddingDetails>()
  const [event, setEvent] = useState<WeddingFunction>()
  const [task, setTask] = useState<FamilyTask>()

  if (step === 'dashboard' && wedding && event && task) {
    return <>
      <section className="planner-card setup-panel">
        <p className="eyebrow">Draft wedding dashboard</p>
        <div className="card-heading"><h2>{wedding.name}</h2><button className="secondary" onClick={() => setStep('wedding')}>Edit details</button></div>
        <p>{wedding.city} · {shortDate(wedding.date)}</p>
        <p role="status"><strong>{task.done ? 0 : 1}</strong> open {task.done ? 'tasks' : 'task'} · <strong>1</strong> function</p>
      </section>
      <div className="dashboard-grid setup-draft-grid">
        <section className="planner-card">
          <div className="card-heading"><h2>Functions & events</h2><button className="secondary" onClick={() => setStep('function')}>Edit function</button></div>
          <p><strong>{event.name}</strong></p>
          <p>{shortDate(event.date)} · {event.time} · {event.venue}</p>
        </section>
        <section className="planner-card">
          <div className="card-heading"><h2>Family responsibilities</h2><button className="secondary" onClick={() => setStep('task')}>Edit task</button></div>
          <p><strong>{task.name}</strong></p>
          <p>{task.owner} · Due {shortDate(task.due)}</p>
          <button onClick={() => setTask({ ...task, done: !task.done })}>{task.done ? 'Reopen task' : 'Mark task done'}</button>
        </section>
      </div>
    </>
  }

  return <section className="planner-card setup-panel">
    {step === 'wedding' && <>
      <p className="eyebrow">Step 1 of 3 · Wedding</p><h2>Enter your wedding details</h2>
      <form className="setup-form" onSubmit={event => submit(event, ['name', 'city'], form => {
        setWedding({ name: field(form, 'name'), date: field(form, 'date'), city: field(form, 'city') })
        setStep('function')
      })}>
        <TextInput label="Wedding name" name="name" value={wedding?.name} />
        <label>Wedding date<input type="date" name="date" required defaultValue={wedding?.date} /></label>
        <TextInput label="City" name="city" value={wedding?.city} />
        <div className="actions"><button>Continue to functions</button></div>
      </form>
    </>}
    {step === 'function' && <>
      <p className="eyebrow">Step 2 of 3 · Function</p><h2>{event ? 'Edit your function' : 'Add your first function'}</h2>
      <form className="setup-form" onSubmit={submission => submit(submission, ['name', 'venue'], form => {
        setEvent({ name: field(form, 'name'), date: field(form, 'date'), time: field(form, 'time'), venue: field(form, 'venue') })
        setStep('task')
      })}>
        <TextInput label="Function name" name="name" value={event?.name} />
        <label>Function date<input type="date" name="date" required defaultValue={event?.date ?? wedding?.date} /></label>
        <label>Start time<input type="time" name="time" required defaultValue={event?.time} /></label>
        <TextInput label="Venue" name="venue" value={event?.venue} />
        <div className="actions"><button className="secondary" type="button" onClick={() => setStep('wedding')}>Back</button><button>Continue to family tasks</button></div>
      </form>
    </>}
    {step === 'task' && <>
      <p className="eyebrow">Step 3 of 3 · Family task</p><h2>{task ? 'Edit your family task' : 'Assign your first family task'}</h2>
      <form className="setup-form" onSubmit={event => submit(event, ['name', 'owner'], form => {
        setTask({ name: field(form, 'name'), owner: field(form, 'owner'), due: field(form, 'due'), done: task?.done ?? false })
        setStep('dashboard')
      })}>
        <TextInput label="Task name" name="name" value={task?.name} />
        <TextInput label="Assign to" name="owner" value={task?.owner} />
        <label>Due date<input type="date" name="due" required defaultValue={task?.due} /></label>
        <div className="actions"><button className="secondary" type="button" onClick={() => setStep('function')}>Back</button><button>Open draft dashboard</button></div>
      </form>
    </>}
  </section>
}

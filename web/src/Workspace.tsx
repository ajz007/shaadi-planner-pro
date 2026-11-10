import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { ImportedPlanningRecords, useImportedPlanningRecords, WorkspaceImport } from './WorkspaceImport'
import { WorkspaceGuests } from './WorkspaceGuests'
import type { Guest } from './WorkspaceGuests'
import { FocusNavigation, focusLink, PlanningSection } from './FocusPages'
import { ScheduleChart, scheduleEntries } from './ScheduleBoard'
import { WorkspaceTransport } from './WorkspaceTransport'

type Session = { configured: boolean; name?: string; workspaceURL?: string; localTest?: boolean }
type Wedding = { id: string; name: string; date: string; timeZone: string; role: string; personId: string }
type Person = { id: string; name: string }
type WeddingFunction = { id: string; name: string; venue: string; startsAt: string }
type Task = { id: string; title: string; assignee: string | null; function: string | null; due: string | null; claimable: boolean; done: boolean; revision: number }
type Plan = { wedding: Wedding; people: Person[]; functions: WeddingFunction[]; tasks: Task[] }
const root = '/api/workspace'

const weddingPage = (id: string, section?: string, workbook = false) => '#workspace/' + id +
  (section ? '/' + (section === 'Import history' ? 'import-history' : focusLink(section).slice(7)) : '') + (workbook ? '?layout=workbook' : '')

async function workspaceRequest<T>(path: string, body?: object, signal?: AbortSignal): Promise<T> {
  const result = await fetch(root + path, body === undefined ? { signal } : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (result.status === 204) return undefined as T
  const data = await result.json()
  if (!result.ok) throw new Error(data.error || 'The workspace request could not be completed.')
  return data
}

const field = (data: FormData, name: string) => String(data.get(name) ?? '').trim()
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong.'

function WorkspaceForm({ title, label, onSave, children }: {
  title: string; label: string; onSave: (data: FormData) => Promise<void>; children: ReactNode
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setBusy(true)
    setError('')
    try {
      await onSave(new FormData(form))
      form.reset()
    } catch (error) {
      setError(errorText(error))
    } finally {
      setBusy(false)
    }
  }
  return <form className="focus-card" onSubmit={event => void submit(event)}>
    <h2>{title}</h2>
    <fieldset className="workspace-fields" disabled={busy}>{children}<button>{busy ? 'Saving…' : label}</button></fieldset>
    {error && <p role="alert">{error}</p>}
  </form>
}

function TextField({ name, label, type = 'text', required = true, value, maxLength = 120 }: {
  name: string; label: string; type?: string; required?: boolean; value?: string; maxLength?: number
}) {
  return <label className="focus-field">{label}<input name={name} type={type} required={required} defaultValue={value} maxLength={maxLength} /></label>
}

function WeddingWorkspace({ plan, refresh, section, workbookView, guestSearch }: {
  plan: Plan; refresh: () => Promise<void>; section?: string; workbookView: boolean; guestSearch: string
}) {
  const { wedding, people, functions, tasks } = plan
  const [invite, setInvite] = useState('')
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const path = '/weddings/' + wedding.id
  const organizer = wedding.role !== 'family'
  const owner = wedding.role === 'owner'
  const imported = useImportedPlanningRecords(wedding.id, owner)
  const [guests, setGuests] = useState<Guest[]>()
  const [guestError, setGuestError] = useState('')
  useEffect(() => {
    if (!organizer || section === 'Guest List') return
    const controller = new AbortController()
    setGuestError('')
    workspaceRequest<Guest[]>(path + '/guests', undefined, controller.signal)
      .then(setGuests).catch(error => { if (!controller.signal.aborted) setGuestError(errorText(error)) })
    return () => controller.abort()
  }, [organizer, path, section])
  const href = (page?: string) => weddingPage(wedding.id, page, workbookView)
  const canSee = (page: string) => owner || page === 'Functions & Events' || page === 'Family Responsibilities' ||
    (organizer && ['Guest List', 'Schedule Board', 'Settings', 'Transportation'].includes(page))
  const personName = (id: string | null) => people.find(person => person.id === id)?.name ?? 'Unassigned'
  const functionName = (id: string | null) => functions.find(event => event.id === id)?.name
  const eventTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: wedding.timeZone })
  const myTasks = tasks.filter(task => task.assignee === wedding.personId)
  const help = tasks.filter(task => task.claimable && !task.assignee && !task.done)
  const otherTasks = organizer ? tasks.filter(task => task.assignee !== wedding.personId && !help.includes(task)) : []
  const functionParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: wedding.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  const functionRows = functions.map(event => {
    const parts = Object.fromEntries(functionParts.formatToParts(new Date(event.startsAt)).map(part => [part.type, part.value]))
    return [event.id, event.name, parts.year + '-' + parts.month + '-' + parts.day, parts.hour + ':' + parts.minute, event.venue, '', '', '', '', '']
  })
  const timeline = imported.data?.sections.find(item => item.name === 'Wedding Timeline')?.rows.map(row => row.values) ?? []
  const overview = section === undefined
  const showTasks = section === 'Family Responsibilities' || (overview && !organizer)
  const showFunctions = section === 'Functions & Events' || (overview && !organizer)
  const activeSection = imported.data?.sections.find(item => item.name === section)
  const displayMoney = (amount: number) => new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(amount / 100)
  const linkedGuests = new Map((guests ?? []).map(guest => [guest.workbookId, guest]))
  const sectionRows = (item: NonNullable<typeof activeSection>) => item.rows.map(row => {
    const values = [...row.values]
    for (const [index, id] of Object.entries(row.guestLinks ?? {})) {
      const guest = linkedGuests.get(id)
      if (guest) values[Number(index)] = guest.workbookId + ' | ' + guest.name
    }
    if (item.name === 'RSVP Follow-up') {
      const guest = linkedGuests.get(row.guestLinks?.[0] ?? '')
      if (guest) { values[1] = guest.household; values[3] = guest.rsvp }
    }
    if (item.name === 'Accommodation' || item.name === 'Transportation') {
      const room = item.name === 'Accommodation'
      const guest = linkedGuests.get(row.guestLinks?.[room ? 3 : 4] ?? '')
      if (guest) {
        values[room ? 7 : 8] = guest.household
        if (room) values[8] = guest.side
      }
      values[room ? 9 : 10] = String(Object.keys(row.guestLinks ?? {}).length)
    }
    if (item.name === 'Budget vs Actual') values[3] = String(Number(values[1]) - Number(values[2]))
    if (item.name === 'Vendor Payments') values[5] = String(Number(values[3]) - Number(values[4]))
    return values
  })

  async function mutate(action: string, body: object) {
    await workspaceRequest(path + '/' + action, body)
    await refresh().catch(() => setFeedback('Saved. Select Refresh plan to see the latest records.'))
  }

  async function update(action: string, body: object) {
    setBusy(true)
    setFeedback('')
    try {
      await mutate(action, body)
    } catch (error) {
      setFeedback(errorText(error))
      await refresh().catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }

  function taskList(title: string, items: Task[], claim = false) {
    const action = (task: Task) => <button disabled={busy} className="focus-secondary" onClick={() => void update(claim ? 'claim' : 'complete', {
      task: task.id, ...(claim ? {} : { revision: task.revision, done: !task.done }),
    })}>{claim ? 'I’ll do it' : task.done ? 'Reopen' : 'Mark done'}</button>
    return <section className="focus-card">
      <div className="focus-heading"><h2>{title}</h2><span className="focus-chip">{items.filter(task => !task.done).length} open</span></div>
      {items.length === 0 && <p>No tasks here yet.</p>}
      {workbookView && items.length > 0 ? <div className="table-scroll" tabIndex={0} role="region" aria-label={title + ' table'}>
        <table className="imported-records"><thead><tr><th>Task</th><th>Due</th><th>Assignee</th><th>Action</th></tr></thead>
          <tbody>{items.map(task => <tr key={task.id}><td>{task.title}</td><td>{task.due}</td><td>{personName(task.assignee)}</td><td>{action(task)}</td></tr>)}</tbody>
        </table>
      </div> : items.map(task => <div className="focus-item" key={task.id}>
        <span><strong>{task.title}</strong><small>{[task.done ? 'Done' : '', task.due ? 'Due ' + task.due : '', functionName(task.function), organizer && !claim ? personName(task.assignee) : ''].filter(Boolean).join(' · ')}</small></span>
        {action(task)}
      </div>)}
    </section>
  }

  return <>
    <header className="focus-hero wedding-hero">
      <div><p className="focus-kicker">{section ?? (organizer ? 'WEDDING OVERVIEW' : 'MY WEDDING TASKS')}</p>
        <h1>{wedding.name}</h1><p>{wedding.date} · {wedding.timeZone}</p></div>
      <div className="focus-actions">
        {organizer && <a className="focus-secondary" href={weddingPage(wedding.id, section, !workbookView) + (guestSearch ? (workbookView ? '?' : '&') + 'guest=' + encodeURIComponent(guestSearch) : '')}>{workbookView ? 'Card view' : 'Workbook view'}</a>}
        {owner && <a className="focus-secondary" href={root + path + '/snapshot.xlsx'} download>Download current Excel snapshot</a>}
      </div>
    </header>
    <FocusNavigation section={section} hrefFor={href} home={href()} canSee={canSee} />
    {feedback && <p role="alert">{feedback}</p>}
    {section && !canSee(section) ? <p role="status">This page is unavailable for your role. <a href={href()}>Return to overview</a>.</p>
      : section === 'Guest List' ? <WorkspaceGuests key={guestSearch} wedding={wedding} initialSearch={guestSearch} workbookView={workbookView} />
      : section === 'Transportation' ? <WorkspaceTransport wedding={wedding} people={people} workbookView={workbookView} />
      : section === 'Schedule Board' ? <ScheduleChart actual={scheduleEntries(functionRows, timeline)} weddingName={wedding.name} />
      : section === 'Import history' ? <><p><a href={href('Settings')}>← Wedding settings</a></p><ImportedPlanningRecords {...imported} /></>
      : section && !showTasks && !showFunctions && section !== 'Settings' ? <>
        <h2>{section}</h2>
        {imported.error ? <p role="alert">{imported.error}</p>
          : !imported.data ? <p role="status">Loading planning records…</p>
          : activeSection ? <>
            <p className="focus-note">Read-only. These records came from your workbook.</p>
            {guestError && <p role="alert">Live guest details could not be loaded. Refresh to check linked records.</p>}
            <PlanningSection key={section} section={section} table={{ columns: activeSection.columns, rows: sectionRows(activeSection) }}
              weddingName={wedding.name} hrefFor={href} workbookView={workbookView} />
          </> : <p>No {section.toLowerCase()} records have been imported for this wedding.</p>}
      </> : <>
    {organizer && overview && <>
      <div className="focus-summary wedding-overview-metrics">
        <a className="focus-card" href={href('Guest List')}><strong>Guests</strong><span>{guests ? guests.length + ' guests · ' + guests.filter(guest => guest.rsvp === 'Confirmed').length + ' confirmed' : 'Open Guest List'}</span></a>
        <a className="focus-card" href={href('Functions & Events')}><strong>Functions</strong><span>{functions.length} scheduled</span></a>
        <a className="focus-card" href={href('Family Responsibilities')}><strong>Family tasks</strong><span>{tasks.filter(task => !task.done).length} open</span></a>
        {owner && <a className="focus-card" href={href('Budget vs Actual')}><strong>Budget</strong><span>{imported.data?.sections.length
          ? displayMoney(imported.data.totals.paidPaise) + ' paid' : 'Open budget'}</span></a>}
      </div>
      <div className="focus-record-grid">
        <section className="focus-card"><div className="focus-heading"><h2>Needs attention</h2><a href={href('Family Responsibilities')}>See tasks →</a></div>
          {guests?.some(guest => guest.rsvp === 'Pending' || guest.rsvp === 'Maybe') &&
            <p><a href={href('Guest List')}>{guests.filter(guest => guest.rsvp === 'Pending' || guest.rsvp === 'Maybe').length} guests awaiting a reply →</a></p>}
          {tasks.filter(task => !task.done).slice(0, 4).map(task => <div className="focus-item" key={task.id}><span><strong>{task.title}</strong>
            <small>{personName(task.assignee)}{task.due && ' · Due ' + task.due}</small></span></div>)}
          {!tasks.some(task => !task.done) && <p>No open tasks.</p>}
        </section>
        <section className="focus-card"><div className="focus-heading"><h2>Wedding schedule</h2><a href={href('Schedule Board')}>Open Schedule Board →</a></div>
          {functions.length === 0 && <p>No functions scheduled yet.</p>}
          {functions.slice(0, 4).map(event => <div className="focus-item" key={event.id}><span><strong>{event.name}</strong>
            <small>{eventTime.format(new Date(event.startsAt))}{event.venue && ' · ' + event.venue}</small></span></div>)}
        </section>
      </div>
    </>}
    {(!overview || !organizer) && <div className="focus-record-grid">
      {showTasks && taskList('My tasks', myTasks)}
      {showTasks && taskList('Help needed', help, true)}
      {showTasks && organizer && taskList('Other tasks', otherTasks)}
      {showFunctions && <section className="focus-card">
        <div className="focus-heading"><h2>Functions &amp; Events</h2>{organizer && <a href={href('Schedule Board')}>Open Schedule Board →</a>}</div>
        {functions.length === 0 && <p>No functions added yet.</p>}
        {workbookView ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Functions table">
          <table className="imported-records"><thead><tr><th>Function</th><th>Starts</th><th>Venue</th></tr></thead>
            <tbody>{functions.map(event => <tr key={event.id}><td>{event.name}</td><td>{eventTime.format(new Date(event.startsAt))}</td><td>{event.venue}</td></tr>)}</tbody>
          </table></div> : functions.map(event => <div className="focus-item" key={event.id}><span><strong>{event.name}</strong>
          <small>{eventTime.format(new Date(event.startsAt))}{event.venue && ' · ' + event.venue}</small></span></div>)}
      </section>}
      {section === 'Settings' && <section className="focus-card">
        {activeSection ? <PlanningSection section="Settings" table={{ columns: activeSection.columns, rows: sectionRows(activeSection) }}
          weddingName={wedding.name} /> : <><h2>Wedding settings</h2><p>{wedding.name} · {wedding.date} · {wedding.timeZone}</p></>}
        {owner && <a href={href('Import history')}>Import history →</a>}
      </section>}
      {organizer && section === 'Settings' &&
        <WorkspaceForm title="Add a planning person" label="Add person" onSave={data => mutate('people', { name: field(data, 'name') })}>
          <p>Add a name now and invite the person when you’re ready.</p>
          <TextField name="name" label="Planning name" />
        </WorkspaceForm>}
      {organizer && section === 'Functions & Events' &&
        <WorkspaceForm title="Add a function" label="Add function" onSave={data => mutate('functions', {
          name: field(data, 'name'), venue: field(data, 'venue'), startsAt: field(data, 'start'),
        })}>
          <TextField name="name" label="Function name" />
          <TextField name="start" label={'Starts in ' + wedding.timeZone} type="datetime-local" />
          <TextField name="venue" label="Venue" required={false} maxLength={200} />
        </WorkspaceForm>}
      {organizer && section === 'Family Responsibilities' &&
        <WorkspaceForm title="Add a task" label="Add task" onSave={data => mutate('tasks', {
          title: field(data, 'title'), assignee: field(data, 'assignee') || null, function: field(data, 'function') || null,
          due: field(data, 'due') || null, claimable: data.has('claimable'),
        })}>
          <TextField name="title" label="Task name" maxLength={240} />
          <label className="focus-field">Assign to<select name="assignee"><option value="">Unassigned</option>
            {people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
          <label className="focus-field">Related function<select name="function"><option value="">None</option>
            {functions.map(event => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label>
          <TextField name="due" label="Due date" type="date" required={false} />
          <label><input name="claimable" type="checkbox" /> Let a family member claim this unassigned task</label>
        </WorkspaceForm>}
      {owner && section === 'Settings' && <>
        <WorkspaceForm title="Invite someone" label="Create invite code" onSave={async data => {
          const result = await workspaceRequest<{ token: string }>(path + '/invite', { person: field(data, 'person'), role: field(data, 'role') })
          setInvite(result.token)
        }}>
          <label className="focus-field">Link to planning person<select name="person" required>
            <option value="">Choose a person</option>{people.filter(person => person.id !== wedding.personId).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select></label>
          <label className="focus-field">Role<select name="role"><option value="family">Family member</option><option value="co-organizer">Co-organizer</option></select></label>
        </WorkspaceForm>
        {invite && <section className="focus-card">
          <h2>Share the invite code</h2><p>Send it privately to the intended person. They sign in and paste it into Join a wedding. It expires in 24 hours.</p>
          <label className="focus-field">Invite code<input readOnly value={invite} onFocus={event => event.target.select()} /></label>
          <button className="focus-secondary" disabled={busy} onClick={() => void workspaceRequest(path + '/revoke', { token: invite })
            .then(() => setInvite('')).catch(error => setFeedback(errorText(error)))}>Revoke invite</button>
        </section>}
      </>}
    </div>}
    </>}
  </>
}

export function Workspace({ loginFailed, weddingID, section, workbookView, guestSearch, setup }: {
  loginFailed: boolean; weddingID?: string; section?: string; workbookView: boolean; guestSearch: string; setup: boolean
}) {
  const [session, setSession] = useState<Session>()
  const [weddings, setWeddings] = useState<Wedding[]>([])
  const [plan, setPlan] = useState<Plan>()
  const [error, setError] = useState('')
  const [planError, setPlanError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    workspaceRequest<Session>('/session').then(async session => {
      setSession(session)
      if (session.name) setWeddings(await workspaceRequest<Wedding[]>('/weddings'))
    }).catch(error => setError(errorText(error)))
  }, [])

  const signedIn = Boolean(session?.name)
  useEffect(() => {
    setPlan(undefined)
    setPlanError('')
    if (!signedIn || !weddingID) return
    const controller = new AbortController()
    workspaceRequest<Plan>('/weddings/' + weddingID, undefined, controller.signal)
      .then(setPlan).catch(error => { if (!controller.signal.aborted) setPlanError(errorText(error)) })
    return () => controller.abort()
  }, [signedIn, weddingID])

  async function refreshPlan(id: string) {
    const refreshed = await workspaceRequest<Plan>('/weddings/' + id)
    setPlan(current => current?.wedding.id === id ? refreshed : current)
  }

  async function refreshList(id: string) {
    window.location.hash = weddingPage(id)
    try {
      setWeddings(await workspaceRequest<Wedding[]>('/weddings'))
    } catch {
      setError('The wedding was saved. Refresh to update My weddings.')
    }
  }

  return <main className="focus">
    {!weddingID && <header className="focus-hero">
      <div><p className="focus-kicker">SHAADI PLANNER PRO</p><h1>{session?.name ? (setup ? 'Set up a wedding' : 'My weddings') : 'Private workspace'}</h1></div>
      <a className="focus-secondary" href="#dashboard">Open sample planner</a>
    </header>}
    {error && <p role="alert">{error}</p>}
    {!session && !error && <p>Opening workspace…</p>}
    {session && !session.configured && <section className="focus-card">
      <h2>Workspace setup required</h2><p>Set up PostgreSQL and Google sign-in to create or join a private wedding. The sample planner is available above.</p>
    </section>}
    {session?.workspaceURL && <p><a href={session.workspaceURL}>Open the configured workspace address →</a></p>}
    {session?.configured && !session.workspaceURL && !session.name && <section className="focus-card">
      <h2>Sign in to plan together</h2>
      {loginFailed && <p role="alert">Sign-in could not finish. Try again.</p>}
      {session.localTest ? <>
        <p>Local test accounts share this computer’s test database. Use sample data.</p>
        <div className="focus-actions">{[['owner', 'Test owner'], ['family', 'Test family member'], ['cousin', 'Test cousin']].map(([account, label]) =>
          <button className="focus-secondary" key={account} disabled={busy} onClick={() => {
            setBusy(true)
            fetch('/auth/local', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account }) })
              .then(result => { if (!result.ok) throw new Error('Could not open the test account.'); window.location.reload() })
              .catch(error => { setError(errorText(error)); setBusy(false) })
          }}>{label}</button>)}</div>
      </> : <><p>Use your Google account to create a wedding or accept a family invite.</p>
        <a className="focus-secondary" href="/auth/google/start">Continue with Google</a></>}
    </section>}
    {session?.name && <>
      <div className="focus-heading workspace-topline">
        {(weddingID || setup) && <a href="#workspace">← My weddings</a>}
        <span>Signed in as {session.name} · <button className="focus-secondary" disabled={busy}
          onClick={() => void workspaceRequest('/logout', {}).then(() => window.location.assign('/')).catch(error => setError(errorText(error)))}>Sign out</button></span>
      </div>
      {weddingID ? <>
        {plan?.wedding.id === weddingID
          ? <WeddingWorkspace key={weddingID} plan={plan} section={section} workbookView={workbookView}
            guestSearch={guestSearch} refresh={() => refreshPlan(weddingID)} />
          : planError ? <p role="alert">{planError}</p> : <p role="status">Opening wedding…</p>}
      </> : !setup ? <>
        <p><a className="focus-secondary" href="#workspace/setup">Start or join a wedding</a></p>
        <section className="focus-card">
          <h2>Your weddings</h2>
          {weddings.length === 0 && <p>No weddings yet.</p>}
          {weddings.map(wedding => <a className="focus-item" key={wedding.id} href={weddingPage(wedding.id)}><span><strong>{wedding.name}</strong><small>{wedding.role} · {wedding.date}</small></span>
            <span aria-hidden="true">→</span></a>)}
        </section>
      </> : <div className="focus-record-grid">
        <WorkspaceForm title="Create a wedding" label="Create wedding" onSave={async data => {
          const result = await workspaceRequest<{ id: string }>('/weddings', {
            name: field(data, 'name'), date: field(data, 'date'), timeZone: field(data, 'zone'),
          })
          await refreshList(result.id)
        }}>
          <TextField name="name" label="Wedding name" />
          <TextField name="date" label="Wedding date" type="date" />
          <TextField name="zone" label="Time zone" value={Intl.DateTimeFormat().resolvedOptions().timeZone} />
        </WorkspaceForm>
        <WorkspaceForm title="Join a wedding" label="Join wedding" onSave={async data => {
          const result = await workspaceRequest<{ id: string }>('/join', { token: field(data, 'code') })
          await refreshList(result.id)
        }}>
          <TextField name="code" label="Invite code" maxLength={43} />
        </WorkspaceForm>
        <WorkspaceImport onCreated={refreshList} />
      </div>}
    </>}
  </main>
}

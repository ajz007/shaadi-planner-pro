import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { ImportedPlanningRecords, WorkspaceImport } from './WorkspaceImport'
import { WorkspaceGuests } from './WorkspaceGuests'

type Session = { configured: boolean; name?: string; workspaceURL?: string; localTest?: boolean }
type Wedding = { id: string; name: string; date: string; timeZone: string; role: string; personId: string }
type Person = { id: string; name: string }
type WeddingFunction = { id: string; name: string; venue: string; startsAt: string }
type Task = { id: string; title: string; assignee: string | null; function: string | null; due: string | null; claimable: boolean; done: boolean; revision: number }
type Plan = { wedding: Wedding; people: Person[]; functions: WeddingFunction[]; tasks: Task[] }
const root = '/api/workspace'

export const weddingPage = (id: string, guests = false) => '#workspace/' + id + (guests ? '/guests' : '')

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

function WeddingWorkspace({ plan, refresh, guestView }: { plan: Plan; refresh: () => Promise<void>; guestView: boolean }) {
  const { wedding, people, functions, tasks } = plan
  const [invite, setInvite] = useState('')
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const path = '/weddings/' + wedding.id
  const organizer = wedding.role !== 'family'
  const personName = (id: string | null) => people.find(person => person.id === id)?.name ?? 'Unassigned'
  const functionName = (id: string | null) => functions.find(event => event.id === id)?.name
  const eventTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: wedding.timeZone })
  const myTasks = tasks.filter(task => task.assignee === wedding.personId)
  const help = tasks.filter(task => task.claimable && !task.assignee && !task.done)
  const otherTasks = organizer ? tasks.filter(task => task.assignee !== wedding.personId && !help.includes(task)) : []

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
    return <section className="focus-card">
      <div className="focus-heading"><h2>{title}</h2><span className="focus-chip">{items.filter(task => !task.done).length} open</span></div>
      {items.length === 0 && <p>No tasks here yet.</p>}
      {items.map(task => <div className="focus-item" key={task.id}>
        <span><strong>{task.title}</strong><small>{[task.done ? 'Done' : '', task.due ? 'Due ' + task.due : '', functionName(task.function), organizer && !claim ? personName(task.assignee) : ''].filter(Boolean).join(' · ')}</small></span>
        <button disabled={busy} className="focus-secondary" onClick={() => void update(claim ? 'claim' : 'complete', {
          task: task.id, ...(claim ? {} : { revision: task.revision, done: !task.done }),
        })}>{claim ? 'I’ll do it' : task.done ? 'Reopen' : 'Mark done'}</button>
      </div>)}
    </section>
  }

  return <>
    <div className="focus-heading"><h2>{wedding.name}</h2><button className="focus-secondary" disabled={busy} onClick={() => void refresh().catch(error => setFeedback(errorText(error)))}>Refresh plan</button></div>
    <p>{wedding.date} · {wedding.timeZone} · {wedding.role}</p>
    {organizer && <nav className="focus-actions wedding-pages" aria-label="Wedding pages">
      <a className="focus-secondary" aria-current={!guestView ? 'page' : undefined} href={weddingPage(wedding.id)}>Overview</a>
      <a className="focus-secondary" aria-current={guestView ? 'page' : undefined} href={weddingPage(wedding.id, true)}>Guest List</a>
      {wedding.role === 'owner' && <a className="focus-secondary" href={root + path + '/snapshot.xlsx'} download>Download current Excel snapshot</a>}
    </nav>}
    {feedback && <p role="alert">{feedback}</p>}
    {guestView ? (organizer ? <WorkspaceGuests wedding={wedding} /> :
      <p role="status">The guest list is available to wedding organizers. <a href={weddingPage(wedding.id)}>Return to your tasks</a>.</p>) : <>
    {organizer && <section className="focus-card wedding-guest-shortcut">
      <div><h2>Manage your guests</h2><p>Edit guest details, filter arrivals, and print pickup lists.</p></div>
      <a className="focus-secondary" href={weddingPage(wedding.id, true)}>Open live Guest List →</a>
    </section>}
    <div className="focus-record-grid">
      {taskList('My tasks', myTasks)}
      {taskList('Help needed', help, true)}
      {organizer && taskList('Other tasks', otherTasks)}
      <section className="focus-card">
        <h2>Wedding schedule</h2>
        {functions.length === 0 && <p>No functions added yet.</p>}
        {functions.map(event => <div className="focus-item" key={event.id}><span><strong>{event.name}</strong>
          <small>{eventTime.format(new Date(event.startsAt))}{event.venue && ' · ' + event.venue}</small></span></div>)}
      </section>
      {organizer && <>
        <WorkspaceForm title="Add a planning person" label="Add person" onSave={data => mutate('people', { name: field(data, 'name') })}>
          <p>Add a name now and invite the person when you’re ready.</p>
          <TextField name="name" label="Planning name" />
        </WorkspaceForm>
        <WorkspaceForm title="Add a function" label="Add function" onSave={data => mutate('functions', {
          name: field(data, 'name'), venue: field(data, 'venue'), startsAt: field(data, 'start'),
        })}>
          <TextField name="name" label="Function name" />
          <TextField name="start" label={'Starts in ' + wedding.timeZone} type="datetime-local" />
          <TextField name="venue" label="Venue" required={false} maxLength={200} />
        </WorkspaceForm>
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
        </WorkspaceForm>
      </>}
      {wedding.role === 'owner' && <>
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
    </div>
    {wedding.role === 'owner' && <ImportedPlanningRecords wedding={wedding.id} guestListURL={weddingPage(wedding.id, true)} />}
    </>}
  </>
}

export function Workspace({ loginFailed, weddingID, guestView }: { loginFailed: boolean; weddingID?: string; guestView: boolean }) {
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
    <header className="focus-hero">
      <div><p className="focus-kicker">SHAADI PLANNER PRO</p><h1>Private workspace</h1></div>
      <a className="focus-secondary" href="#dashboard">Open sample planner</a>
    </header>
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
      <p className="focus-item"><span>Signed in as {session.name}</span><button className="focus-secondary" disabled={busy}
        onClick={() => void workspaceRequest('/logout', {}).then(() => window.location.assign('/')).catch(error => setError(errorText(error)))}>Sign out</button></p>
      {weddingID ? <>
        <a className="focus-secondary" href="#workspace">← My weddings</a>
        {plan?.wedding.id === weddingID
          ? <WeddingWorkspace key={weddingID} plan={plan} guestView={guestView} refresh={() => refreshPlan(weddingID)} />
          : planError ? <p role="alert">{planError}</p> : <p role="status">Opening wedding…</p>}
      </> : <div className="focus-record-grid">
        <section className="focus-card">
          <h2>My weddings</h2>
          {weddings.length === 0 && <p>Create a wedding or join with an invite code.</p>}
          {weddings.map(wedding => <div className="focus-item" key={wedding.id}><span><strong>{wedding.name}</strong><small>{wedding.role} · {wedding.date}</small></span>
            <div className="focus-actions"><a className="focus-secondary" href={weddingPage(wedding.id)}>Open wedding</a>
              {wedding.role !== 'family' && <a className="focus-secondary" href={weddingPage(wedding.id, true)}>Guest List</a>}</div></div>)}
        </section>
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

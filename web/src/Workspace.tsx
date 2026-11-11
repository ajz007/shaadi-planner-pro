import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { ImportedPlanningRecords, useImportedPlanningRecords, WorkspaceImport } from './WorkspaceImport'
import { needsReply, shownDate, WorkspaceGuests } from './WorkspaceGuests'
import type { Guest } from './WorkspaceGuests'
import { focusLink, PlanningSection } from './FocusPages'
import { ScheduleChart, scheduleEntries } from './ScheduleBoard'
import { WorkspaceTransport } from './WorkspaceTransport'
import { WorkspaceLogistics } from './WorkspaceLogistics'
import { WorkspaceFinance } from './WorkspaceFinance'
import { VoiceField, VoiceNotice } from './VoiceField'
import { functionLocalTime, WorkspaceFunctionReadiness, WorkspacePlaces } from './WorkspacePlanning'
import type { Planning } from './WorkspacePlanning'
import { useWorkspaceData, workspaceRequest } from './WorkspaceData'
import { WeddingNavigation } from './WeddingNavigation'

type Session = { configured: boolean; name?: string; workspaceURL?: string; localTest?: boolean }
type Wedding = { id: string; name: string; date: string; timeZone: string; role: string; personId: string }
type Person = { id: string; name: string }
type WeddingFunction = { id: string; name: string; venue: string; startsAt: string }
type Task = { id: string; title: string; assignee: string | null; function: string | null; due: string | null; claimable: boolean; done: boolean; revision: number }
export type Plan = { wedding: Wedding; people: Person[]; functions: WeddingFunction[]; tasks: Task[] }
const root = '/api/workspace'
const pendingInviteKey = 'shaadi-pending-invite'

const weddingPage = (id: string, section?: string, workbook = false, preview = false) => (preview ? '#demo' : '#workspace/' + id) +
  (section ? '/' + (section === 'Import history' ? 'import-history' : focusLink(section).slice(7)) : '') + (workbook ? '?layout=workbook' : '')

const field = (data: FormData, name: string) => String(data.get(name) ?? '').trim()
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong.'

function WorkspaceForm({ title, label, onSave, children, voice }: {
  title: string; label: string; onSave: (data: FormData) => Promise<void>; children: ReactNode; voice?: boolean
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
    <fieldset className="workspace-fields" disabled={busy}>{children}{voice && <VoiceNotice />}<button>{busy ? 'Saving…' : label}</button></fieldset>
    {error && <p role="alert">{error}</p>}
  </form>
}

function TextField({ name, label, type = 'text', required = true, value, maxLength = 120 }: {
  name: string; label: string; type?: string; required?: boolean; value?: string; maxLength?: number
}) {
  if (type === 'text' && name !== 'code' && name !== 'zone') {
    return <VoiceField name={name} label={label} required={required} defaultValue={value} maxLength={maxLength} />
  }
  return <label className="focus-field">{label}<input name={name} type={type} required={required} defaultValue={value} maxLength={maxLength} /></label>
}

export type WeddingLayout = 'cards' | 'workbook'

function storeWeddingLayout(key: string, layout: WeddingLayout) {
  try { localStorage.setItem(key, layout) } catch { /* The current view still works. */ }
}

export function WeddingWorkspace({ plan, refresh, section, layout, guestSearch, awaitingReply, accountBar }: {
  plan: Plan; refresh: () => Promise<void>; section?: string; layout?: WeddingLayout
  guestSearch: string; awaitingReply: boolean; accountBar?: ReactNode
}) {
  const { preview, request } = useWorkspaceData()
  const { wedding, people, functions, tasks } = plan
  const [invite, setInvite] = useState('')
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const path = '/weddings/' + wedding.id
  const organizer = wedding.role !== 'family'
  const preferenceKey = 'shaadi-wedding-layout:' + wedding.id + ':' + wedding.personId
  const [preferredLayout, setPreferredLayout] = useState<WeddingLayout>(() => {
    try { return localStorage.getItem(preferenceKey) === 'workbook' ? 'workbook' : 'cards' }
    catch { return 'cards' }
  })
  useEffect(() => {
    if (!organizer || !layout) return
    setPreferredLayout(layout)
    storeWeddingLayout(preferenceKey, layout)
  }, [layout, organizer, preferenceKey])
  const workbookView = organizer && (layout ?? preferredLayout) === 'workbook'
  const [route, query] = window.location.hash.split('?')
  const layoutQuery = new URLSearchParams(query)
  const nextLayout = workbookView ? 'cards' : 'workbook'
  layoutQuery.set('layout', nextLayout)
  const layoutTarget = route + '?' + layoutQuery.toString()
  const owner = wedding.role === 'owner'
  const inviteURL = invite ? window.location.origin + '/#workspace/setup?invite=' + encodeURIComponent(invite) : ''
  const imported = useImportedPlanningRecords(wedding.id, owner)
  const [guests, setGuests] = useState<Guest[]>()
  const [planning, setPlanning] = useState<Planning>()
  const [planningError, setPlanningError] = useState('')
  const showPlanning = organizer && (section === 'Functions & Events' || section === 'Places' || section === 'Schedule Board'
    || section === 'Accommodation' || section === 'Transportation')
  useEffect(() => {
    if (!showPlanning) return
    const controller = new AbortController()
    setPlanningError('')
    request<Planning>(path + '/planning', undefined, controller.signal)
      .then(data => { if (!controller.signal.aborted) setPlanning(data) })
      .catch(error => { if (!controller.signal.aborted) setPlanningError(errorText(error)) })
    return () => controller.abort()
  }, [path, request, showPlanning])
  useEffect(() => {
    if (!organizer || section !== undefined) return
    const controller = new AbortController()
    request<Guest[]>(path + '/guests', undefined, controller.signal)
      .then(items => { if (!controller.signal.aborted) setGuests(items) })
      .catch(() => { if (!controller.signal.aborted) setGuests(undefined) })
    return () => controller.abort()
  }, [organizer, path, request, section])
  const href = (page?: string) => weddingPage(wedding.id, page, workbookView, preview)
  const awaitingCount = guests?.filter(needsReply).length ?? 0
  const canSee = (page: string) => owner || page === 'Functions & Events' || page === 'Family Responsibilities' ||
    (organizer && ['Guest List', 'Schedule Board', 'Settings', 'Transportation', 'Accommodation', 'RSVP Follow-up', 'Places'].includes(page))
  const personName = (id: string | null) => people.find(person => person.id === id)?.name ?? 'Unassigned'
  const functionName = (id: string | null) => functions.find(event => event.id === id)?.name
  const eventTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: wedding.timeZone })
  const myTasks = tasks.filter(task => task.assignee === wedding.personId)
  const help = tasks.filter(task => task.claimable && !task.assignee && !task.done)
  const otherTasks = organizer ? tasks.filter(task => task.assignee !== wedding.personId && !help.includes(task)) : []
  const functionRows = (planning?.functions ?? functions).map(event => {
    const [date, time] = functionLocalTime(event.startsAt, wedding.timeZone).split('T')
    const details = planning?.functions.find(record => record.id === event.id)
    const place = planning?.places.find(place => place.id === details?.placeId)
    return [event.id, event.name, date, time, [place?.name, event.venue].filter(Boolean).join(' · '), '', '', '', '', '',
      String(details?.duration ?? ''), details?.people ? JSON.stringify(details.people.map(person => person.personId)) : '']
  })
  async function savePlanning(kind: string, id: string, data: object) {
    await request(path + '/planning/' + kind + '/' + id, data)
    try {
      setPlanning(await request<Planning>(path + '/planning'))
      await refresh()
    } catch { setFeedback('Saved. Reload the page to see the latest records.') }
  }
  const timeline = imported.data?.sections.find(item => item.name === 'Wedding Timeline')?.rows.map(row => row.values) ?? []
  const overview = section === undefined
  const showTasks = section === 'Family Responsibilities' || (overview && !organizer)
  const showFunctions = section === 'Functions & Events' || (overview && !organizer)
  const activeSection = imported.data?.sections.find(item => item.name === section)
  const displayMoney = (amount: number) => new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(amount / 100)
  const sectionRows = (item: NonNullable<typeof activeSection>) => item.rows.map(row => {
    const values = [...row.values]
    if (item.name === 'Budget vs Actual') values[3] = String(Number(values[1]) - Number(values[2]))
    if (item.name === 'Vendor Payments') values[5] = String(Number(values[3]) - Number(values[4]))
    return values
  })

  async function mutate(action: string, body: object) {
    await request(path + '/' + action, body)
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
    const action = (task: Task) => <button disabled={busy || preview} className="focus-secondary" onClick={() => void update(claim ? 'claim' : 'complete', {
      task: task.id, ...(claim ? {} : { revision: task.revision, done: !task.done }),
    })}>{claim ? 'I’ll do it' : task.done ? 'Reopen' : 'Mark done'}</button>
    const reassign = (task: Task) => organizer && !preview && <details className="focus-completed">
      <summary>Reassign<span className="focus-sr-only"> {task.title}</span></summary>
      <form key={task.revision} onSubmit={event => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        void update('reassign', { task: task.id, revision: task.revision, assignee: field(data, 'assignee') || null })
      }}>
        <label className="focus-field">Assign to<select name="assignee" defaultValue={task.assignee ?? ''} disabled={busy}>
          <option value="">Unassigned</option>{people.map(person => <option key={person.id} value={person.id}>
            {person.name}{person.id === wedding.personId ? ' (me)' : ''}
          </option>)}
        </select></label>
        <button disabled={busy} className="focus-secondary">Save assignee</button>
      </form>
    </details>
    return <section className="focus-card">
      <div className="focus-heading"><h2>{title}</h2><span className="focus-chip">{items.filter(task => !task.done).length} open</span></div>
      {items.length === 0 && <p>No tasks here yet.</p>}
      {workbookView && items.length > 0 ? <div className="table-scroll" tabIndex={0} role="region" aria-label={title + ' table'}>
        <table className="imported-records"><thead><tr><th>Task</th><th>Due</th><th>Assignee</th><th>Action</th></tr></thead>
          <tbody>{items.map(task => <tr key={task.id}><td>{task.title}</td><td>{task.due}</td><td>{personName(task.assignee)}</td><td>{action(task)}{reassign(task)}</td></tr>)}</tbody>
        </table>
      </div> : items.map(task => <div className="focus-item" key={task.id}>
        <span><strong>{task.title}</strong><small>{[task.done ? 'Done' : '', task.due ? 'Due ' + task.due : '', functionName(task.function), organizer && !claim ? personName(task.assignee) : ''].filter(Boolean).join(' · ')}</small></span>
        <div>{action(task)}{reassign(task)}</div>
      </div>)}
    </section>
  }

  const overviewLabel = organizer ? 'Overview' : 'My wedding tasks'
  return <div className="wedding-workspace">
    <WeddingNavigation section={section} href={href} canSee={canSee} overviewLabel={overviewLabel} />
    <main className="focus wedding-content">
    {accountBar}
    <header className="planner-hero wedding-hero">
      <div>
        <h1>{section ?? overviewLabel}</h1>
        <p>{wedding.name} · {shownDate(wedding.date)}</p>
      </div>
      <div className="focus-actions">
        {organizer && <a className="focus-secondary" href={layoutTarget} onClick={event => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
          event.preventDefault()
          setPreferredLayout(nextLayout)
          storeWeddingLayout(preferenceKey, nextLayout)
          window.location.hash = layoutTarget
        }}>{workbookView ? 'Card view' : 'Workbook view'}</a>}
        {owner && !preview && <details className="wedding-tools" key={section}>
          <summary className="focus-secondary">Wedding tools</summary>
          <div>
            <a href={href('Invitations')}>Invite family</a>
            <a href={root + path + '/snapshot.xlsx'} download>Download Excel snapshot</a>
          </div>
        </details>}
        {preview && <a className="package-button" href="#workspace">Start planning</a>}
      </div>
    </header>
    {preview && <p className="wedding-preview-note"><strong>Sample wedding.</strong> Explore with fictional data.
      Open your own wedding to save changes, invite family or export your plan. <a href="#dashboard">Explore the Excel workbook example</a>.</p>}
    {feedback && <p role="alert">{feedback}</p>}
    {section && !canSee(section) ? <p role="status">This page is unavailable for your role. <a href={href()}>Return to overview</a>.</p>
      : section === 'Guest List' ? <WorkspaceGuests key={JSON.stringify([guestSearch, awaitingReply])} wedding={wedding}
        initialSearch={guestSearch} awaitingReply={awaitingReply} workbookView={workbookView} />
      : section === 'Transportation' ? <WorkspaceTransport wedding={wedding} people={people} workbookView={workbookView}
        places={planning?.places ?? []} placesHref={href('Places')} />
      : section === 'Accommodation' || section === 'RSVP Follow-up' ? <WorkspaceLogistics key={section} section={section}
        wedding={wedding} people={people} workbookView={workbookView} request={request} guestHref={href('Guest List')}
        places={planning?.places ?? []} placesHref={href('Places')} />
      : section === 'Vendor Comparison' || section === 'Vendor Payments' ? <WorkspaceFinance key={section} section={section}
        wedding={wedding} workbookView={workbookView} request={request} vendorsHref={href('Vendor Comparison')} />
      : organizer && (section === 'Functions & Events' || section === 'Places') ? (
        planningError ? <p role="alert">{planningError}</p> : !planning ? <p role="status">Loading the wedding plan…</p>
          : section === 'Places' ? <WorkspacePlaces data={planning} save={savePlanning} />
            : <WorkspaceFunctionReadiness data={planning} people={people} wedding={wedding} save={savePlanning}
              workbookView={workbookView} placesHref={href('Places')} />
      )
      : section === 'Schedule Board' ? <>
        <p><a href={href('Functions & Events')}>{preview ? 'View functions and required people' : 'Edit functions and required people'}</a>
          {' · '}<a href={href('Places')}>{preview ? 'View places' : 'Manage places'}</a></p>
        {planningError ? <p role="alert">{planningError}</p> : !planning ? <p role="status">Loading the wedding plan…</p>
          : <ScheduleChart actual={scheduleEntries(functionRows, timeline)} weddingName={wedding.name}
            personLabel={id => people.find(person => person.id === id)?.name ?? id} />}
      </>
      : section === 'Import history' ? <><p><a href={href('Settings')}>← Wedding settings</a></p><ImportedPlanningRecords {...imported} /></>
      : section && !showTasks && !showFunctions && section !== 'Settings' && section !== 'Invitations' ? <>
        {imported.error ? <p role="alert">{imported.error}</p>
          : !imported.data ? <p role="status">Loading planning records…</p>
          : activeSection ? <>
            <p className="focus-note">{section === 'Budget vs Actual'
              ? 'These category totals came from your workbook. Live contract balances and recorded payments are in Vendor Payments.'
              : 'Read-only. These records came from your workbook.'}</p>
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
          ? displayMoney(imported.data.totals.paidPaise) + ' imported actuals' : 'Open budget'}</span></a>}
      </div>
      <div className="focus-record-grid">
        <section className="focus-card"><div className="focus-heading"><h2>Needs attention</h2><a href={href('Family Responsibilities')}>See tasks →</a></div>
          {awaitingCount > 0 &&
            <p><a href={href('Guest List') + (workbookView ? '&' : '?') + 'rsvp=awaiting'}>
              {awaitingCount} {awaitingCount === 1 ? 'guest' : 'guests'} awaiting a reply →</a></p>}
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
          weddingName={wedding.name} workbookView={workbookView} /> : <><h2>Wedding settings</h2><p>{wedding.name} · {wedding.date} · {wedding.timeZone}</p></>}
        {owner && <div className="focus-actions"><a href={href('Import history')}>Import history →</a><a href={href('Invitations')}>Invite family →</a></div>}
      </section>}
      {organizer && !preview && (section === 'Settings' || section === 'Invitations') &&
        <WorkspaceForm title="Add a planning person" label="Add person" voice onSave={data => mutate('people', { name: field(data, 'name') })}>
          <p>Add a name now and invite the person when you’re ready.</p>
          <TextField name="name" label="Planning name" />
        </WorkspaceForm>}
      {organizer && !preview && section === 'Family Responsibilities' &&
        <WorkspaceForm title="Add a task" label="Add task" voice onSave={data => mutate('tasks', {
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
      {preview && section === 'Invitations' && <section className="focus-card">
        <h2>Invite your planning team</h2><p>Wedding owners can invite family members and co-organizers to plan together.</p>
        <a href="#workspace">Open your wedding to invite family</a>
      </section>}
      {owner && !preview && section === 'Invitations' && <>
        <WorkspaceForm title="Invite someone" label="Create invite link" onSave={async data => {
          const result = await request<{ token: string }>(path + '/invite', { person: field(data, 'person'), role: field(data, 'role') })
          setInvite(result.token)
          setFeedback('')
        }}>
          <p>Choose an existing planning person to keep their assigned tasks. If they’re new, add them first.</p>
          <label className="focus-field">Link to planning person<select name="person" required>
            <option value="">Choose a person</option>{people.filter(person => person.id !== wedding.personId).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select></label>
          <label className="focus-field">Role<select name="role"><option value="family">Family member</option><option value="co-organizer">Co-organizer</option></select></label>
        </WorkspaceForm>
        {invite && <section className="focus-card">
          <h2>Share the invite link</h2><p>Send it privately to the intended person. The link can be used once and expires in 24 hours.</p>
          <label className="focus-field">Invite link<input readOnly value={inviteURL} onFocus={event => event.target.select()} /></label>
          <label className="focus-field">Invite code<input readOnly value={invite} onFocus={event => event.target.select()} /></label>
          <button className="focus-secondary" onClick={async () => {
            try {
              await navigator.clipboard.writeText(inviteURL)
              setFeedback('Invite link copied.')
            } catch {
              setFeedback('Select the invite link field to copy it manually.')
            }
          }}>Copy invite link</button>
          <button className="focus-secondary" disabled={busy} onClick={() => void request(path + '/revoke', { token: invite })
            .then(() => setInvite('')).catch(error => setFeedback(errorText(error)))}>Revoke invite</button>
        </section>}
      </>}
    </div>}
    </>}
    </main>
  </div>
}

export function Workspace({ loginFailed, weddingID, section, layout, guestSearch, awaitingReply, setup, inviteCode }: {
  loginFailed: boolean; weddingID?: string; section?: string; layout?: WeddingLayout; guestSearch: string; awaitingReply: boolean; setup: boolean; inviteCode: string
}) {
  const [session, setSession] = useState<Session>()
  const [weddings, setWeddings] = useState<Wedding[]>([])
  const [plan, setPlan] = useState<Plan>()
  const [error, setError] = useState('')
  const [planError, setPlanError] = useState('')
  const [busy, setBusy] = useState(false)
  const [savedInvite, setSavedInvite] = useState(() => {
    try { return sessionStorage.getItem(pendingInviteKey) ?? '' } catch { return '' }
  })
  const pendingInvite = inviteCode || savedInvite

  function clearInvite() {
    setSavedInvite('')
    try { sessionStorage.removeItem(pendingInviteKey) } catch { /* Storage may be disabled. */ }
  }

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

  const accountBar = session?.name && <div className="focus-heading workspace-topline">
    {(weddingID || setup) && <a href="#workspace">← My weddings</a>}
    <span><span className="wedding-account-name">Signed in as {session.name} · </span><button className="focus-secondary" disabled={busy}
      onClick={() => void workspaceRequest('/logout', {}).then(() => window.location.assign('/')).catch(error => setError(errorText(error)))}>Sign out</button></span>
  </div>
  if (session?.name && weddingID && plan?.wedding.id === weddingID) {
    return <WeddingWorkspace key={weddingID} plan={plan} section={section} layout={layout}
      guestSearch={guestSearch} awaitingReply={awaitingReply} refresh={() => refreshPlan(weddingID)}
      accountBar={<>{accountBar}{error && <p role="alert">{error}</p>}</>} />
  }

  const title = session?.name ? (setup ? 'Set up a wedding' : 'My weddings') : pendingInvite ? 'Join a wedding' : 'Your wedding planner'
  return <main className="focus">
    {(!weddingID || (session && !session.name)) && <header className="focus-hero">
      <div><p className="focus-kicker">SHAADI PLANNER PRO</p><h1>{title}</h1></div>
      <a className="focus-secondary" href="#demo">Explore a sample wedding</a>
    </header>}
    {error && <p role="alert">{error}</p>}
    {!session && !error && <p>Opening your wedding planner…</p>}
    {session && !session.configured && <section className="focus-card">
      <h2>Wedding sign-in is unavailable</h2><p>You can still explore the sample wedding.</p>
    </section>}
    {session?.workspaceURL && <p><a href={session.workspaceURL}>Open your wedding planner →</a></p>}
    {session?.configured && !session.workspaceURL && !session.name && <section className="focus-card">
      <h2>{pendingInvite ? 'Sign in to accept your invitation' : 'Sign in to get started'}</h2>
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
      </> : <><p>{pendingInvite ? 'Use your Google account to join the wedding and see your tasks.'
        : 'Use your Google account to create a wedding, open one you’re planning, or accept a family invitation.'}</p>
        <a className="package-button" href="/auth/google/start" onClick={() => {
          if (pendingInvite) try { sessionStorage.setItem(pendingInviteKey, pendingInvite) } catch { /* Reopen the link after sign-in. */ }
        }}>Continue with Google</a></>}
    </section>}
    {session?.name && <>
      {accountBar}
      {!weddingID && pendingInvite ? <WorkspaceForm title="Wedding invitation" label="Accept invitation" onSave={async () => {
        const result = await workspaceRequest<{ id: string }>('/join', { token: pendingInvite })
        clearInvite()
        await refreshList(result.id)
      }}>
        <p>Accept to join this wedding with the Google account shown above.</p>
        <a href="#workspace" onClick={clearInvite}>Back to My weddings</a>
      </WorkspaceForm> : weddingID ? (
        planError ? <p role="alert">{planError}</p> : <p role="status">Opening wedding…</p>
      ) : !setup ? <>
        <p><a className="focus-secondary" href="#workspace/setup">Start or join a wedding</a></p>
        <section className="focus-card">
          <h2>Your weddings</h2>
          {weddings.length === 0 && <p>No weddings yet.</p>}
          {weddings.map(wedding => <a className="focus-item" key={wedding.id} href={weddingPage(wedding.id)}><span><strong>{wedding.name}</strong><small>{wedding.role} · {wedding.date}</small></span>
            <span aria-hidden="true">→</span></a>)}
        </section>
      </> : <div className="focus-record-grid">
        <WorkspaceForm title="Create a wedding" label="Create wedding" voice onSave={async data => {
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

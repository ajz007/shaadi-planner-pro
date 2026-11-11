import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { Planner } from './Planner'
import { PublicFooter, PublicHome, PublicInfoPage, publicPages } from './PublicPages'

type Status = 'pending' | 'accepted' | 'declined'
type Invitation = {
  guestId: string
  name: string
  function: string
  status: Status
  revision: number
}
type Group = { name: string; token?: string; invitations: Invitation[] }
type Count = { function: string; accepted: number; declined: number; pending: number }
type Wedding = { groups: Group[]; counts: Count[] }
type ImportPreview = {
  guests: { id: string; name: string; household: string; functions: string[] }[]
  newGuests: number
  unchanged: number
}

const labels: Record<Status, string> = {
  pending: 'Awaiting reply',
  accepted: 'Attending',
  declined: 'Can’t attend',
}

async function api<T>(path: string, method = 'GET', payload?: unknown): Promise<T> {
  const result = await fetch(path, {
    method,
    headers: payload === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })
  const data = await result.json()
  if (!result.ok) throw new Error(data.error || 'The request could not be completed.')
  return data
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function ResponseRow({ invite, endpoint, onSaved }: {
  invite: Invitation
  endpoint: string
  onSaved: (saved: Invitation) => void
}) {
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')

  async function save(status: Status) {
    setBusy(true)
    setFeedback('')
    try {
      const saved = await api<Invitation>(endpoint, 'PUT', {
        guestId: invite.guestId,
        function: invite.function,
        revision: invite.revision,
        status,
      })
      onSaved(saved)
      setFeedback('Saved')
    } catch (error) {
      setFeedback(message(error))
    } finally {
      setBusy(false)
    }
  }

  return <div className="response">
    <label>
      <strong>{invite.name}</strong>
      <span>{invite.function}</span>
      <select value={invite.status} disabled={busy} onChange={event => void save(event.target.value as Status)}>
        {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    <small role="status">{busy ? 'Saving…' : feedback}</small>
  </div>
}

function updateGroup(group: Group, saved: Invitation): Group {
  return {
    ...group,
    invitations: group.invitations.map(invite =>
      invite.guestId === saved.guestId && invite.function === saved.function ? saved : invite),
  }
}

function GuestPage({ token }: { token: string }) {
  const [group, setGroup] = useState<Group>()
  const [error, setError] = useState('')
  const endpoint = '/api/rsvp/' + encodeURIComponent(token)

  useEffect(() => {
    api<Group>(endpoint).then(setGroup).catch(error => setError(message(error)))
  }, [endpoint])

  return <main className="guest-page">
    <p className="eyebrow">Shaadi Planner Pro · Sample wedding</p>
    <h1>Wedding RSVP</h1>
    {error && <p role="alert">{error}</p>}
    {!group && !error && <p>Opening invitation…</p>}
    {group && <section className="card">
      <h2>{group.name}</h2>
      <p>Choose a response for each invitation. Your choices save as you go.</p>
      {group.invitations.map(invite => <ResponseRow
        key={invite.guestId + ':' + invite.function}
        invite={invite}
        endpoint={endpoint}
        onSaved={saved => setGroup(current => current && updateGroup(current, saved))}
      />)}
    </section>}
  </main>
}

function Organizer() {
  const [wedding, setWedding] = useState<Wedding>()
  const [csv, setCSV] = useState('')
  const [preview, setPreview] = useState<ImportPreview>()
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  const refreshId = useRef(0)
  const refresh = useCallback(async () => {
    const id = ++refreshId.current
    try {
      const latest = await api<Wedding>('/api/wedding')
      if (id === refreshId.current) setWedding(latest)
    } catch (error) {
      if (id === refreshId.current) setError(message(error))
    }
  }, [])

  useEffect(() => {
    void refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [refresh])

  async function previewCSV(load: () => Promise<string>) {
    setBusy(true)
    setError('')
    setFeedback('')
    setPreview(undefined)
    setCSV('')
    try {
      const content = await load()
      const result = await api<ImportPreview>('/api/import', 'POST', { csv: content, confirm: false })
      setCSV(content)
      setPreview(result)
    } catch (error) {
      setError(message(error))
    } finally {
      setBusy(false)
    }
  }

  async function confirmImport() {
    setBusy(true)
    setError('')
    try {
      const result = await api<ImportPreview>('/api/import', 'POST', { csv, confirm: true })
      setFeedback(`Added ${result.newGuests} guests. ${result.unchanged} already in the wedding.`)
      setCSV('')
      setPreview(undefined)
      await refresh()
    } catch (error) {
      setError(message(error))
    } finally {
      setBusy(false)
    }
  }

  return <main>
    <header>
      <p className="eyebrow">Shaadi Planner Pro · Local RSVP prototype</p>
      <h1>Wedding guest coordination</h1>
      <p>Import a guest list, collect RSVPs, and see the headcount for each function.</p>
    </header>
    <section className="card">
      <h2>1. Import guests</h2>
      <p>Use fictional data in this local demo. Guest lists reset when the server restarts.</p>
      <div className="actions">
        <button disabled={busy} onClick={() => void previewCSV(async () => {
          const result = await fetch('/api/sample.csv')
          if (!result.ok) throw new Error('Could not load the sample guest list.')
          return result.text()
        })}>Preview sample guests</button>
        <a href="/api/sample.csv" download>Download sample CSV</a>
        <label className="file-label">Choose a guest CSV
          <input type="file" accept=".csv,text/csv" disabled={busy} onChange={event => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) void previewCSV(async () => {
              if (file.size > 200_000) throw new Error('Choose a CSV smaller than 200 KB.')
              return new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
            })
          }} />
        </label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {feedback && <p role="status">{feedback}</p>}
      {preview && <div className="preview">
        <p>{preview.newGuests} new · {preview.unchanged} already imported</p>
        <ul>{preview.guests.slice(0, 8).map(guest => <li key={guest.id}>
          <strong>{guest.name}</strong>{guest.household && ` · ${guest.household}`} · {guest.functions.join(', ')}
        </li>)}</ul>
        {preview.guests.length > 8 && <p>Showing 8 of {preview.guests.length} guests.</p>}
        <button disabled={busy || preview.newGuests === 0} onClick={() => void confirmImport()}>Confirm import</button>
      </div>}
    </section>
    <section className="card">
      <h2>2. Share and track replies</h2>
      <p>Open a household’s RSVP link in a new tab, or record their reply here.</p>
      <p className="subtle">Demo links work in this browser on this computer.</p>
      {wedding?.groups.length === 0 && <p>Import guests to see their invitations here.</p>}
      {wedding?.groups.map(group => <article className="household" key={group.token}>
        <div className="actions">
          <h3>{group.name}</h3>
          <a href={'/r/' + group.token} target="_blank" rel="noopener noreferrer">Open RSVP link</a>
        </div>
        {group.invitations.map(invite => <ResponseRow
          key={invite.guestId + ':' + invite.function}
          invite={invite}
          endpoint="/api/responses"
          onSaved={() => { void refresh() }}
        />)}
      </article>)}
    </section>
    <section className="card">
      <div className="actions">
        <h2>3. Function headcounts</h2>
        <button className="secondary" onClick={() => void refresh()}>Refresh replies</button>
        <a href="/api/headcounts.csv" download>Export headcounts for Excel</a>
      </div>
      {wedding && <div className="counts">{wedding.counts.map(count => <div key={count.function}>
        <h3>{count.function}</h3>
        <p><strong>{count.accepted}</strong> attending · {count.pending} pending · {count.declined} declined</p>
      </div>)}</div>}
    </section>
  </main>
}

function App() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const navigate = () => {
      setHash(window.location.hash)
      if (!window.location.hash) window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [])
  const path = window.location.pathname
  let page
  if (Object.hasOwn(publicPages, path)) {
    page = <PublicInfoPage path={path as keyof typeof publicPages} />
  } else if (path.startsWith('/r/')) {
    const token = /^\/r\/([a-f0-9]{48})$/.exec(path)?.[1]
    page = token ? <GuestPage token={token} /> : <main><h1>RSVP link unavailable</h1></main>
  } else {
    page = hash ? <Planner rsvpDemo={<Organizer />} /> : <PublicHome />
  }
  return <>{page}<PublicFooter /></>
}

createRoot(document.getElementById('root')!).render(<App />)

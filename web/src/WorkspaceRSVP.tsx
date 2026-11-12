import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Plan } from './Workspace'
import type { Guest } from './WorkspaceGuests'
import { useWorkspaceData } from './WorkspaceData'

type Status = 'pending' | 'attending' | 'declined'
type Invitation = {
  id: string; guest: string; function: string; startsAt: string; status: Status; revision: number
}
type OrganizerInvitation = Invitation & { linkId: string; functionId: string; replySource?: string; repliedAt?: string }
type RSVPLink = { id: string; label: string; expiresAt: string; revokedAt: string | null; revision: number }
type OrganizerData = { links: RSVPLink[]; invitations: OrganizerInvitation[] }
type GuestData = { name: string; timeZone: string; invitations: Invitation[] }
const statusLabels: Record<Status, string> = { pending: 'Awaiting reply', attending: 'Attending', declined: 'Declined' }
const message = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Try again.'
const dateTime = (zone: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: zone })

async function guestRequest<T>(token: string, update?: { id: string; reply: Pick<Invitation, 'status' | 'revision'> }, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/guest-rsvp', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
    body: JSON.stringify({ token, ...update }), signal,
  })
  if (response.status === 404) throw new Error('This RSVP link has expired or is unavailable. Ask the organizer for a new link.')
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Could not open the RSVP.')
  return result
}

export function LiveGuestRSVP({ token }: { token: string }) {
  const [data, setData] = useState<GuestData>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [feedback, setFeedback] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    guestRequest<GuestData>(token, undefined, controller.signal)
      .then(setData).catch(error => { if (!controller.signal.aborted) setError(message(error)) })
    return () => controller.abort()
  }, [token, reload])
  async function save(invitation: Invitation, status: Status) {
    setBusy(invitation.id)
    setError('')
    setFeedback('')
    try {
      const reply = await guestRequest<Pick<Invitation, 'status' | 'revision'>>(token, {
        id: invitation.id, reply: { status, revision: invitation.revision },
      })
      setData(current => current && { ...current, invitations: current.invitations.map(row => row.id === invitation.id ? { ...row, ...reply } : row) })
      setFeedback(invitation.guest + ' · ' + invitation.function + ' · ' + statusLabels[status] + '.')
    } catch (error) { setError(message(error)) }
    finally { setBusy('') }
  }
  return <main className="focus-main live-guest-rsvp">
    <h1>{data ? data.name + ' RSVP' : 'Wedding RSVP'}</h1>
    {!data && !error && <p role="status">Opening your invitations…</p>}
    {data && <p>Reply for each guest and function. You can change your answer while the link is active.</p>}
    {error && <p role="alert">{error} <button className="focus-secondary" type="button" onClick={() => {
      setError(''); setData(undefined); setReload(value => value + 1)
    }}>Reload replies</button></p>}
    {feedback && <p role="status">{feedback}</p>}
    {data && <div className="focus-record-grid">{data.invitations.map(row => <section key={row.id} className="focus-card">
      <h2>{row.guest}</h2><p><strong>{row.function}</strong><br />{dateTime(data.timeZone).format(new Date(row.startsAt))}</p>
      <p>{statusLabels[row.status]}</p>
      <div className="focus-actions">{(['attending', 'declined'] as const).map(status =>
        <button className="focus-secondary" key={status} type="button" disabled={!!busy || row.status === status}
          onClick={() => void save(row, status)}>{status === 'attending' ? 'I’ll attend' : 'I can’t attend'}</button>)}</div>
    </section>)}</div>}
  </main>
}

function exportCounts(rows: (string | number)[][]) {
  const csv = rows.map(row => row.map(value => {
    if (typeof value === 'number') return String(value)
    const safe = /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(value) ? "'" + value : value
    return '"' + safe.replaceAll('"', '""') + '"'
  }).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'wedding-function-headcounts.csv'
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function WorkspaceRSVP({ wedding, functions, guestsHref, functionsHref }: {
  wedding: Plan['wedding']; functions: Plan['functions']; guestsHref: string; functionsHref: string
}) {
  const { request } = useWorkspaceData()
  const weddingPath = '/weddings/' + wedding.id
  const path = weddingPath + '/guest-rsvp'
  const [data, setData] = useState<OrganizerData>()
  const [guests, setGuests] = useState<Guest[]>([])
  const [group, setGroup] = useState('')
  const [links, setLinks] = useState<Record<string, string>>({})
  const [functionFilter, setFunctionFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const groups = new Map<string, { label: string; guests: Guest[] }>()
  for (const guest of guests) {
    const key = guest.household.trim() ? 'household:' + guest.household.trim().toLowerCase() : 'guest:' + guest.id
    const entry = groups.get(key) ?? { label: guest.household.trim() || guest.name, guests: [] }
    entry.guests.push(guest)
    groups.set(key, entry)
  }
  const currentGroup = groups.get(group)
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([request<OrganizerData>(path, undefined, controller.signal), request<Guest[]>(weddingPath + '/guests', undefined, controller.signal)])
      .then(([data, guests]) => { setData(data); setGuests(guests) })
      .catch(error => { if (!controller.signal.aborted) setError(message(error)) })
    return () => controller.abort()
  }, [path, request, weddingPath])
  async function perform(operation?: () => Promise<void>) {
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      if (operation) await operation()
      setData(await request<OrganizerData>(path))
    } catch (error) { setError(message(error)) }
    finally { setBusy(false) }
  }
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    const invitations = fields.getAll('invitations').map(value => {
      const [guestId, functionId] = String(value).split(':')
      return { guestId, functionId }
    })
    void perform(async () => {
      const result = await request<{ id: string; url: string }>(path, { invitations })
      setLinks(current => ({ ...current, [result.id]: result.url }))
      form.reset()
      setGroup('')
      setFeedback('RSVP link created. Copy it from Household links.')
    })
  }
  async function change(link: RSVPLink, action: 'revoke' | 'replace') {
    if (!window.confirm(action === 'revoke' ? 'Revoke this RSVP link? Guests will lose access.' : 'Replace this RSVP link? The previous address will stop working.')) return
    await perform(async () => {
      const result = await request<{ id: string; url: string } | undefined>(path + '/links/' + link.id, { action, revision: link.revision })
      setLinks(current => ({ ...current, [link.id]: result?.url ?? '' }))
      setFeedback(action === 'revoke' ? 'RSVP link revoked.' : 'New RSVP link ready to copy.')
    })
  }
  const replies = data?.invitations ?? []
  const totals = functions.map(fn => {
    const invited = replies.filter(row => row.functionId === fn.id)
    return [fn.name, dateTime(wedding.timeZone).format(new Date(fn.startsAt)), invited.length,
      ...(['attending', 'pending', 'declined'] as const).map(status => invited.filter(row => row.status === status).length)]
  })
  const headings = ['Function', 'Starts', 'Invited', 'Attending', 'Awaiting reply', 'Declined']
  const visible = replies.filter(row => (!functionFilter || row.functionId === functionFilter) && (!statusFilter || row.status === statusFilter))
  return <div className="workspace-rsvp">
    {error && <p role="alert">{error}</p>}
    {feedback && <p role="status">{feedback}</p>}
    {!data && !error && <p role="status">Loading guest RSVPs…</p>}
    <section className="focus-card">
      <div className="focus-heading"><h2>Headcounts by function</h2><button className="focus-secondary" disabled={!data || busy}
        onClick={() => void perform()}>Refresh replies</button></div>
      {data && functions.length > 0 && <>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Function headcounts"><table className="imported-records">
          <thead><tr>{headings.map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{totals.map((row, index) => <tr key={functions[index].id}>{row.map((value, column) => <td key={headings[column]}>{value}</td>)}</tr>)}</tbody>
        </table></div>
        <button className="focus-secondary" onClick={() => exportCounts([headings, ...totals])}>Download headcounts CSV</button>
      </>}
    </section>
    <form className="focus-card" onSubmit={create}>
      <h2>Create a guest RSVP link</h2>
      <p>Share one link with the selected household. Guests can reply without signing in. Links expire after 30 days.</p>
      <p>Copy the address before leaving this page. If you lose it, replace the link to get a new address and keep the replies.</p>
      {!guests.length && data && <p><a href={guestsHref}>Add guests to the Guest List</a> to create a link.</p>}
      {!functions.length && <p><a href={functionsHref}>Add a wedding function</a> to collect replies.</p>}
      {guests.length > 0 && functions.length > 0 && <fieldset className="workspace-fields" disabled={busy || !data}>
        <label className="focus-field">Household or individual<select value={group} onChange={event => setGroup(event.target.value)} required>
          <option value="">Choose a household or guest</option>
          {[...groups].sort(([, a], [, b]) => a.label.localeCompare(b.label)).map(([key, item]) =>
            <option key={key} value={key}>{item.label}{item.guests.length > 1 ? ' (' + item.guests.length + ')' : ''}</option>)}
        </select></label>
        {currentGroup && <div key={group} className="rsvp-functions">
          <p>Select the guests invited to each function.</p>
          {functions.map(fn => <fieldset key={fn.id}>
            <legend>{fn.name} · {dateTime(wedding.timeZone).format(new Date(fn.startsAt))}</legend>
            <div className="rsvp-choices">{currentGroup.guests.map(guest => <label key={guest.id}>
              <input type="checkbox" name="invitations" value={guest.id + ':' + fn.id} /> {guest.name}</label>)}</div>
          </fieldset>)}
        </div>}
        <button disabled={!group}>Create RSVP link</button>
      </fieldset>}
    </form>
    {!!data?.links.length && <section className="focus-card"><h2>Household links</h2>
      {data.links.map(link => {
        const expired = new Date(link.expiresAt).getTime() <= Date.now()
        const active = !link.revokedAt && !expired
        const shareURL = links[link.id]
        const invitations = replies.filter(row => row.linkId === link.id)
        return <div className="rsvp-link" key={link.id}>
          <strong>{link.label}</strong>
          <p>{link.revokedAt ? 'Revoked' : expired ? 'Expired' : 'Expires ' + dateTime(wedding.timeZone).format(new Date(link.expiresAt))}
            {' · '}{invitations.length} invitations</p>
          {!!invitations.length && <p>{[...new Set(invitations.map(row => row.function))].join(', ')}</p>}
          {active && shareURL && <label className="focus-field">Shareable link<input readOnly value={shareURL} onFocus={event => event.target.select()} /></label>}
          <div className="focus-actions">
            {active && shareURL && <button className="focus-secondary" onClick={() => {
              const manual = () => setFeedback('Select and copy the shareable link above.')
              if (navigator.clipboard) void navigator.clipboard.writeText(shareURL).then(() => setFeedback('RSVP link copied.')).catch(manual)
              else manual()
            }}>Copy link</button>}
            <button className="focus-secondary" disabled={busy} onClick={() => void change(link, 'replace')}>Replace link</button>
            {active && <button className="focus-secondary" disabled={busy} onClick={() => void change(link, 'revoke')}>Revoke link</button>}
          </div>
        </div>
      })}
    </section>}
    {!!replies.length && <section className="focus-card"><h2>Guest replies</h2>
      <div className="focus-filters">
        <label className="focus-field">Function<select value={functionFilter} onChange={event => setFunctionFilter(event.target.value)}>
          <option value="">All functions</option>{functions.map(fn => <option key={fn.id} value={fn.id}>{fn.name}</option>)}
        </select></label>
        <label className="focus-field">Reply status<select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
          <option value="">All replies</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
      </div>
      {!visible.length && <p>No replies match these filters.</p>}
      {visible.map(row => <div className="focus-item" key={row.id}>
        <span><strong>{row.guest}</strong><small>{row.function}{row.replySource && ' · ' + row.replySource + ' reply'}
          {row.repliedAt && ' · ' + dateTime(wedding.timeZone).format(new Date(row.repliedAt))}</small></span>
        <label className="focus-field">Record reply<select value={row.status} disabled={busy} aria-label={'Reply for ' + row.guest + ', ' + row.function}
          onChange={event => {
            const status = event.target.value
            void perform(() => request<void>(path + '/replies/' + row.id, { status, revision: row.revision }))
          }}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>)}
    </section>}
  </div>
}

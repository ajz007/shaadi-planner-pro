import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Plan } from './Workspace'
import type { Guest } from './WorkspaceGuests'
import { useWorkspaceData } from './WorkspaceData'
import { WorkspaceGuestPage, whatsappShare } from './WorkspaceGuestPage'
import { weddingDay } from './GuestWeddingPage'
import type { GuestTravel } from './GuestWeddingPage'

type Status = 'pending' | 'attending' | 'declined'
type Invitation = {
  id: string; guest: string; function: string; startsAt: string; status: Status; revision: number
}
type OrganizerInvitation = Invitation & { linkId: string; functionId: string; guestId: string; replySource?: string; repliedAt?: string }
type RSVPLink = { id: string; label: string; expiresAt: string; revokedAt: string | null; revision: number }
type OrganizerData = { links: RSVPLink[]; invitations: OrganizerInvitation[]; travel: GuestTravel[] }
const statusLabels: Record<Status, string> = { pending: 'Awaiting reply', attending: 'Attending', declined: 'Declined' }
const message = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Try again.'
const dateTime = (zone: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: zone })

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
  const [selected, setSelected] = useState<string[]>([])
  const [selectDay, setSelectDay] = useState('')
  const [linkScopes, setLinkScopes] = useState<Record<string, string>>({})
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
  const days = [...new Set(functions.map(fn => weddingDay(fn.startsAt, wedding.timeZone)))].sort()
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
      setSelected([])
      setSelectDay('')
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
  function selectInvitations(day: string) {
    const choices = functions.filter(fn => !day || weddingDay(fn.startsAt, wedding.timeZone) === day)
      .flatMap(fn => (currentGroup?.guests ?? []).map(guest => guest.id + ':' + fn.id))
    setSelected(current => [...new Set([...current, ...choices])])
  }
  const visible = replies.filter(row => (!functionFilter || row.functionId === functionFilter) && (!statusFilter || row.status === statusFilter))
  return <div className="workspace-rsvp">
    {error && <p role="alert">{error}</p>}
    {feedback && <p role="status">{feedback}</p>}
    {!data && !error && <p role="status">Loading guest RSVPs…</p>}
    <WorkspaceGuestPage path={path} wedding={wedding} functions={functions} />
    <section className="focus-card">
      <div className="focus-heading"><h2>Headcounts by function</h2><button className="focus-secondary" disabled={!data || busy}
        onClick={() => void perform()}>Refresh replies</button></div>
      {data && functions.length > 0 && <>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Function headcounts"><table className="imported-records">
          <thead><tr>{headings.map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{totals.map((row, index) => <tr key={functions[index].id}>{row.map((value, column) => <td key={headings[column]}>{value}</td>)}</tr>)}</tbody>
        </table></div>
        <button className="focus-secondary" onClick={() => exportCounts([headings, ...totals])}>Download headcounts CSV</button>
        <details><summary>Confirmed guests by day</summary>
          {days.map(day => {
            const attending = new Set(replies.filter(row => row.status === 'attending' && weddingDay(row.startsAt, wedding.timeZone) === day).map(row => row.guestId))
            return <p key={day}>{day} · {attending.size} {attending.size === 1 ? 'guest' : 'guests'}</p>
          })}
        </details>
      </>}
    </section>
    <form className="focus-card" onSubmit={create}>
      <h2>Create a guest RSVP link</h2>
      <p>Share one private link with the selected household. Guests can RSVP and send arrival plans without signing in.</p>
      <p>Copy the address before leaving this page. If you lose it, replace the link to get a new address and keep the replies.</p>
      {!guests.length && data && <p><a href={guestsHref}>Add guests to the Guest List</a> to create a link.</p>}
      {!functions.length && <p><a href={functionsHref}>Add a wedding function</a> to collect replies.</p>}
      {guests.length > 0 && functions.length > 0 && <fieldset className="workspace-fields" disabled={busy || !data}>
        <label className="focus-field">Household or individual<select value={group} onChange={event => {
          setGroup(event.target.value); setSelected([]); setSelectDay('')
        }} required>
          <option value="">Choose a household or guest</option>
          {[...groups].sort(([, a], [, b]) => a.label.localeCompare(b.label)).map(([key, item]) =>
            <option key={key} value={key}>{item.label}{item.guests.length > 1 ? ' (' + item.guests.length + ')' : ''}</option>)}
        </select></label>
        {currentGroup && <div key={group} className="rsvp-functions">
          <p>Select the guests invited to each function.</p>
          <div className="focus-actions">
            <button type="button" className="focus-secondary" onClick={() => selectInvitations('')}>Select all functions</button>
            <label className="focus-field">Wedding day<select value={selectDay} onChange={event => setSelectDay(event.target.value)}>
              <option value="">Choose a day</option>{days.map(day => <option key={day}>{day}</option>)}
            </select></label>
            <button type="button" className="focus-secondary" disabled={!selectDay} onClick={() => selectInvitations(selectDay)}>Select this day</button>
            <button type="button" className="focus-secondary" disabled={!selected.length} onClick={() => setSelected([])}>Clear selection</button>
          </div>
          {functions.map(fn => <fieldset key={fn.id}>
            <legend>{fn.name} · {dateTime(wedding.timeZone).format(new Date(fn.startsAt))}</legend>
            <div className="rsvp-choices">{currentGroup.guests.map(guest => <label key={guest.id}>
              <input type="checkbox" name="invitations" value={guest.id + ':' + fn.id} checked={selected.includes(guest.id + ':' + fn.id)}
                onChange={event => {
                  const { value, checked } = event.target
                  setSelected(current => checked ? [...current, value] : current.filter(item => item !== value))
                }} /> {guest.name}</label>)}</div>
          </fieldset>)}
        </div>}
        <button disabled={!selected.length}>Create RSVP link</button>
      </fieldset>}
    </form>
    {!!data?.links.length && <section className="focus-card"><h2>Household links</h2>
      {data.links.map(link => {
        const expired = new Date(link.expiresAt).getTime() <= Date.now()
        const active = !link.revokedAt && !expired
        const scope = linkScopes[link.id] ?? ''
        const shareURL = links[link.id] && links[link.id] + (scope ? '?' + scope : '')
        const invitations = replies.filter(row => row.linkId === link.id)
        const linkDays = [...new Set(invitations.map(row => weddingDay(row.startsAt, wedding.timeZone)))].sort()
        const linkFunctions = [...new Map(invitations.map(row => [row.functionId, row.function])).entries()]
        return <div className="rsvp-link" key={link.id}>
          <strong>{link.label}</strong>
          <p>{link.revokedAt ? 'Revoked' : expired ? 'Expired' : 'Expires ' + dateTime(wedding.timeZone).format(new Date(link.expiresAt))}
            {' · '}{invitations.length} invitations</p>
          {!!invitations.length && <p>{[...new Set(invitations.map(row => row.function))].join(', ')}</p>}
          {active && shareURL && <>
            <label className="focus-field">Open the invitation on<select value={scope} onChange={event => {
              const next = event.target.value
              setLinkScopes(current => ({ ...current, [link.id]: next }))
            }}>
              <option value="">All invited events</option>
              {linkDays.map(day => <option key={day} value={'day=' + day}>{day}</option>)}
              {linkFunctions.map(([id, name]) => <option key={id} value={'function=' + id}>{name}</option>)}
            </select></label>
            <label className="focus-field">Private link<input readOnly value={shareURL} onFocus={event => event.target.select()} /></label>
          </>}
          <div className="focus-actions">
            {active && shareURL && <>
              <a href={shareURL} target="_blank" rel="noreferrer">Preview as guest</a>
              <a href={whatsappShare('Hi ' + link.label + '! Please RSVP and share your arrival plans for ' + wedding.name + '.', shareURL)}
                target="_blank" rel="noreferrer">Share on WhatsApp</a>
            </>}
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
    {!!data?.travel.length && <section className="focus-card"><h2>Arrival plans from guests</h2>
      <p>Review these replies before updating the pickup or room plan.</p>
      {data.travel.map(row => <div className="focus-item" key={row.guestId}><span><strong>{row.guest}</strong>
        <small>{[row.arrivalDate || 'Date pending', row.arrivalTime, 'Pickup ' + (row.pickup || 'pending'),
          'Accommodation ' + (row.stay || 'pending')].filter(Boolean).join(' · ')}</small>
        {row.updatedAt && <small>Updated {dateTime(wedding.timeZone).format(new Date(row.updatedAt))}</small>}</span>
        <a href={guestsHref + (guestsHref.includes('?') ? '&' : '?') + 'guest=' + encodeURIComponent(row.guest)}>Review guest</a>
      </div>)}
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

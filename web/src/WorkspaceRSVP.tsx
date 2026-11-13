import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Plan } from './Workspace'
import type { Guest } from './WorkspaceGuests'
import { rsvpGroupKey } from './WorkspaceGuests'
import { useWorkspaceData } from './WorkspaceData'
import { WorkspaceGuestPage, whatsappShare } from './WorkspaceGuestPage'
import { formatDay, weddingDay } from './GuestWeddingPage'
import type { GuestPage, GuestTravel } from './GuestWeddingPage'
import { RSVPShare } from './RSVPShare'

type Status = 'pending' | 'attending' | 'declined'
type Invitation = {
  id: string; guest: string; function: string; startsAt: string; status: Status; revision: number
}
type OrganizerInvitation = Invitation & { linkId: string; functionId: string; guestId: string; replySource?: string; repliedAt?: string; hiddenFromGuest?: boolean }
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

function InvitationPicker({ guests, functions, timeZone, existing }: {
  guests: Guest[]; functions: Plan['functions']; timeZone: string; existing: OrganizerInvitation[]
}) {
  const alreadyInvited = new Set(existing.filter(row => !row.hiddenFromGuest).map(row => row.guestId + ':' + row.functionId))
  const days = new Map<string, Plan['functions']>()
  for (const fn of functions) {
    const date = weddingDay(fn.startsAt, timeZone)
    const events = days.get(date) ?? []
    events.push(fn)
    days.set(date, events)
  }
  const available = functions.flatMap(fn => guests.map(guest => ({ key: guest.id + ':' + fn.id, familyOnly: !!fn.familyOnly })))
    .filter(pair => !alreadyInvited.has(pair.key))
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const checked = (key: string, familyOnly: boolean) => overrides[key] ?? !familyOnly
  const selected = available.filter(pair => checked(pair.key, pair.familyOnly))
  function toggle(keys: string[], checked: boolean) {
    setOverrides(current => ({ ...current, ...Object.fromEntries(keys.map(key => [key, checked])) }))
  }
  return <div className="rsvp-functions">
    <p><strong>{guests.map(guest => guest.name).join(', ')}</strong></p>
    {available.length < guests.length * functions.length && <p>Guests already invited to a function stay on their existing household link.</p>}
    {functions.some(fn => fn.familyOnly) && <p>Family-only functions start unchecked. To include one, select its guests under <strong>Adjust by guest or function</strong>.</p>}
    {functions.some(fn => !fn.familyOnly) && <fieldset className="rsvp-picker-days"><legend>Guest functions by day</legend>
      {[...days].sort(([left], [right]) => left.localeCompare(right)).map(([date, allEvents]) => {
        const events = allEvents.filter(fn => !fn.familyOnly)
        if (!events.length) return null
        const pairs = events.flatMap(fn => guests.map(guest => guest.id + ':' + fn.id)).filter(key => !alreadyInvited.has(key))
        const count = pairs.filter(key => checked(key, false)).length
        return <label className="rsvp-picker-day" key={date}>
          <input type="checkbox" checked={pairs.length > 0 && count === pairs.length} disabled={!pairs.length}
            ref={node => { if (node) node.indeterminate = count > 0 && count < pairs.length }}
            onChange={event => toggle(pairs, event.target.checked)} />
          <span><strong>{formatDay(date)}</strong><small>{events.map(fn => fn.name).join(' · ')}</small></span>
        </label>
      })}
    </fieldset>}
    {available.length > 0 && <details className="rsvp-picker-details"><summary>Adjust by guest or function</summary>
      {[...days].sort(([left], [right]) => left.localeCompare(right)).map(([date, events]) =>
        <details key={date}><summary>{formatDay(date)}</summary>
          {events.map(fn => <fieldset key={fn.id}><legend>{fn.name}{fn.familyOnly && ' · Family only'}</legend>
            <div className="rsvp-choices">{guests.map(guest => {
              const key = guest.id + ':' + fn.id
              return <label key={key}><input type="checkbox" checked={alreadyInvited.has(key) || checked(key, !!fn.familyOnly)} disabled={alreadyInvited.has(key)}
                onChange={event => toggle([key], event.target.checked)} /> {guest.name}{alreadyInvited.has(key) && ' (invited)'}</label>
            })}</div>
          </fieldset>)}
        </details>)}
    </details>}
    {selected.map(({ key, familyOnly }) => <input key={key} type="hidden" name="invitations" value={key + (familyOnly ? ':family' : '')} />)}
    <p role="status">{selected.length} {selected.length === 1 ? 'invitation' : 'invitations'} selected
      {selected.some(pair => pair.familyOnly) && ' · Includes family-only functions'}</p>
    {!available.length && <p>Everyone already has invitations for these functions.</p>}
    {selected.length > 1000 && <p>Select up to 1,000 guest and function combinations per link.</p>}
    <button disabled={!selected.length || selected.length > 1000}>Create RSVP link</button>
  </div>
}

export function WorkspaceRSVP({ wedding, functions, guestsHref, functionsHref, followUpHref, initialHousehold }: {
  wedding: Plan['wedding']; functions: Plan['functions']; guestsHref: string; functionsHref: string; followUpHref: string; initialHousehold: string
}) {
  const { request } = useWorkspaceData()
  const weddingPath = '/weddings/' + wedding.id
  const path = weddingPath + '/guest-rsvp'
  const [data, setData] = useState<OrganizerData>()
  const [savedDesign, setSavedDesign] = useState<GuestPage>()
  const [guests, setGuests] = useState<Guest[]>([])
  const [group, setGroup] = useState('')
  const [linkScopes, setLinkScopes] = useState<Record<string, string>>({})
  const [links, setLinks] = useState<Record<string, string>>({})
  const [functionFilter, setFunctionFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [householdFilter, setHouseholdFilter] = useState(initialHousehold)
  const replyHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (initialHousehold) replyHeading.current?.focus()
  }, [initialHousehold])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const groups = new Map<string, { label: string; guests: Guest[] }>()
  for (const guest of guests) {
    const key = rsvpGroupKey(guest)
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
      const [guestId, functionId, audience] = String(value).split(':')
      return { guestId, functionId, includeFamilyOnly: audience === 'family' }
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
    const invited = replies.filter(row => row.functionId === fn.id && !row.hiddenFromGuest)
    return [fn.name, dateTime(wedding.timeZone).format(new Date(fn.startsAt)), invited.length,
      ...(['attending', 'pending', 'declined'] as const).map(status => invited.filter(row => row.status === status).length)]
  })
  const headings = ['Function', 'Starts', 'Invited', 'Attending', 'Awaiting reply', 'Declined']
  const guestHouseholds = new Map(guests.map(guest => [guest.id, rsvpGroupKey(guest)]))
  const visible = replies.filter(row => (!functionFilter || row.functionId === functionFilter) &&
    (!statusFilter || row.status === statusFilter) && (!householdFilter || guestHouseholds.get(row.guestId) === householdFilter))
  return <div className="workspace-rsvp">
    <p>Create invitation links, track replies for each function and see attendance counts. Use <a href={followUpHref}>RSVP Follow-up</a> to assign a caller, set a reminder date or record the next step.</p>
    {error && <p role="alert">{error}</p>}
    {feedback && <p role="status">{feedback}</p>}
    {!data && !error && <p role="status">Loading guest RSVPs…</p>}
    <WorkspaceGuestPage path={path} wedding={wedding} functions={functions} onSavedDesign={setSavedDesign} />
    <details className="focus-card guest-page-editor">
      <summary>Headcounts by function</summary>
      <button className="focus-secondary" disabled={!data || busy} onClick={() => void perform()}>Refresh replies</button>
      {data && functions.length > 0 && <>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Function headcounts"><table className="imported-records">
          <thead><tr>{headings.map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{totals.map((row, index) => <tr key={functions[index].id}>{row.map((value, column) => <td key={headings[column]}>{value}</td>)}</tr>)}</tbody>
        </table></div>
        <button className="focus-secondary" onClick={() => exportCounts([headings, ...totals])}>Download headcounts CSV</button>
        <details><summary>Confirmed guests by day</summary>
          {days.map(day => {
            const attending = new Set(replies.filter(row => !row.hiddenFromGuest && row.status === 'attending' &&
              weddingDay(row.startsAt, wedding.timeZone) === day).map(row => row.guestId))
            return <p key={day}>{day} · {attending.size} {attending.size === 1 ? 'guest' : 'guests'}</p>
          })}
        </details>
      </>}
    </details>
    <form className="focus-card" onSubmit={create}>
      <h2>Create a guest RSVP link</h2>
      <p>Share one private link with the selected household. Guests can RSVP and send arrival plans without signing in.</p>
      <p>Copy the address before leaving this page. If you lose it, replace the link to get a new address and keep the replies.</p>
      {!guests.length && data && <p><a href={guestsHref}>Add guests to the Guest List</a> to create a link.</p>}
      {!functions.length && <p><a href={functionsHref}>Add a wedding function</a> to collect replies.</p>}
      {guests.length > 0 && functions.length > 0 && <fieldset className="workspace-fields" disabled={busy || !data}>
        <label className="focus-field">Household or individual<select value={group} onChange={event => setGroup(event.target.value)} required>
          <option value="">Choose a household or guest</option>
          {[...groups].sort(([, a], [, b]) => a.label.localeCompare(b.label)).map(([key, item]) =>
            <option key={key} value={key}>{item.label}{item.guests.length > 1 ? ' (' + item.guests.length + ')' : ''}</option>)}
        </select></label>
        {currentGroup && <InvitationPicker key={group} guests={currentGroup.guests} functions={functions}
          timeZone={wedding.timeZone} existing={replies} />}
      </fieldset>}
    </form>
    {!!data?.links.length && <section className="focus-card"><h2>Household links</h2>
      {data.links.map(link => {
        const expired = new Date(link.expiresAt).getTime() <= Date.now()
        const active = !link.revokedAt && !expired
        const scope = linkScopes[link.id] ?? ''
        const shareURL = links[link.id] && links[link.id] + (scope ? '?' + scope : '')
        const linkReplies = replies.filter(row => row.linkId === link.id)
        const invitations = linkReplies.filter(row => !row.hiddenFromGuest)
        const linkDays = [...new Set(invitations.map(row => weddingDay(row.startsAt, wedding.timeZone)))].sort()
        const linkFunctions = [...new Map(invitations.map(row => [row.functionId, row.function])).entries()]
        return <div className="rsvp-link" key={link.id}>
          <strong>{link.label}</strong>
          <p>{link.revokedAt ? 'Revoked' : expired ? 'Expired' : 'Expires ' + dateTime(wedding.timeZone).format(new Date(link.expiresAt))}
            {' · '}{invitations.length} invitations</p>
          {linkReplies.some(row => row.hiddenFromGuest) && <p className="focus-note">Family-only invitations are hidden on this link. Select those guests and functions explicitly to share them on a new link.</p>}
          {!!invitations.length && <p>{[...new Set(invitations.map(row => row.function))].join(', ')}</p>}
          {active && shareURL && !!invitations.length && <>
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
            {active && shareURL && !!invitations.length && <>
              <a href={shareURL} target="_blank" rel="noreferrer">Preview as guest</a>
              {!savedDesign && <a href={whatsappShare('Hi ' + link.label + '! Please RSVP and share your arrival plans for ' + wedding.name + '.', shareURL)}
                target="_blank" rel="noreferrer">Open message in WhatsApp</a>}
            </>}
            {active && shareURL && !!invitations.length && <button className="focus-secondary" onClick={() => {
              const manual = () => setFeedback('Select and copy the shareable link above.')
              if (navigator.clipboard) void navigator.clipboard.writeText(shareURL).then(() => setFeedback('RSVP link copied.')).catch(manual)
              else manual()
            }}>Copy link</button>}
            {!!invitations.length && <button className="focus-secondary" disabled={busy} onClick={() => void change(link, 'replace')}>Replace link</button>}
            {active && <button className="focus-secondary" disabled={busy} onClick={() => void change(link, 'revoke')}>Revoke link</button>}
          </div>
          {active && shareURL && !!invitations.length && savedDesign &&
            <RSVPShare page={savedDesign} household={link.label} address={shareURL} />}
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
    <section className="focus-card"><h2 ref={replyHeading} tabIndex={-1}>Guest replies</h2>
      {data && !replies.length && <p>No function replies yet. Create an RSVP link to start collecting them.</p>}
      {!!replies.length && <>
      <div className="focus-filters">
        <label className="focus-field">Household or individual<select value={householdFilter} onChange={event => setHouseholdFilter(event.target.value)}>
          <option value="">Everyone</option>
          {householdFilter && !groups.has(householdFilter) && <option value={householdFilter}>Selected household or guest</option>}
          {[...groups].sort(([, a], [, b]) => a.label.localeCompare(b.label))
            .map(([key, { label }]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        <label className="focus-field">Function<select value={functionFilter} onChange={event => setFunctionFilter(event.target.value)}>
          <option value="">All functions</option>{functions.map(fn => <option key={fn.id} value={fn.id}>{fn.name}</option>)}
        </select></label>
        <label className="focus-field">Reply status<select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
          <option value="">All replies</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
      </div>
      {!visible.length && <p>No replies match these filters.</p>}
      {visible.map(row => <div className="focus-item" key={row.id}>
        <span><strong>{row.guest}</strong><small>{row.function}{row.hiddenFromGuest && ' · Hidden from guest link'}{row.replySource && ' · ' + row.replySource + ' reply'}
          {row.repliedAt && ' · ' + dateTime(wedding.timeZone).format(new Date(row.repliedAt))}</small></span>
        <label className="focus-field">Record reply<select value={row.status} disabled={busy || row.hiddenFromGuest} aria-label={'Reply for ' + row.guest + ', ' + row.function}
          onChange={event => {
            const status = event.target.value
            void perform(() => request<void>(path + '/replies/' + row.id, { status, revision: row.revision }))
          }}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>)}
      </>}
    </section>
  </div>
}

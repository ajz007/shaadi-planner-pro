import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { PrintSection } from './PlanActions'

export type Guest = {
  id: string; workbookId: string; name: string; household: string; side: string; rsvp: string;
  arrivalDate: string; arrivalTime: string; arrivalMode: string; transportRequired: string; revision: number
  links?: { section: string; label: string; detail: string }[]
}
const choices = [
  { field: 'side', label: 'Wedding side', options: ['Bride', 'Groom', 'Both'] },
  { field: 'rsvp', label: 'RSVP status', options: ['Pending', 'Maybe', 'Confirmed', 'Declined'] },
  { field: 'arrivalMode', label: 'Arrival mode', options: ['Flight', 'Train', 'Car', 'Bus', 'Other'] },
  { field: 'transportRequired', label: 'Transport required', options: ['Yes', 'No'] },
] as const
const guestFilters = [...choices, { field: 'arrivalDate', label: 'Arrival date', options: [] }] as const
const displayDate = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' })
export const shownDate = (date: string) => date ? displayDate.format(new Date(date + 'T00:00:00Z')) : ''

export function localDay(zone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts()
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-')
}

export function WorkspaceGuests({ wedding, initialSearch = '', workbookView = false }: {
  wedding: { id: string; name: string; timeZone: string }; initialSearch?: string; workbookView?: boolean
}) {
  const [guests, setGuests] = useState<Guest[]>()
  const [editing, setEditing] = useState<Guest | 'new'>()
  const [filters, setFilters] = useState<Partial<Record<typeof guestFilters[number]['field'], string>>>({})
  const [search, setSearch] = useState(initialSearch)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const url = '/api/workspace/weddings/' + wedding.id + '/guests'
  const today = localDay(wedding.timeZone)
  const current = editing === 'new' ? undefined : editing

  async function load(signal?: AbortSignal) {
    const response = await fetch(url, { signal })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error)
    setGuests(body)
  }

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [url])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const fields = Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value).trim()]))
      const response = await fetch(current ? url + '/' + current.id : url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, revision: current?.revision ?? 0 }),
      })
      if (!response.ok) throw new Error((await response.json()).error)
      setEditing(undefined)
      setMessage('Guest saved.')
      await load().catch(() => setError('Guest saved. Refresh the list to see the change.'))
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Guest could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const query = search.trim().toLowerCase()
  const filtered = (guests ?? []).filter(guest =>
    (!query || [guest.name, guest.household, guest.workbookId].some(value => value.toLowerCase().includes(query))) &&
    guestFilters.every(({ field }) => !filters[field] || (guest[field] || 'missing') === filters[field]))
    .sort((a, b) => (a.arrivalDate || '9999').localeCompare(b.arrivalDate || '9999') ||
      (a.arrivalTime || '99').localeCompare(b.arrivalTime || '99') || a.name.localeCompare(b.name))
  const filterLabel = [
    query && 'Search: ' + search.trim(),
    ...guestFilters.map(({ field, label }) => {
      const value = filters[field]
      return value && label + ': ' + (value === 'missing' ? 'Not recorded' : field === 'arrivalDate' ? shownDate(value) : value)
    }),
  ].filter(Boolean).join(' · ')

  return <section className="focus-card">
    <div className="focus-heading"><h2>Guest List</h2><div className="focus-actions">
      <button disabled={busy} onClick={() => { setEditing('new'); setError(''); setMessage('') }}>Add guest</button>
      <button className="focus-secondary" disabled={busy} onClick={() => void load().catch(error => setError(error.message))}>Refresh guests</button>
      {guests && <PrintSection title="Guest List" weddingName={wedding.name}
        columns={['Guest', 'Household', 'Side', 'Arrival date', 'Time', 'Mode', 'Transport', 'RSVP']}
        records={filtered.map(g => [g.name, g.household, g.side, shownDate(g.arrivalDate), g.arrivalTime, g.arrivalMode, g.transportRequired, g.rsvp])}
        filters={filterLabel} />}
    </div></div>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
    <div id="workspace-guest-editor" />
    {editing && <form className="focus-card" key={current?.id ?? 'new'} onSubmit={event => void save(event)}>
      <h3>{current ? 'Edit ' + current.name : 'Add guest'}</h3>
      <fieldset className="workspace-fields focus-form-grid" disabled={busy}>
        <label className="focus-field">Guest name<input name="name" required maxLength={120} defaultValue={current?.name} /></label>
        <label className="focus-field">Household<input name="household" maxLength={120} defaultValue={current?.household}
          list="workspace-households" /></label>
        <datalist id="workspace-households">{[...new Set((guests ?? []).map(guest => guest.household).filter(Boolean))].map(name => <option key={name} value={name} />)}</datalist>
        <label className="focus-field">Guest arrival date<input type="date" name="arrivalDate" defaultValue={current?.arrivalDate} /></label>
        <label className="focus-field">Arrival time<input type="time" name="arrivalTime" defaultValue={current?.arrivalTime} /></label>
        {choices.map(({ field, label, options }) => <label className="focus-field" key={field}>Guest {label.toLowerCase()}
          <select name={field} defaultValue={current?.[field] ?? ''}>
            <option value="">Not recorded</option>
            {[...new Set([...options, current?.[field] ?? ''].filter(Boolean))].map(value => <option key={value}>{value}</option>)}
          </select>
        </label>)}
      </fieldset>
      <div className="focus-actions"><button disabled={busy}>{busy ? 'Saving…' : 'Save guest'}</button>
        <button className="focus-secondary" type="button" disabled={busy} onClick={() => { setEditing(undefined); setError('') }}>Cancel</button></div>
    </form>}
    <div className="focus-filters">
      <label className="focus-field">Find a guest<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
      {guestFilters.map(({ field, label }) => {
        const options = [...new Set((guests ?? []).map(guest => guest[field]).filter(Boolean))].sort()
        return <label className="focus-field" key={field}>{label}<select aria-label={label} value={filters[field] ?? ''}
          onChange={event => setFilters(previous => ({ ...previous, [field]: event.target.value }))}>
          <option value="">Any</option>
          {field === 'arrivalDate' && <option value={today}>Today · {shownDate(today)}</option>}
          {options.filter(value => field !== 'arrivalDate' || value !== today).map(value =>
            <option key={value} value={value}>{field === 'arrivalDate' ? shownDate(value) : value}</option>)}
          <option value="missing">Not recorded</option>
        </select></label>
      })}
      {(query || Object.values(filters).some(Boolean)) && <button className="focus-secondary" onClick={() => { setSearch(''); setFilters({}) }}>Clear filters</button>}
    </div>
    <p role="status">{guests ? filtered.length + ' of ' + guests.length + ' guests' : 'Loading guests…'}</p>
    {workbookView ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Guest List table">
      <table className="imported-records"><thead><tr>{['Guest', 'Household', 'Side', 'RSVP', 'Arrival date', 'Time', 'Mode', 'Transport', 'Edit']
        .map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{filtered.map(guest => <tr key={guest.id}>
          {[guest.name, guest.household, guest.side, guest.rsvp, shownDate(guest.arrivalDate), guest.arrivalTime, guest.arrivalMode, guest.transportRequired]
            .map((value, index) => <td key={index}>{value}</td>)}
          <td><button className="focus-secondary" aria-label={'Edit ' + guest.name} disabled={busy} onClick={() => {
            setEditing(guest); setError(''); setMessage(''); document.getElementById('workspace-guest-editor')?.scrollIntoView()
          }}>Edit</button></td>
        </tr>)}</tbody>
      </table>
    </div> : <div className="focus-record-grid">{filtered.map(guest => <article className="focus-card" key={guest.id}>
      <div className="focus-heading"><h3>{guest.name}</h3>{guest.rsvp && <span className="focus-chip">{guest.rsvp}</span>}</div>
      <p>{[guest.household, guest.side].filter(Boolean).join(' · ')}</p>
      <p>{[shownDate(guest.arrivalDate), guest.arrivalTime, guest.arrivalMode].filter(Boolean).join(' · ') || 'Arrival not recorded'}</p>
      <p>Transport: {guest.transportRequired || 'Not recorded'}</p>
      {!!guest.links?.length && <details className="focus-completed">
        <summary>Linked room, pickup and follow-up records ({guest.links.length})</summary>
        <ul>{guest.links.map((link, index) => <li key={index}><strong>{link.section}</strong> · {link.label}
          {link.detail && ' · ' + link.detail}</li>)}</ul>
      </details>}
      <button className="focus-secondary" aria-label={'Edit ' + guest.name} disabled={busy} onClick={() => {
        setEditing(guest); setError(''); setMessage('')
        document.getElementById('workspace-guest-editor')?.scrollIntoView()
      }}>Edit guest</button>
    </article>)}</div>}
  </section>
}

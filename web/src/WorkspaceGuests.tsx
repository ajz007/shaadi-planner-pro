import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { PrintSection } from './PlanActions'
import { VoiceField, VoiceNotice } from './VoiceField'

export type Guest = {
  id: string; workbookId: string; name: string; household: string; side: string; rsvp: string;
  arrivalDate: string; arrivalTime: string; arrivalMode: string; transportRequired: string; stayRequired: string; revision: number
  links?: { section: string; label: string; detail: string }[]
}
const choices = [
  { field: 'side', label: 'Wedding side', options: ['Bride', 'Groom', 'Both'] },
  { field: 'rsvp', label: 'RSVP status', options: ['Pending', 'Maybe', 'Confirmed', 'Declined'] },
  { field: 'arrivalMode', label: 'Arrival mode', options: ['Flight', 'Train', 'Car', 'Bus', 'Other'] },
  { field: 'transportRequired', label: 'Transport required', options: ['Yes', 'No'] },
  { field: 'stayRequired', label: 'Stay required', options: ['Yes', 'No'] },
] as const
const guestFilters = [...choices, { field: 'household', label: 'Household', options: [] },
  { field: 'arrivalDate', label: 'Arrival date', options: [] }] as const
const bulkFields = choices.filter(choice => choice.field === 'side' || choice.field === 'stayRequired' || choice.field === 'transportRequired')
const maxBulkTargets = 3500
const filterValue = (value: string) => value ? 'recorded:' + value : 'missing'
const displayDate = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' })
export const shownDate = (date: string) => date ? displayDate.format(new Date(date + 'T00:00:00Z')) : ''

export function localDay(zone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts()
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-')
}

function GuestLinks({ guest }: { guest: Guest }) {
  if (!guest.links?.length) return null
  return <details className="focus-completed">
    <summary>Room, pickup and follow-up ({guest.links.length})</summary>
    <ul>{guest.links.map((link, index) => <li key={index}><strong>{link.section}</strong> · {link.label}
      {link.detail && ' · ' + link.detail}</li>)}</ul>
  </details>
}

export function WorkspaceGuests({ wedding, initialSearch = '', workbookView = false }: {
  wedding: { id: string; name: string; timeZone: string }; initialSearch?: string; workbookView?: boolean
}) {
  const [guests, setGuests] = useState<Guest[]>()
  const [editing, setEditing] = useState<Guest | 'new'>()
  const [filters, setFilters] = useState<Partial<Record<typeof guestFilters[number]['field'], string>>>({})
  const [search, setSearch] = useState(initialSearch)
  const [sortBy, setSortBy] = useState('arrival')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [bulkField, setBulkField] = useState<typeof bulkFields[number]['field']>('side')
  const [bulkValue, setBulkValue] = useState('')
  const [blanksOnly, setBlanksOnly] = useState(false)
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
    guestFilters.every(({ field }) => !filters[field] || filterValue(guest[field]) === filters[field]))
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'household') return Number(!a.household) - Number(!b.household) ||
        a.household.localeCompare(b.household) || a.name.localeCompare(b.name)
      return (a.arrivalDate || '9999').localeCompare(b.arrivalDate || '9999') ||
        (a.arrivalTime || '99').localeCompare(b.arrivalTime || '99') || a.name.localeCompare(b.name)
    })
  const filterLabel = [
    query && 'Search: ' + search.trim(),
    ...guestFilters.map(({ field, label }) => {
      const value = filters[field]
      if (!value) return ''
      const recorded = value.slice('recorded:'.length)
      return label + ': ' + (value === 'missing' ? 'Not recorded' : field === 'arrivalDate' ? shownDate(recorded) : recorded)
    }),
  ].filter(Boolean).join(' · ')
  const selection = (guests ?? []).filter(guest => selected.has(guest.id))
  const outsideFilter = selection.length - filtered.filter(guest => selected.has(guest.id)).length
  const changedCount = selection.filter(guest => guest[bulkField] !== bulkValue && (!blanksOnly || !guest[bulkField])).length
  const fieldOptions = bulkFields.find(choice => choice.field === bulkField)!

  function closeBulk() {
    setBulkOpen(false)
    setSelected(new Set())
    setBulkField('side')
    setBulkValue('')
    setBlanksOnly(false)
  }

  async function applyBulk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !bulkValue || !changedCount || selection.length > maxBulkTargets) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch(url + '/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: bulkField, value: bulkValue, blanksOnly,
          guests: selection.map(({ id, revision }) => ({ id, revision })) }),
      })
      const body = await response.json()
      if (response.status === 409) throw new Error('A selected guest changed. Refresh guests and review the selection before applying again.')
      if (!response.ok) throw new Error(body.error)
      closeBulk()
      setMessage(body.updated === 1 ? 'Updated 1 guest.' : 'Updated ' + body.updated + ' guests.')
      await load().catch(() => { setGuests(undefined); setError('Changes were saved. Refresh guests to see the latest records.') })
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Guest changes could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  function guestCheckbox(guest: Guest) {
    return <input type="checkbox" aria-label={'Select ' + guest.name} checked={selected.has(guest.id)} disabled={busy}
      onChange={event => {
        const checked = event.target.checked
        setSelected(previous => {
          const next = new Set(previous)
          if (checked) next.add(guest.id)
          else next.delete(guest.id)
          return next
        })
      }} />
  }

  function editGuest(guest: Guest) {
    closeBulk()
    setEditing(guest); setError(''); setMessage('')
    document.getElementById('workspace-guest-editor')?.scrollIntoView()
  }

  return <section className="focus-card">
    <div className="focus-heading"><h2>Guest List</h2><div className="focus-actions">
      <button disabled={busy} onClick={() => { closeBulk(); setEditing('new'); setError(''); setMessage('') }}>Add guest</button>
      {!!guests?.length && !bulkOpen && <button className="focus-secondary" disabled={busy} onClick={() => {
        setEditing(undefined); setError(''); setMessage(''); setBulkOpen(true)
      }}>Bulk edit</button>}
      <button className="focus-secondary" disabled={busy} onClick={() => {
        setError('')
        void load().catch(error => setError(error.message))
      }}>Refresh guests</button>
      {guests && <PrintSection title="Guest List" weddingName={wedding.name}
        columns={['Guest', 'Household', 'Side', 'Arrival date', 'Time', 'Mode', 'Stay required', 'Transport', 'RSVP']}
        records={filtered.map(g => [g.name, g.household, g.side, shownDate(g.arrivalDate), g.arrivalTime, g.arrivalMode, g.stayRequired, g.transportRequired, g.rsvp])}
        filters={filterLabel} />}
    </div></div>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
    <div id="workspace-guest-editor" />
    {editing && <form className="focus-card" key={current?.id ?? 'new'} onSubmit={event => void save(event)}>
      <h3>{current ? 'Edit ' + current.name : 'Add guest'}</h3>
      <fieldset className="workspace-fields focus-form-grid" disabled={busy}>
        <VoiceField label="Guest name" name="name" required maxLength={120} defaultValue={current?.name} />
        <VoiceField label="Household" name="household" maxLength={120} defaultValue={current?.household} list="workspace-households" />
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
      <VoiceNotice />
      <div className="focus-actions"><button disabled={busy}>{busy ? 'Saving…' : 'Save guest'}</button>
        <button className="focus-secondary" type="button" disabled={busy} onClick={() => { setEditing(undefined); setError('') }}>Cancel</button></div>
    </form>}
    <div className="focus-filters">
      <div><VoiceField label="Find a guest" value={search} onValueChange={setSearch} search /><VoiceNotice /></div>
      <label className="focus-field">Sort by<select aria-label="Sort by" value={sortBy} onChange={event => setSortBy(event.target.value)}>
        <option value="arrival">Arrival date and time</option><option value="name">Guest name</option><option value="household">Household</option>
      </select></label>
      {guestFilters.map(({ field, label }) => {
        const options = [...new Set((guests ?? []).map(guest => guest[field]).filter(Boolean))].sort()
        return <label className="focus-field" key={field}>{label}<select aria-label={label} value={filters[field] ?? ''}
          onChange={event => setFilters(previous => ({ ...previous, [field]: event.target.value }))}>
          <option value="">Any</option>
          {field === 'arrivalDate' && <option value={filterValue(today)}>Today · {shownDate(today)}</option>}
          {options.filter(value => field !== 'arrivalDate' || value !== today).map(value =>
            <option key={value} value={filterValue(value)}>{field === 'arrivalDate' ? shownDate(value) : value}</option>)}
          <option value="missing">Not recorded</option>
        </select></label>
      })}
      {(query || Object.values(filters).some(Boolean)) && <button className="focus-secondary" onClick={() => { setSearch(''); setFilters({}) }}>Clear filters</button>}
    </div>
    <p role="status">{guests ? filtered.length + ' of ' + guests.length + ' guests' : 'Loading guests…'}</p>
    {bulkOpen && <form className="focus-card" onSubmit={event => void applyBulk(event)}>
      <h3>Bulk edit guests</h3>
      <fieldset className="workspace-fields" disabled={busy}>
        <div className="focus-actions">
          <button type="button" className="focus-secondary" disabled={!filtered.length}
            onClick={() => setSelected(previous => new Set([...previous, ...filtered.map(guest => guest.id)]))}>
            {filterLabel ? 'Select all matching guests' : 'Select all guests'}
          </button>
          <button type="button" className="focus-secondary" disabled={!selection.length} onClick={() => setSelected(new Set())}>Clear selection</button>
        </div>
        <p role="status">{selection.length} selected{outsideFilter > 0 && ' · ' + outsideFilter + ' outside the current filters'}</p>
        <div className="focus-form-grid">
          <label className="focus-field">Field to edit<select value={bulkField} onChange={event => {
            setBulkField(event.target.value as typeof bulkField)
            setBulkValue('')
          }}>{bulkFields.map(choice => <option key={choice.field} value={choice.field}>{choice.label}</option>)}</select></label>
          <label className="focus-field">New value<select value={bulkValue} required onChange={event => setBulkValue(event.target.value)}>
            <option value="">Choose a value</option>{fieldOptions.options.map(option => <option key={option}>{option}</option>)}
          </select></label>
        </div>
        <label><input type="checkbox" checked={blanksOnly} onChange={event => setBlanksOnly(event.target.checked)} /> Fill blanks only</label>
        {bulkValue && <p role="status">{changedCount ? `Set ${fieldOptions.label.toLowerCase()} to ${bulkValue} for ${changedCount} ${changedCount === 1 ? 'guest' : 'guests'}.`
          : 'No selected guests need this change.'}</p>}
        {selection.length > maxBulkTargets && <p>Select up to {maxBulkTargets.toLocaleString('en-IN')} guests per edit.</p>}
        <div className="focus-actions">
          <button disabled={!bulkValue || !changedCount || selection.length > maxBulkTargets}>{busy ? 'Applying…' : 'Apply bulk edit'}</button>
          <button type="button" className="focus-secondary" onClick={closeBulk}>Cancel</button>
        </div>
      </fieldset>
    </form>}
    {workbookView ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Guest List table">
      <table className="imported-records workspace-sheet"><thead><tr>{['Guest', 'Household', 'Side', 'RSVP', 'Arrival date', 'Time', 'Mode', 'Stay required', 'Transport', 'Linked records', 'Edit']
        .map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{filtered.map(guest => <tr key={guest.id}>
          <th scope="row">{bulkOpen && guestCheckbox(guest)} {guest.name}</th>
          {[guest.household, guest.side, guest.rsvp, shownDate(guest.arrivalDate), guest.arrivalTime, guest.arrivalMode, guest.stayRequired, guest.transportRequired]
            .map((value, index) => <td key={index}>{value}</td>)}
          <td><GuestLinks guest={guest} /></td>
          <td><button className="focus-secondary" aria-label={'Edit ' + guest.name} disabled={busy} onClick={() => editGuest(guest)}>Edit</button></td>
        </tr>)}</tbody>
      </table>
    </div> : <div className="focus-record-grid">{filtered.map(guest => <article className="focus-card" key={guest.id}>
      <div className="focus-heading"><h3>{guest.name}</h3>{bulkOpen && guestCheckbox(guest)}{guest.rsvp && <span className="focus-chip">{guest.rsvp}</span>}</div>
      <p>{[guest.household, guest.side].filter(Boolean).join(' · ')}</p>
      <p>{[shownDate(guest.arrivalDate), guest.arrivalTime, guest.arrivalMode].filter(Boolean).join(' · ') || 'Arrival not recorded'}</p>
      <p>Stay required: {guest.stayRequired || 'Not recorded'} · Transport: {guest.transportRequired || 'Not recorded'}</p>
      <GuestLinks guest={guest} />
      <button className="focus-secondary" aria-label={'Edit ' + guest.name} disabled={busy} onClick={() => editGuest(guest)}>Edit guest</button>
    </article>)}</div>}
  </section>
}

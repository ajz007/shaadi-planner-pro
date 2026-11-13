import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { PrintSection } from './PlanActions'
import { VoiceField, VoiceNotice } from './VoiceField'
import { useEditorFocus } from './useEditorFocus'
import { useWorkspaceData } from './WorkspaceData'
import { GuestFilters, matchesGuestRules, setGuestRule } from './GuestFilters'
import type { FilterMode, GuestFilterOptions, GuestRules } from './GuestFilters'

export type Guest = {
  id: string; workbookId: string; name: string; household: string; side: string; rsvp: string;
  arrivalDate: string; arrivalTime: string; arrivalMode: string; transportRequired: string; stayRequired: string; revision: number
  links?: { section: string; label: string; detail: string }[]
  labels?: string[]
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
type BulkField = typeof bulkFields[number]['field'] | 'addLabel' | 'removeLabel'
const maxBulkTargets = 3500
const displayDate = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' })
export const shownDate = (date: string) => date ? displayDate.format(new Date(date + 'T00:00:00Z')) : ''
export const needsReply = (guest: Guest) => guest.rsvp === 'Pending' || guest.rsvp === 'Maybe'
export const rsvpGroupKey = (guest: Guest) => guest.household.trim()
  ? 'household:' + guest.household.trim().toLowerCase()
  : 'guest:' + guest.id
export const guestLabels = (guests: Guest[]) =>
  [...new Set(guests.flatMap(guest => guest.labels ?? []))].sort((a, b) => a.localeCompare(b))

function GuestLabels({ guest, onFilter }: { guest: Guest; onFilter: (label: string) => void }) {
  if (!guest.labels?.length) return null
  return <ul className="guest-labels" aria-label={'Labels for ' + guest.name}>
    {guest.labels.map(label => <li key={label}>
      <button className="focus-secondary" type="button" onClick={() => onFilter(label)} aria-label={'Filter by label: ' + label}>{label}</button>
    </li>)}
  </ul>
}

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

export function WorkspaceGuests({ wedding, initialSearch = '', awaitingReply = false, workbookView = false }: {
  wedding: { id: string; name: string; timeZone: string }
  initialSearch?: string; awaitingReply?: boolean; workbookView?: boolean
}) {
  const { preview, fetchWorkspace } = useWorkspaceData()
  const [guests, setGuests] = useState<Guest[]>()
  const [editing, setEditing] = useState<Guest | 'new'>()
  const [filters, setFilters] = useState<GuestRules>(awaitingReply ? { rsvp: { include: ['Pending', 'Maybe'] } } : {})
  const [search, setSearch] = useState(initialSearch)
  const [sortBy, setSortBy] = useState('arrival')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [reviewSelected, setReviewSelected] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [bulkField, setBulkField] = useState<BulkField>('side')
  const [bulkValue, setBulkValue] = useState('')
  const [blanksOnly, setBlanksOnly] = useState(false)
  const url = '/api/workspace/weddings/' + wedding.id + '/guests'
  const today = localDay(wedding.timeZone)
  const current = editing === 'new' ? undefined : editing
  const { heading, returnTarget, fallback } = useEditorFocus(editing ?? bulkOpen, busy)

  async function load(signal?: AbortSignal) {
    const response = await fetchWorkspace(url, { signal })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error)
    setGuests(body)
  }

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [url, fetchWorkspace])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const fields = Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value).trim()]))
      const response = await fetchWorkspace(current ? url + '/' + current.id : url, {
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
  const labels = guestLabels(guests ?? [])
  const optionLabel = (field: GuestFilterOptions['field'], value: string) => {
    if (!value) return 'Not recorded'
    if (field === 'arrivalDate') return value === today ? 'Today · ' + shownDate(today) : shownDate(value)
    return value
  }
  const filterOptions: GuestFilterOptions[] = [...guestFilters, { field: 'labels', label: 'Guest labels', options: [] } as const]
    .map(({ field, label, options }) => {
      const observed = field === 'labels' ? labels : (guests ?? []).map(guest => guest[field]).filter(Boolean)
      const existing = filters[field]
      const values = [...new Set([...options, ...observed, ...existing?.include ?? [], ...existing?.exclude ?? []].filter(Boolean))].sort()
      if (field === 'arrivalDate' && !values.includes(today)) values.unshift(today)
      return { field, label, options: [...values, ''].map(value => ({ value, label: optionLabel(field, value) })) }
    })
  const searched = (guests ?? []).filter(guest => !query ||
    [guest.name, guest.household, guest.workbookId].some(value => value.toLowerCase().includes(query)))
  const filtered = searched.filter(guest => matchesGuestRules(guest, filters, filterOptions))
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'household') return Number(!a.household) - Number(!b.household) ||
        a.household.localeCompare(b.household) || a.name.localeCompare(b.name)
      return (a.arrivalDate || '9999').localeCompare(b.arrivalDate || '9999') ||
        (a.arrivalTime || '99').localeCompare(b.arrivalTime || '99') || a.name.localeCompare(b.name)
    })
  const modes: FilterMode[] = ['include', 'exclude']
  const activeRules = filterOptions.flatMap(({ field, label }) => modes.flatMap(mode => {
    const values = filters[field]?.[mode]
    if (!values?.length) return []
    return [{ field, mode, text: (mode === 'exclude' ? 'Exclude ' : '') + label + ': ' +
      values.map(value => optionLabel(field, value)).join(' or ') }]
  }))
  const filterLabel = [query ? 'Search: ' + search.trim() : '', ...activeRules.map(rule => rule.text)].filter(Boolean).join(' · ')
  const selection = (guests ?? []).filter(guest => selected.has(guest.id))
  const outsideFilter = selection.length - filtered.filter(guest => selected.has(guest.id)).length
  const labelChange = bulkField === 'addLabel' || bulkField === 'removeLabel'
  const value = labelChange ? bulkValue.trim().replace(/\s+/g, ' ') : bulkValue
  const changedCount = selection.filter(guest => {
    if (bulkField === 'addLabel' || bulkField === 'removeLabel') {
      const hasLabel = guest.labels?.some(label => label.toLowerCase() === value.toLowerCase()) ?? false
      return bulkField === 'addLabel' ? !hasLabel : hasLabel
    }
    return guest[bulkField] !== value && (!blanksOnly || !guest[bulkField])
  }).length
  const fieldOptions = bulkFields.find(choice => choice.field === bulkField)
  const canApply = !!value && !!changedCount && selection.length <= maxBulkTargets
  const changeDescription = bulkField === 'addLabel' ? 'Add ' + value : bulkField === 'removeLabel' ? 'Remove ' + value
    : 'Set ' + fieldOptions?.label.toLowerCase() + ' to ' + value
  const displayed = reviewSelected ? selection : filtered

  function filterByLabel(label: string) {
    setFilters(current => setGuestRule(current, 'labels', 'include', [label]))
  }

  function closeBulk() {
    setBulkOpen(false)
    setReviewSelected(false)
    setSelected(new Set())
    setBulkField('side')
    setBulkValue('')
    setBlanksOnly(false)
  }

  async function applyBulk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (preview || busy || !canApply) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await fetchWorkspace(url + '/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: bulkField, value, blanksOnly: !labelChange && blanksOnly,
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
    return <label className="guest-select"><input type="checkbox" aria-label={'Select ' + guest.name}
      checked={selected.has(guest.id)} disabled={busy}
      onChange={event => {
        const checked = event.target.checked
        setSelected(previous => {
          const next = new Set(previous)
          if (checked) next.add(guest.id)
          else next.delete(guest.id)
          return next
        })
      }} /></label>
  }

  function editGuest(guest: Guest | 'new', trigger: HTMLButtonElement) {
    returnTarget.current = trigger
    closeBulk()
    setEditing(guest); setError(''); setMessage('')
  }

  return <section className="focus-card">
    <div className="focus-heading"><h2 className="workspace-section-title" ref={fallback} tabIndex={-1}>Guest List</h2><div className="focus-actions">
      <button disabled={busy || preview} onClick={event => editGuest('new', event.currentTarget)}>Add guest</button>
      {!!guests?.length && <button className="focus-secondary" disabled={busy || bulkOpen} onClick={event => {
        returnTarget.current = event.currentTarget
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
    {editing && <form className="focus-card" key={current?.id ?? 'new'} onSubmit={event => void save(event)}>
      <h3 ref={heading} tabIndex={-1}>{current ? 'Edit ' + current.name : 'Add guest'}</h3>
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
    <GuestFilters fields={filterOptions} rules={filters} sort={sortBy} disabled={!guests}
      search={<VoiceField label="Find a guest" value={search} onValueChange={setSearch} search />}
      onRuleChange={(field, mode, values) => setFilters(current => setGuestRule(current, field, mode, values))}
      onSortChange={setSortBy}>
      <VoiceNotice />
      <div className="filter-summary">
        <p role="status">{guests ? filtered.length + ' of ' + guests.length + ' guests' : error ? 'Guest list unavailable' : 'Loading guests…'}</p>
        {filterLabel && <ul className="filter-chips" aria-label="Active filters">
          {query && <li><button type="button" className="focus-secondary" aria-label={'Remove search: ' + search.trim()}
            onClick={() => setSearch('')}>Search: {search.trim()} <span aria-hidden="true">×</span></button></li>}
          {activeRules.map(({ field, mode, text }) => <li key={field + mode}>
            <button type="button" className="focus-secondary" data-mode={mode} aria-label={'Remove filter: ' + text}
              onClick={() => setFilters(current => setGuestRule(current, field, mode, []))}>{text} <span aria-hidden="true">×</span></button>
          </li>)}
        </ul>}
        <button className="focus-secondary" disabled={!filterLabel}
          onClick={() => { setSearch(''); setFilters({}) }}>Clear filters</button>
      </div>
    </GuestFilters>
    {bulkOpen && <form className="focus-card" onSubmit={event => void applyBulk(event)}>
      <h3 ref={heading} tabIndex={-1}>Bulk edit guests</h3>
      <fieldset className="workspace-fields" disabled={busy}>
        <div className="focus-actions">
          <button type="button" className="focus-secondary" disabled={!filtered.length}
            onClick={() => setSelected(previous => new Set([...previous, ...filtered.map(guest => guest.id)]))}>
            {filtered.length ? 'Select all ' + filtered.length + (filterLabel ? ' matching' : '') +
              (filtered.length === 1 ? ' guest' : ' guests') : 'No guests to select'}
          </button>
          <button type="button" className="focus-secondary" disabled={!selection.length} onClick={() => setSelected(new Set())}>Clear selection</button>
        </div>
        <div className="focus-form-grid">
          <label className="focus-field">Change to make<select value={bulkField} onChange={event => {
            setBulkField(event.target.value as BulkField)
            setBulkValue('')
          }}>{bulkFields.map(choice => <option key={choice.field} value={choice.field}>{choice.label}</option>)}
            <option value="addLabel">Add a guest label</option>
            <option value="removeLabel">Remove a guest label</option>
          </select></label>
          {bulkField === 'addLabel' ? <label className="focus-field">Label name
            <input value={bulkValue} onChange={event => setBulkValue(event.target.value)} required maxLength={60}
              placeholder="e.g. Grand Palace Hotel" list="guest-label-options" />
            <datalist id="guest-label-options">{labels.map(label => <option key={label} value={label} />)}</datalist>
          </label> : <label className="focus-field">{labelChange ? 'Label to remove' : 'New value'}
            <select value={bulkValue} required onChange={event => setBulkValue(event.target.value)}>
              <option value="">{labelChange ? 'Choose a label' : 'Choose a value'}</option>
              {(labelChange ? labels : fieldOptions?.options ?? []).map(option => <option key={option}>{option}</option>)}
            </select>
          </label>}
        </div>
        {labelChange ? <p className="focus-note">Use labels to group guests across households. A guest can have several labels.</p>
          : <label><input type="checkbox" checked={blanksOnly} onChange={event => setBlanksOnly(event.target.checked)} /> Fill blanks only</label>}
        {value && <p role="status">{changedCount ? `${changeDescription} for ${changedCount} ${changedCount === 1 ? 'guest' : 'guests'}.`
          : 'No selected guests need this change.'}</p>}
        {selection.length > maxBulkTargets && <p>Select up to {maxBulkTargets.toLocaleString('en-IN')} guests per edit.</p>}
        <div className="focus-actions">
          <button disabled={preview || !canApply}>
            {preview ? 'Saving is disabled in the sample' : busy ? 'Applying…'
              : changedCount ? 'Update ' + changedCount + (changedCount === 1 ? ' guest' : ' guests') : 'Apply bulk edit'}
          </button>
          <button type="button" className="focus-secondary" onClick={closeBulk}>Cancel</button>
        </div>
      </fieldset>
    </form>}
    {bulkOpen && <div className="guest-selection-bar">
      <span role="status"><strong>{selection.length} selected</strong>
        {outsideFilter > 0 && ' · ' + outsideFilter + ' outside filters'}</span>
      <button type="button" className="focus-secondary"
        disabled={busy || (!reviewSelected && !selection.length)} onClick={() => setReviewSelected(review => !review)}>
        {reviewSelected ? 'Back to filtered list' : 'Review selected'}
      </button>
    </div>}
    {guests && displayed.length === 0 && <p>{reviewSelected ? 'No guests selected.'
      : guests.length ? 'No guests match these filters.' : 'No guests yet.'}</p>}
    {workbookView ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Guest List table">
      <table className="imported-records workspace-sheet"><thead><tr>{['Guest', 'Household', 'Side', 'RSVP', 'Arrival date', 'Time', 'Mode', 'Stay required', 'Transport', 'Linked records', 'Edit']
        .map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{displayed.map(guest => <tr key={guest.id}>
          <th scope="row">{bulkOpen && guestCheckbox(guest)} {guest.name}<GuestLabels guest={guest} onFilter={filterByLabel} /></th>
          {[guest.household, guest.side, guest.rsvp, shownDate(guest.arrivalDate), guest.arrivalTime, guest.arrivalMode, guest.stayRequired, guest.transportRequired]
            .map((value, index) => <td key={index}>{value}</td>)}
          <td><GuestLinks guest={guest} /></td>
          <td><button className="focus-secondary" aria-label={'Edit ' + guest.name} disabled={busy || preview}
            onClick={event => editGuest(guest, event.currentTarget)}>Edit</button></td>
        </tr>)}</tbody>
      </table>
    </div> : <div className="focus-record-grid">{displayed.map(guest => <article className="focus-card guest-card" key={guest.id}>
      <div className="guest-card-heading"><h3>{guest.name}</h3>{guest.rsvp && <span className="focus-chip" data-rsvp={guest.rsvp}>{guest.rsvp}</span>}
        {bulkOpen && guestCheckbox(guest)}</div>
      {(guest.household || guest.side) && <p>{[guest.household, guest.side].filter(Boolean).join(' · ')}</p>}
      <GuestLabels guest={guest} onFilter={filterByLabel} />
      <p>{[shownDate(guest.arrivalDate), guest.arrivalTime, guest.arrivalMode].filter(Boolean).join(' · ') || 'Arrival not recorded'}</p>
      <p>Stay required: {guest.stayRequired || 'Not recorded'} · Transport: {guest.transportRequired || 'Not recorded'}</p>
      <GuestLinks guest={guest} />
      <button className="focus-secondary guest-edit" aria-label={'Edit ' + guest.name} disabled={busy || preview}
        onClick={event => editGuest(guest, event.currentTarget)}>Edit guest</button>
    </article>)}</div>}
  </section>
}

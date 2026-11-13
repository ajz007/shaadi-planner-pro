import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Guest } from './WorkspaceGuests'

export type FilterMode = 'include' | 'exclude'
export type FilterField = 'side' | 'rsvp' | 'arrivalMode' | 'transportRequired' | 'stayRequired' | 'household' | 'arrivalDate' | 'labels'
export type GuestRules = Partial<Record<FilterField, Partial<Record<FilterMode, string[]>>>>
export type GuestFilterOptions = { field: FilterField; label: string; options: { value: string; label: string }[] }

const modes = ['include', 'exclude'] as const
const awaitingReply = ['Pending', 'Maybe']

export function matchesGuestRules(guest: Guest, rules: GuestRules, fields: GuestFilterOptions[]) {
  return fields.every(({ field }) => {
    const rule = rules[field]
    if (!rule) return true
    const matches = (value: string) => field === 'labels'
      ? value === '' ? !guest.labels?.length : !!guest.labels?.includes(value)
      : guest[field] === value
    return (!rule.include?.length || rule.include.some(matches)) && !rule.exclude?.some(matches)
  })
}

export function setGuestRule(rules: GuestRules, field: FilterField, mode: FilterMode, values: string[]): GuestRules {
  const other = mode === 'include' ? 'exclude' : 'include'
  return {
    ...rules,
    [field]: { [mode]: values, [other]: (rules[field]?.[other] ?? []).filter(value => !values.includes(value)) },
  }
}

export function GuestFilters({ fields, rules, sort, onRuleChange, onSortChange, disabled, search, children }: {
  fields: GuestFilterOptions[]
  rules: GuestRules
  sort: string
  onRuleChange: (field: FilterField, mode: FilterMode, values: string[]) => void
  onSortChange: (sort: string) => void
  disabled: boolean
  search: ReactNode
  children: ReactNode
}) {
  const advancedToggle = useRef<HTMLButtonElement>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const activeCount = fields.reduce((count, { field }) => count + modes.filter(mode => rules[field]?.[mode]?.length).length, 0)
  const openClass = filtersOpen ? ' is-open' : ''

  return <div className="focus-filters guest-filters">
    <div className="guest-search">{search}</div>
    <button type="button" className="focus-secondary guest-filter-toggle" aria-controls="guest-filter-fields guest-advanced-filters"
      aria-expanded={filtersOpen} disabled={disabled} onClick={() => setFiltersOpen(open => !open)}>
      Filters{activeCount > 0 && ' (' + activeCount + ')'}
    </button>
    <div id="guest-filter-fields" className={'guest-filter-fields' + openClass}>
      <div className="guest-filter-quick">
        <label className="focus-field">Sort by<select value={sort} disabled={disabled} onChange={event => onSortChange(event.target.value)}>
          <option value="arrival">Arrival date and time</option><option value="name">Guest name</option><option value="household">Household</option>
        </select></label>
        {fields.map(({ field, label, options }) => {
          const included = rules[field]?.include ?? []
          const awaiting = field === 'rsvp' && included.length === awaitingReply.length && awaitingReply.every(value => included.includes(value))
          const selection = awaiting ? 'awaiting' : included.length > 1 ? 'multiple' : included.length ? 'value:' + included[0] : ''
          return <label className="focus-field" key={field}>{label}<select value={selection} disabled={disabled} onChange={event => {
            const value = event.target.value
            onRuleChange(field, 'include', value === 'awaiting' ? awaitingReply : value ? [value.slice('value:'.length)] : [])
          }}>
            <option value="">{rules[field]?.exclude?.length ? 'Any except exclusions' : 'Any'}</option>
            {field === 'rsvp' && <option value="awaiting">Awaiting reply (Pending or Maybe)</option>}
            {selection === 'multiple' && <option value="multiple" disabled>{included.length} values included</option>}
            {options.map(option => <option key={option.value} value={'value:' + option.value}>{option.label}</option>)}
          </select></label>
        })}
      </div>
      <button ref={advancedToggle} type="button" className="focus-secondary guest-advanced-toggle" aria-controls="guest-advanced-filters"
        aria-expanded={advancedOpen} disabled={disabled} onClick={() => setAdvancedOpen(open => !open)}>
        {advancedOpen ? 'Hide advanced filters' : 'Advanced filters'} <span aria-hidden="true">{advancedOpen ? '▴' : '▾'}</span>
      </button>
    </div>
    {children}
    <section id="guest-advanced-filters" className={'guest-advanced-filters' + openClass} aria-label="Advanced filters" hidden={!advancedOpen}>
      {advancedOpen && <>
        <p className="focus-note">Select multiple values across categories. Guests must match at least one included value per category and are hidden if they match any excluded value.</p>
        <div className="guest-advanced-grid">
          {fields.map(field => <GuestFilterGroup key={field.field} {...field} rule={rules[field.field]} onRuleChange={onRuleChange} />)}
        </div>
        <button type="button" className="focus-secondary" onClick={() => {
          setAdvancedOpen(false)
          advancedToggle.current?.focus()
        }}>Done filtering</button>
      </>}
    </section>
  </div>
}

function GuestFilterGroup({ field, label, options, rule, onRuleChange }: GuestFilterOptions & {
  rule: GuestRules[FilterField]
  onRuleChange: (field: FilterField, mode: FilterMode, values: string[]) => void
}) {
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()
  const visible = options.filter(option => option.label.toLowerCase().includes(query))
  return <section className="guest-filter-group" aria-labelledby={'guest-filter-' + field}>
    <h3 id={'guest-filter-' + field}>{label}</h3>
    {options.length > 10 && <input className="guest-filter-value-search" type="search" aria-label={'Find a value in ' + label}
      placeholder="Find a value" value={search} onChange={event => setSearch(event.target.value)} />}
    {visible.length ? <div className="guest-filter-values">
      <table className="guest-filter-options" aria-label={label}>
        <thead><tr><th scope="col">Value</th><th scope="col">Include</th><th scope="col">Exclude</th></tr></thead>
        <tbody>{visible.map(option => <tr key={option.value}>
          <th scope="row">{option.label}</th>
          {modes.map(mode => {
            const selected = rule?.[mode] ?? []
            return <td key={mode}><label className="guest-filter-checkbox">
              <input type="checkbox" aria-label={(mode === 'include' ? 'Include ' : 'Exclude ') + label + ': ' + option.label}
                checked={selected.includes(option.value)} onChange={event => onRuleChange(field, mode,
                  event.target.checked ? [...selected, option.value] : selected.filter(value => value !== option.value))} />
            </label></td>
          })}
        </tr>)}</tbody>
      </table>
    </div> : <p className="focus-note">No matching values.</p>}
  </section>
}

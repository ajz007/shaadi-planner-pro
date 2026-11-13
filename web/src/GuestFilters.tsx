import { useRef, useState } from 'react'
import type { Guest } from './WorkspaceGuests'

export type FilterMode = 'include' | 'exclude'
export type FilterField = 'side' | 'rsvp' | 'arrivalMode' | 'transportRequired' | 'stayRequired' | 'household' | 'arrivalDate' | 'labels'
export type GuestRules = Partial<Record<FilterField, Partial<Record<FilterMode, string[]>>>>
export type GuestFilterOptions = { field: FilterField; label: string; options: { value: string; label: string }[] }

const modes = ['include', 'exclude'] as const

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

export function GuestFilters({ fields, rules, sort, onApply, countMatches, disabled }: {
  fields: GuestFilterOptions[]
  rules: GuestRules
  sort: string
  onApply: (rules: GuestRules, sort: string) => void
  countMatches: (rules: GuestRules) => number
  disabled: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState<GuestRules>({})
  const [draftSort, setDraftSort] = useState(sort)
  const [expanded, setExpanded] = useState<FilterField | ''>('')
  const [valueSearch, setValueSearch] = useState('')
  const activeCount = fields.reduce((count, { field }) => count + modes.filter(mode => rules[field]?.[mode]?.length).length, 0)
  const count = isOpen ? countMatches(draft) : 0

  function open() {
    setDraft(rules)
    setDraftSort(sort)
    setValueSearch('')
    setIsOpen(true)
    setExpanded(fields.find(({ field }) => modes.some(mode => rules[field]?.[mode]?.length))?.field ?? '')
    dialog.current?.showModal()
  }

  return <>
    <button ref={trigger} type="button" className="focus-secondary" aria-haspopup="dialog" disabled={disabled} onClick={open}>
      Filters{activeCount > 0 && ' (' + activeCount + ')'}
    </button>
    <dialog ref={dialog} className="guest-filter-dialog" aria-labelledby="guest-filter-title" onClose={() => {
      setIsOpen(false)
      trigger.current?.focus()
    }}>
      <form onSubmit={event => {
        event.preventDefault()
        onApply(draft, draftSort)
        dialog.current?.close()
      }}>
        <div className="guest-filter-body">
          <h2 id="guest-filter-title">Filter guests</h2>
          <p className="focus-note">Include any selected value in each filter. A guest must match every Include filter and is removed if they match any Exclude value.</p>
          <label className="focus-field">Sort by<select value={draftSort} onChange={event => setDraftSort(event.target.value)}>
            <option value="arrival">Arrival date and time</option><option value="name">Guest name</option><option value="household">Household</option>
          </select></label>
          {fields.map(({ field, label, options }) => {
            const rule = draft[field]
            const counts = modes.flatMap(mode => rule?.[mode]?.length ? [rule[mode].length + ' ' + mode + 'd'] : [])
            return <div className="guest-filter-group" key={field}>
              <button type="button" className="focus-secondary guest-filter-group-button" aria-expanded={expanded === field}
                aria-controls={'guest-filter-' + field} onClick={() => {
                  setValueSearch('')
                  setExpanded(current => current === field ? '' : field)
                }}>
                <span>{label}</span><span>{counts.join(' · ')} <span aria-hidden="true">{expanded === field ? '▴' : '▾'}</span></span>
              </button>
              <div id={'guest-filter-' + field} hidden={expanded !== field}>
                {expanded === field && <>
                {options.length > 10 && <label className="focus-field">Find a value
                  <input type="search" value={valueSearch} onChange={event => setValueSearch(event.target.value)} />
                </label>}
                <table className="guest-filter-options" aria-label={label}>
                  <thead><tr><th scope="col">Value</th><th scope="col">Include</th><th scope="col">Exclude</th></tr></thead>
                  <tbody>{options.filter(option => option.label.toLowerCase().includes(valueSearch.trim().toLowerCase())).map(option => <tr key={option.value}>
                    <th scope="row">{option.label}</th>
                    {modes.map(mode => <td key={mode}><label className="guest-filter-checkbox">
                      <input type="checkbox" aria-label={(mode === 'include' ? 'Include ' : 'Exclude ') + label + ': ' + option.label}
                        checked={rule?.[mode]?.includes(option.value) ?? false}
                        onChange={event => {
                          const checked = event.target.checked
                          setDraft(current => {
                            const selected = current[field]?.[mode] ?? []
                            return setGuestRule(current, field, mode, checked ? [...selected, option.value] : selected.filter(value => value !== option.value))
                          })
                        }} />
                    </label></td>)}
                  </tr>)}</tbody>
                </table>
                {valueSearch && !options.some(option => option.label.toLowerCase().includes(valueSearch.trim().toLowerCase())) &&
                  <p className="focus-note">No matching values.</p>}
                </>}
              </div>
            </div>
          })}
        </div>
        <div className="guest-filter-footer">
          <button type="button" className="focus-secondary" onClick={() => dialog.current?.close()}>Cancel</button>
          <button type="submit">Show {count} {count === 1 ? 'guest' : 'guests'}</button>
        </div>
      </form>
    </dialog>
  </>
}

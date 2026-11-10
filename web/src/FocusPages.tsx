import { useEffect, useRef, useState } from 'react'
import { VoiceField, VoiceNotice } from './VoiceField'
import { usePlan } from './PlanData'
import { AddPlanEntry, PrintSection } from './PlanActions'

export const focusGroups = [
  { name: 'People', pages: ['Guest List', 'RSVP Follow-up', 'Family Responsibilities', 'Emergency Contacts'] },
  { name: 'Schedule', pages: ['Schedule Board', 'Functions & Events', 'Wedding Timeline', 'Accommodation', 'Transportation'] },
  { name: 'Money', pages: ['Budget vs Actual', 'Vendor Comparison', 'Vendor Payments'] },
  { name: 'Details', pages: ['Outfits & Jewellery', 'Gifts', 'Settings'] },
]

const keyFor = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-$/, '')
export const focusLink = (name: string) => '#focus/' + keyFor(name)
export const focusSection = (key: string) => focusGroups.flatMap(group => group.pages).find(name => keyFor(name) === key)

const guestFilters = [
  { column: 3, label: 'Wedding side' },
  { column: 11, label: 'Arrival date' },
  { column: 10, label: 'Transport required' },
  { column: 13, label: 'Arrival mode' },
]

type PageLayout = {
  intro: string
  title: number[]
  glance: number[]
  status?: number
  order?: number[]
  summary?: (rows: string[][]) => { label: string; value: string | number }[]
}

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const count = (rows: string[][], column: number, value: string) => rows.filter(row => row[column] === value).length
const sum = (rows: string[][], column: number) => rows.reduce((total, row) => total + Number(row[column] || 0), 0)
const date = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const weddingDateFormat = new Intl.DateTimeFormat('en', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Kolkata' })

const layouts: Record<string, PageLayout> = {
  'Guest List': { intro: 'Find a person or household and see who still needs an invitation or reply.', title: [1], glance: [2, 3, 8], status: 7, summary: rows => [
    { label: 'Guests', value: rows.length }, { label: 'Confirmed', value: count(rows, 7, 'Confirmed') },
    { label: 'Awaiting reply', value: count(rows, 7, 'Pending') + count(rows, 7, 'Maybe') },
  ] },
  'RSVP Follow-up': { intro: 'See who to contact, the next step, and who in the family owns it.', title: [1], glance: [7, 4, 5], status: 3, order: [4], summary: rows => [
    { label: 'Follow-ups', value: rows.length }, { label: 'Pending', value: count(rows, 3, 'Pending') },
  ] },
  'Emergency Contacts': { intro: 'Find the person responsible for a service or venue quickly.', title: [1], glance: [0, 3, 6], summary: rows => [{ label: 'Contacts', value: rows.length }] },
  'Functions & Events': { intro: 'See what happens when, where it takes place, and who owns it.', title: [1], glance: [2, 3, 4, 7], status: 8, order: [2, 3], summary: rows => [
    { label: 'Functions', value: rows.length }, { label: 'Confirmed', value: count(rows, 8, 'Confirmed') },
  ] },
  'Wedding Timeline': { intro: 'Walk through the run sheet in order and check who is responsible at each handoff.', title: [3], glance: [0, 1, 2, 4], status: 6, order: [0, 1] },
  Accommodation: { intro: 'See where each household is staying and check the rooms still awaiting confirmation.', title: [0, 1], glance: [7, 9, 10, 11], status: 13, summary: rows => [
    { label: 'Rooms assigned', value: rows.length }, { label: 'Guests assigned', value: sum(rows, 9) },
    { label: 'Pending rooms', value: count(rows, 13, 'Pending') },
  ] },
  Transportation: { intro: 'Check each pickup route, passenger count, and whether its driver is confirmed.', title: [2, 3], glance: [0, 1, 8, 10, 16], status: 15, order: [0, 1], summary: rows => [
    { label: 'Trips', value: rows.length }, { label: 'Passenger places', value: sum(rows, 10) },
    { label: 'Drivers to confirm', value: count(rows, 16, 'No') },
  ] },
  'Budget vs Actual': { intro: 'See what each category was allocated, what has been paid, and what remains.', title: [0], glance: [1, 2, 3, 4], status: 6, summary: rows => [
    { label: 'Category budget', value: currency.format(sum(rows, 1)) }, { label: 'Paid', value: currency.format(sum(rows, 2)) },
    { label: 'Remaining', value: currency.format(sum(rows, 1) - sum(rows, 2)) },
  ] },
  'Vendor Comparison': { intro: 'Compare quotes and negotiated prices, then open the details to check what each vendor includes.', title: [1], glance: [0, 2, 8, 6], status: 7 },
  'Vendor Payments': { intro: 'Review balances by due date and see who is handling each vendor.', title: [1], glance: [0, 5, 6, 7], status: 2, order: [6], summary: rows => [
    { label: 'Contracted', value: currency.format(sum(rows, 3)) }, { label: 'Paid to vendors', value: currency.format(sum(rows, 4)) },
    { label: 'Outstanding', value: currency.format(sum(rows, 5)) },
  ] },
  'Outfits & Jewellery': { intro: 'Check fittings, packing and accessories by person and function.', title: [2], glance: [0, 1, 6, 8], status: 5, order: [6] },
  Gifts: { intro: 'See what to buy, give, or record, and who is responsible.', title: [2], glance: [0, 1, 3, 6], status: 7, summary: rows => [
    { label: 'To buy or give', value: currency.format(sum(rows.filter(row => row[0] !== 'Received'), 5)) },
    { label: 'Received', value: currency.format(sum(rows.filter(row => row[0] === 'Received'), 5)) },
  ] },
}

function format(value: string, heading: string, label: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return date.format(new Date(value + 'T00:00:00Z'))
  if (value && (/Budget|^(Actual Paid|Paid|Quote|Negotiated Price|Contract Value|Unit Cost)$|^(Balance|Total) \(Auto\)$/.test(heading)
    || (heading === 'Value' && label === 'Overall Budget')) && Number.isFinite(Number(value))) return currency.format(Number(value))
  return value
}

function chronological(value: string) {
  const time = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value)
  if (!time) return value || '9999'
  const hours = Number(time[1]) % 12 + (time[3].toUpperCase() === 'PM' ? 12 : 0)
  return String(hours).padStart(2, '0') + ':' + time[2]
}

export function FocusNavigation({ section, hrefFor = focusLink, canSee, home = '#focus' }: {
  section?: string; hrefFor?: (name: string) => string; canSee?: (name: string) => boolean; home?: string
}) {
  const nav = useRef<HTMLElement>(null)
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      nav.current?.querySelectorAll('details[open]').forEach(menu => {
        if (event.target instanceof Node && !menu.contains(event.target)) menu.removeAttribute('open')
      })
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      const menu = nav.current?.querySelector('details[open]')
      if (!menu) return
      menu.removeAttribute('open')
      menu.querySelector('summary')?.focus()
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', escape)
    }
  }, [])
  const groups = focusGroups.map(group => ({ ...group, pages: group.pages.filter(name => !canSee || canSee(name)) }))
    .filter(group => group.pages.length)
  return <nav ref={nav} className="focus-nav" aria-label={canSee ? 'Wedding planning pages' : 'Alternate planning pages'}>
    <a href={home} aria-current={section ? undefined : 'page'}>Overview</a>
    {groups.map(group => <details key={group.name}>
      <summary onClick={event => {
        const current = event.currentTarget.parentElement
        nav.current?.querySelectorAll('details[open]').forEach(menu => {
          if (menu !== current) menu.removeAttribute('open')
        })
      }}>{group.name}</summary>
      <div className="focus-nav-links">{group.pages.map(name => <a key={name} href={hrefFor(name)} aria-current={name === section ? 'page' : undefined}
        onClick={event => event.currentTarget.closest('details')?.removeAttribute('open')}>{name}</a>)}</div>
    </details>)}
  </nav>
}

export function FocusPage({ section, initialFilter }: { section: string; initialFilter: string }) {
  const table = usePlan().tables.find(table => table.name === section)!
  return <PlanningSection section={section} table={table} initialFilter={initialFilter} />
}

export function PlanningSection({ section, table, initialFilter = '', weddingName, hrefFor = focusLink, workbookView = false }: {
  section: string; table: { columns: string[]; rows: string[][] }; initialFilter?: string
  weddingName?: string; hrefFor?: (name: string) => string; workbookView?: boolean
}) {
  const [search, setSearch] = useState(initialFilter)
  const [status, setStatus] = useState('')
  const [guestCriteria, setGuestCriteria] = useState<Record<number, string>>({})

  if (section === 'Settings') return <section className="focus-card">
    <h2>Wedding details</h2>
    <PrintSection title={section} weddingName={weddingName} columns={table.columns} records={table.rows.filter(([label]) => label !== 'Days Until Wedding').map(([label, value]) => [label, format(value, 'Value', label)])} />
    <dl className="focus-record-details">{table.rows.filter(([label]) => label !== 'Days Until Wedding').map(([label, value]) =>
      <div key={label}><dt>{label}</dt><dd>{format(value, 'Value', label)}</dd></div>)}</dl>
  </section>

  const layout = layouts[section]
  const statusColumn = layout.status
  const statuses = statusColumn === undefined ? [] : [...new Set(table.rows.map(row => row[statusColumn]).filter(Boolean))]
  const query = search.trim().toLowerCase()
  const records = table.rows.filter(row => (!query || row.some(cell => cell.toLowerCase().includes(query))) &&
    (!status || (statusColumn !== undefined && row[statusColumn] === status)) &&
    (section !== 'Guest List' || guestFilters.every(({ column }) => !guestCriteria[column] || (row[column] || 'missing') === guestCriteria[column])))
  if (layout.order) records.sort((a, b) => {
    for (const column of layout.order!) {
      const order = chronological(a[column]).localeCompare(chronological(b[column]))
      if (order) return order
    }
    return 0
  })

  const printColumns = section === 'Guest List' ? [1, 2, 3, 11, 12, 13, 10, 7] : table.columns.map((_, index) => index)
  const printFilters = [query ? 'Search: ' + search.trim() : '', status ? 'Status: ' + status : '',
    ...guestFilters.flatMap(({ column, label }) => guestCriteria[column]
      ? [label + ': ' + (guestCriteria[column] === 'missing' ? 'Not recorded' : format(guestCriteria[column], label, ''))] : [])]
    .filter(Boolean).join(' · ')

  return <>
    <p className="focus-page-intro">{layout.intro}</p>
    <div className="focus-actions">
      {!weddingName && ['Functions & Events', 'Wedding Timeline', 'Vendor Comparison', 'Vendor Payments'].includes(section) && <AddPlanEntry section={section} />}
      <PrintSection title={section} weddingName={weddingName} columns={printColumns.map(i => table.columns[i])}
        records={records.map(row => printColumns.map(i => format(row[i], table.columns[i], row[0])))} filters={printFilters} />
    </div>
    {(section === 'Functions & Events' || section === 'Wedding Timeline') &&
      <p><a className="focus-secondary" href={hrefFor('Schedule Board')}>View overlaps and required people →</a></p>}
    {layout.summary && <dl className="focus-summary">{layout.summary(table.rows).map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>}
    <div className="focus-card focus-filters">
      <div><VoiceField label="Find an entry" value={search} onValueChange={setSearch} search /><VoiceNotice /></div>
      {statuses.length > 0 && <label className="focus-field">Status<select value={status} onChange={event => setStatus(event.target.value)}>
        <option value="">All statuses</option>{statuses.map(value => <option key={value}>{value}</option>)}
      </select></label>}
      {section === 'Guest List' && guestFilters.map(({ column, label }) => {
        const options = [...new Set(table.rows.map(row => row[column]).filter(Boolean))].sort()
        const parts = Object.fromEntries(weddingDateFormat.formatToParts(new Date()).map(part => [part.type, part.value]))
        const today = [parts.year, parts.month, parts.day].join('-')
        return <label className="focus-field" key={column}>{label}<select aria-label={label} value={guestCriteria[column] ?? ''}
          onChange={event => setGuestCriteria(current => ({ ...current, [column]: event.target.value }))}>
          <option value="">Any</option>
          {column === 11 && <option value={today}>Today · {format(today, label, '')}</option>}
          {options.filter(value => column !== 11 || value !== today).map(value => <option key={value} value={value}>{format(value, label, '')}</option>)}
          {table.rows.some(row => !row[column]) && <option value="missing">Not recorded</option>}
        </select></label>
      })}
      {section === 'Guest List' && (search || status || Object.values(guestCriteria).some(Boolean)) &&
        <button className="focus-secondary" onClick={() => { setSearch(''); setStatus(''); setGuestCriteria({}) }}>Clear filters</button>}
      <span className="focus-note" role="status">{records.length} of {table.rows.length} entries</span>
    </div>
    {records.length === 0 && <p className="focus-note">No entries match. Try another search or status.</p>}
    {workbookView ? <div className="focus-card table-scroll" tabIndex={0} role="region" aria-label={section + ' table'}>
      <table className="imported-records"><thead><tr>{table.columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
        <tbody>{records.map(row => <tr key={table.rows.indexOf(row)}>{table.columns.map((column, i) =>
          <td key={column}>{format(row[i], column, row[0])}</td>)}</tr>)}</tbody>
      </table>
    </div> : <div className="focus-record-grid">{records.map(row => {
      const heading = layout.title.map(i => row[i]).join(section === 'Transportation' ? ' → ' : ' · ')
      const details = table.columns.flatMap((column, i) =>
        !layout.title.includes(i) && !layout.glance.includes(i) && i !== statusColumn && row[i] ? [{ column, i }] : [])
      return <article key={table.rows.indexOf(row)} className="focus-card">
        <div className="focus-heading"><h2>{heading}</h2>{statusColumn !== undefined && row[statusColumn] && <span className="focus-chip">{row[statusColumn]}</span>}</div>
        <dl className="focus-record-details">{layout.glance.filter(i => row[i]).map(i =>
          <div key={i}><dt>{table.columns[i].replace(/ \(auto\)/gi, '')}</dt><dd>{format(row[i], table.columns[i], row[0])}</dd></div>)}</dl>
        {details.length > 0 && <details className="focus-completed"><summary>Details<span className="focus-sr-only"> for {heading}</span></summary>
          <dl className="focus-record-details">{details.map(({ column, i }) => {
            const guest = /^(Primary Guest|Guest [234])$/.test(column) && /^([^|]+) \| /.exec(row[i])
            return <div key={i}><dt>{column.replace(/ \(auto\)/gi, '')}</dt><dd>{guest
              ? <a href={hrefFor('Guest List') + (hrefFor('Guest List').includes('?') ? '&' : '?') + 'guest=' + encodeURIComponent(guest[1].trim())}>{row[i]}</a> : format(row[i], column, row[0])}</dd></div>
          })}</dl>
        </details>}
      </article>
    })}</div>}
  </>
}

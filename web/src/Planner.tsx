import { useEffect, useState } from 'react'
import workbook from './workbook-demo.json'
import { BlankSetup, SetupOptions, WorkbookSetup } from './Onboarding'
import { FocusPlanner } from './FocusPlanner'
import { focusSection } from './FocusPages'
import { Workspace } from './Workspace'
import { WorkspaceDemo } from './WorkspaceDemo'
import { PlanProvider, usePlan } from './PlanData'
import { PrintSection } from './PlanActions'
import './planner.css'

const navigation = [
  { label: 'Wedding plan', sections: ['Dashboard', 'Start Here', 'Settings', 'Functions & Events', 'Wedding Timeline', 'Family Responsibilities'] },
  { label: 'Guests & logistics', sections: ['Guest List', 'RSVP Follow-up', 'Accommodation', 'Transportation'] },
  { label: 'Budget & vendors', sections: ['Budget vs Actual', 'Vendor Comparison', 'Vendor Payments'] },
  { label: 'Final details', sections: ['Outfits & Jewellery', 'Gifts', 'Emergency Contacts'] },
]

const hosted = import.meta.env.MODE === 'hosted'
const packageURL = '/Shaadi-Planner-Pro-English.zip'
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const metrics = workbook.metrics
const slug = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-$/, '')
const sectionLink = (name: string) => '#' + slug(name)
const workspaceSection = (key: string) => key === 'guests' ? 'Guest List' : key === 'import-history' ? 'Import history'
  : key === 'invitations' ? 'Invitations' : key === 'places' ? 'Places' : focusSection(key)

function table(name: string) {
  const result = workbook.tables.find(entry => entry.name === name)
  if (!result) throw new Error('Missing workbook section: ' + name)
  return result
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(value + 'T00:00:00Z'))
}

function formatCell(value: string, heading: string, label: string) {
  if (!value) return '—'
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return displayDate(value)
  const amount = /^(Budget|Actual Paid|Balance \(Auto\)|Quote|Negotiated Price|Contract Value|Paid|Unit Cost|Total \(Auto\))$/.test(heading)
    || (heading === 'Value' && label === 'Overall Budget')
  return amount && Number.isFinite(Number(value)) ? money.format(Number(value)) : value
}

function Dashboard() {
  const paidPercent = Math.round(100 * metrics['Actual Paid'] / metrics['Total Budget'])
  const { rows } = usePlan()
  const vendorBalance = rows('Vendor Payments').reduce((sum, row) => sum + Number(row[5]), 0)
  const events = rows('Functions & Events')
  const tasks = rows('Family Responsibilities').filter(row => row[5] !== 'Done')
  const stats = [
    { label: 'Planned budget', value: money.format(metrics['Total Budget']), note: money.format(metrics['Actual Paid']) + ' paid so far', section: 'Budget vs Actual' },
    { label: 'Guests confirmed', value: `${metrics['Confirmed Guests']} / ${metrics['Total Guests']}`, note: metrics['Pending RSVP'] + ' awaiting a reply', section: 'Guest List' },
    { label: 'Rooms assigned', value: metrics['Rooms Assigned'], note: table('Transportation').rows.length + ' transport entries', section: 'Accommodation' },
    { label: 'Open family tasks', value: tasks.length, note: events.length + ' functions in the plan', section: 'Family Responsibilities' },
  ]
  return <>
    <div className="metric-grid">{stats.map(stat => <a className="metric-card" key={stat.label} href={sectionLink(stat.section)}>
      <span>{stat.label}</span><strong>{stat.value}</strong><small>{stat.note} <span aria-hidden="true">↗</span></small>
    </a>)}</div>
    <div className="dashboard-grid">
      <section className="planner-card">
        <div className="card-heading"><h2>Budget overview</h2><a href={sectionLink('Budget vs Actual')}>View budget →</a></div>
        <p className="paid-value">{money.format(metrics['Actual Paid'])} <small>paid so far</small></p>
        <progress aria-label="Percentage of the planned budget paid" max="100" value={paidPercent} />
        <dl className="figure-list">
          <div><dt>Budget remaining</dt><dd>{money.format(metrics['Budget Remaining'])}</dd></div>
          <div><dt>Vendor balance</dt><dd>{money.format(vendorBalance)}</dd></div>
        </dl>
        <a href={sectionLink('Vendor Payments')}>See vendor payments →</a>
      </section>
      <section className="planner-card">
        <div className="card-heading"><h2>Functions & events</h2><a href={sectionLink('Functions & Events')}>View all →</a></div>
        <ul className="planner-list">{events.map(([id, name, date, time, venue]) => <li key={id}>
          <div><strong>{name}</strong><small>{venue}</small></div><span>{displayDate(date)} · {time}</span>
        </li>)}</ul>
      </section>
      <section className="planner-card">
        <div className="card-heading"><h2>Family to-do list</h2><a href={sectionLink('Family Responsibilities')}>View responsibilities →</a></div>
        <ul className="planner-list">{tasks.map(([task, , owner, , due]) => <li key={task}>
          <div><strong>{task}</strong><small>{owner}</small></div><span>{displayDate(due)}</span>
        </li>)}</ul>
      </section>
      <section className="planner-card">
        <div className="card-heading"><h2>Guest logistics</h2><a href={sectionLink('RSVP Follow-up')}>Review follow-ups →</a></div>
        <dl className="figure-list">
          <div><dt>Pending replies</dt><dd>{metrics['Pending RSVP']}</dd></div>
          <div><dt>Rooms assigned</dt><dd>{metrics['Rooms Assigned']}</dd></div>
          <div><dt>Transport entries</dt><dd>{table('Transportation').rows.length}</dd></div>
        </dl>
        <div className="planner-links"><a href={sectionLink('Accommodation')}>Room list →</a><a href={sectionLink('Transportation')}>Pickup schedule →</a></div>
      </section>
    </div>
  </>
}

function StartHere() {
  return <><SetupOptions /><section className="planner-card">
    <h2>Explore the sample wedding</h2>
    <p>Start with the wedding details and functions. Add each person once in the Guest List, then use the same guest IDs for follow-ups, rooms and transport.</p>
    <ul className="planner-list">{workbook.index.map(entry => <li key={entry.name}>
      <div><a href={sectionLink(entry.name)}>{entry.name}</a><small>{entry.purpose}</small></div>
      <span>{entry.when}</span>
    </li>)}</ul>
  </section></>
}

function WorkbookTable({ section, initialFilter }: { section: string; initialFilter: string }) {
  const source = usePlan().tables.find(table => table.name === section)!
  const [filter, setFilter] = useState(initialFilter)
  const query = filter.trim().toLowerCase()
  const rows = source.rows.filter(row => row.some(cell => cell.toLowerCase().includes(query)))
  const printColumns = section === 'Guest List' ? [1, 2, 3, 11, 12, 13, 10, 7] : source.columns.map((_, i) => i)
  return <section className="planner-card">
    <p>{source.description}</p>
    <PrintSection title={section} columns={printColumns.map(i => source.columns[i])}
      records={rows.map(row => printColumns.map(i => formatCell(row[i], source.columns[i], row[0])))} filters={query ? 'Search: ' + filter.trim() : undefined} />
    <div className="table-tools">
      <label>Search this section <input type="search" value={filter} onChange={event => setFilter(event.target.value)} /></label>
      <span aria-live="polite">{rows.length} of {source.rows.length} sample entries</span>
    </div>
    <div className="table-scroll" tabIndex={0} role="region" aria-label={section + ' table'}>
      <table>
        <thead><tr>{source.columns.map(heading => <th key={heading} scope="col">{heading.replace(/ \(auto\)/gi, '')}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={source.rows.indexOf(row)}>
          {row.slice(0, source.columns.length).map((value, i) => {
            const guestId = /^(G\d+) \| /.exec(value)?.[1]
            return <td key={source.columns[i]}>{guestId && section !== 'Guest List'
              ? <a href={sectionLink('Guest List') + '?guest=' + guestId}>{value}</a>
              : formatCell(value, source.columns[i], row[0])}</td>
          })}
        </tr>)}</tbody>
      </table>
    </div>
    {rows.length === 0 && <p className="empty-table">No entries match your search.</p>}
  </section>
}

export function Planner({ rsvpDemo }: { rsvpDemo: React.ReactNode }) {
  return <PlanProvider><PlannerRoutes rsvpDemo={rsvpDemo} /></PlanProvider>
}

function PlannerRoutes({ rsvpDemo }: { rsvpDemo: React.ReactNode }) {
  const [route, setRoute] = useState(window.location.hash)
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    function navigate(event: HashChangeEvent) {
      setRoute(window.location.hash)
      setMenuOpen(false)
      if (new URL(event.oldURL).hash.split('?')[0] !== window.location.hash.split('?')[0]) window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [])
  const [page, params] = route.slice(1).split('?')
  const query = new URLSearchParams(params)
  const sandbox = !hosted && page === 'rsvp-sandbox'
  const setup = page === 'setup-upload' || page === 'setup-blank'
  const section = navigation.flatMap(group => group.sections).find(name => slug(name) === page) || 'Dashboard'
  const filter = query.get('guest') || ''
  const sampleImported = section === 'Dashboard' && query.get('import') === 'sample'
  const layoutParam = query.get('layout')
  const layout = layoutParam === 'workbook' || layoutParam === 'cards' ? layoutParam : undefined
  const awaitingReply = query.get('rsvp') === 'awaiting'
  const settings = Object.fromEntries(table('Settings').rows)

  if (page === 'focus' || page.startsWith('focus/')) return <FocusPlanner section={focusSection(page.slice(6))} filter={filter} />
  if (page === 'demo' || page.startsWith('demo/')) {
    return <WorkspaceDemo section={workspaceSection(page.slice(5))} layout={layout} guestSearch={filter} awaitingReply={awaitingReply} />
  }
  const workspacePage = /^workspace(?:\/([0-9a-f-]{36})(?:\/([a-z-]+))?)?$/i.exec(page)
  if (workspacePage || page === 'workspace/setup') {
    return <Workspace weddingID={workspacePage?.[1]} section={workspaceSection(workspacePage?.[2] ?? '')} guestSearch={filter}
      awaitingReply={awaitingReply} setup={page === 'workspace/setup'}
      inviteCode={page === 'workspace/setup' ? query.get('invite') ?? '' : ''}
      layout={layout} loginFailed={query.get('login') === 'failed'} />
  }

  return <div className="planner">
    <aside className="planner-sidebar" aria-label="Wedding planner">
      <div className="planner-brand">
        <a href="#dashboard">Shaadi Planner <span>PRO</span></a>
        <button className="planner-menu" aria-expanded={menuOpen} aria-controls="planner-nav" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? 'Close' : 'Sections'}
        </button>
      </div>
      <nav className={menuOpen ? 'planner-nav is-open' : 'planner-nav'} id="planner-nav" aria-label="Planning sections">
        {navigation.map(group => <div className="nav-group" key={group.label}>
          <p>{group.label}</p>
          {group.sections.map(name => <a href={sectionLink(name)} key={name} aria-current={!sandbox && (setup ? name === 'Start Here' : section === name) ? 'page' : undefined}>{name}</a>)}
        </div>)}
        <div className="nav-group"><p>Wedding planner</p><a href="#demo">Sample wedding</a><a href="#workspace">Start planning</a></div>
        {!hosted && <div className="nav-group"><p>Local prototypes</p><a href="#rsvp-sandbox" aria-current={sandbox ? 'page' : undefined}>RSVP sandbox</a></div>}
      </nav>
    </aside>
    {sandbox ? <div className="planner-sandbox">{rsvpDemo}</div> : <main className="planner-content">
      <header className="planner-hero">
        <div>
          <p className="eyebrow">{setup ? 'Onboarding prototype' : 'Filled workbook preview'}</p>
          <h1>{setup ? (page === 'setup-upload' ? 'Start from Excel' : 'Start a blank wedding') : section === 'Dashboard' ? 'Aarav & Meera' : section}</h1>
          <p>{setup ? <a href="#start-here">← Back to Start Here</a> : section === 'Dashboard' ? `${settings.City} · ${displayDate(settings['Wedding Date'])}` : settings['Wedding Name']}</p>
        </div>
        {hosted && <a className="package-button" href="#workspace">Start planning</a>}
        {!hosted && !setup && <a className="package-button" href={packageURL} download>Download Excel package</a>}
      </header>
      <p className="snapshot-note">{setup
        ? 'Use fictional details. Prototype changes disappear when you leave the setup flow or refresh.'
        : 'Browse the filled Excel workbook in your browser. This example uses the workbook’s sheets and saved totals.'}</p>
      {sampleImported && <p className="setup-success" role="status">Sample import complete. You’re viewing the filled wedding dashboard.</p>}
      {setup ? (page === 'setup-upload' ? <WorkbookSetup /> : <BlankSetup />)
        : section === 'Dashboard' ? <><p className="planner-links"><a href="#demo">Explore the planner demo →</a><a href="#start-here">Try setup walkthrough →</a><a href="#focus">Try the alternate prototype →</a></p><Dashboard /></>
        : section === 'Start Here' ? <StartHere /> : <WorkbookTable key={route} section={section} initialFilter={filter} />}
    </main>}
  </div>
}

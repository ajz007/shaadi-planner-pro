import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { CategoryBudget, Finance } from './WorkspaceFinance'
import { useWorkspaceData } from './WorkspaceData'
import { PrintSection } from './PlanActions'
import { useEditorFocus } from './useEditorFocus'

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })
const inr = (paise: number) => money.format(paise / 100)
const columns = ['Category', 'Budget', 'Committed', 'Paid', 'Outstanding', 'Budget remaining']
const message = (error: unknown) => error instanceof Error ? error.message : 'Could not load the budget.'

export function WorkspaceBudget({ wedding, workbookView, paymentsHref }: {
  wedding: { id: string; name: string }; workbookView: boolean; paymentsHref: string
}) {
  const { request, preview } = useWorkspaceData()
  const endpoint = '/weddings/' + wedding.id + '/finance'
  const [finance, setFinance] = useState<Finance>()
  const [editing, setEditing] = useState<CategoryBudget | 'new'>()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const { heading, returnTarget, fallback } = useEditorFocus(editing, busy)
  const load = useCallback(async (signal?: AbortSignal) => {
    const data = await request<Finance>(endpoint, undefined, signal)
    if (!signal?.aborted) { setFinance(data); setError('') }
  }, [request, endpoint])
  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal).catch(error => { if (!controller.signal.aborted) setError(message(error)) })
    const refresh = () => { void load(controller.signal).catch(error => { if (!controller.signal.aborted) setError(message(error)) }) }
    window.addEventListener('focus', refresh)
    return () => { controller.abort(); window.removeEventListener('focus', refresh) }
  }, [load])

  const budgets = finance?.budgets ?? []
  const visible = budgets.filter(row => row.category.toLowerCase().includes(query.trim().toLowerCase()))
  const totals = budgets.reduce((sum, row) => ({
    budget: sum.budget + row.budget, committed: sum.committed + row.committed, paid: sum.paid + row.paid,
    outstanding: sum.outstanding + Math.max(0, row.committed - row.paid),
  }), { budget: 0, committed: 0, paid: 0, outstanding: 0 })
  const current = editing === 'new' ? undefined : editing
  const cells = (row: CategoryBudget) => [row.category, inr(row.budget), inr(row.committed), inr(row.paid),
    inr(Math.max(0, row.committed - row.paid)), inr(row.budget - row.committed)]
  function edit(row: CategoryBudget | 'new', trigger: HTMLButtonElement) {
    returnTarget.current = trigger
    setError(''); setFeedback(''); setEditing(row)
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const category = String(form.get('category') ?? '').trim()
    const existing = current ?? budgets.find(row => row.category.trim().toLowerCase() === category.toLowerCase())
    setBusy(true); setError(''); setFeedback('')
    try {
      await request(endpoint + '/budgets/' + (existing?.id || 'new'), {
        category, budget: String(form.get('budget')), revision: existing?.revision ?? 0,
      })
      setEditing(undefined)
      setFeedback('Category budget saved.')
      try { await load() } catch { setFinance(undefined); setError('Saved. Refresh the budget to see the latest totals.') }
    } catch (error) { setError(message(error)) }
    finally { setBusy(false) }
  }
  const action = (row: CategoryBudget) => <button className="focus-secondary" disabled={busy || preview}
    onClick={event => edit(row, event.currentTarget)} aria-label={'Set budget for ' + row.category}>Set budget</button>

  return <section aria-label="Budget vs Actual">
    <div className="focus-heading"><div><h2 className="workspace-section-title" ref={fallback} tabIndex={-1}>Budget vs Actual</h2>
      <p>Set a budget for each category. Committed amounts and payments update from <a href={paymentsHref}>Vendor Payments</a>.</p>
      <p className="focus-note">Budget remaining is budget minus committed contracts. Outstanding is the amount still owed to vendors.
        Imported category payments are used only for categories without contracts.</p></div>
      <div className="focus-actions"><button disabled={busy || preview || !finance} onClick={event => edit('new', event.currentTarget)}>Add category budget</button>
        <button className="focus-secondary" disabled={busy} onClick={() => { void load().catch(error => setError(message(error))) }}>Refresh budget</button></div>
    </div>
    {error && <p role="alert">{error}</p>}{feedback && <p role="status">{feedback}</p>}
    {!finance && !error && <p role="status">Loading budget and payments.</p>}
    {editing && <form className="focus-card" key={current?.category ?? 'new'} onSubmit={event => void save(event)}>
      <h3 ref={heading} tabIndex={-1}>{current ? 'Set budget for ' + current.category : 'Add category budget'}</h3>
      <fieldset className="workspace-fields" disabled={busy}>
        <label className="focus-field">Category<input name="category" required maxLength={120} readOnly={!!current}
          defaultValue={current?.category} list="budget-categories" /></label>
        <datalist id="budget-categories">{[...new Set([...budgets.map(row => row.category),
          ...(finance?.vendors.map(row => row.values[0]) ?? [])])].map(category => <option key={category} value={category} />)}</datalist>
        <label className="focus-field">Planned budget (INR)<input name="budget" type="number" min="0" step="0.01" required
          defaultValue={current ? current.budget / 100 : undefined} /></label>
        <div className="focus-actions"><button>{busy ? 'Saving…' : 'Save budget'}</button>
          <button type="button" className="focus-secondary" onClick={() => setEditing(undefined)}>Cancel</button></div>
      </fieldset>
    </form>}
    {finance && <>
      <dl className="focus-summary">{[
        ['Category budget', totals.budget], ['Committed', totals.committed], ['Paid', totals.paid],
        ['Outstanding', totals.outstanding], ['Budget remaining', totals.budget - totals.committed],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{inr(Number(value))}</dd></div>)}</dl>
      <div className="focus-filters"><label className="focus-field">Find a category<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
        {!!visible.length && <PrintSection title="Budget vs Actual" columns={columns} records={visible.map(cells)} weddingName={wedding.name} />}
        <p role="status">{visible.length} of {budgets.length} categories</p></div>
      {!budgets.length && <p>No category budgets or contracts yet. Add a category budget or <a href={paymentsHref}>book a vendor</a> to get started.</p>}
      {!!budgets.length && !visible.length && <p>No categories match your search.</p>}
      {workbookView && !!visible.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Budget table">
        <table className="imported-records"><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}<th>Actions</th></tr></thead>
          <tbody>{visible.map(row => <tr key={row.category}>{cells(row).map((value, index) => <td key={index}>{value}</td>)}<td>{action(row)}</td></tr>)}</tbody></table>
      </div> : <div className="focus-record-grid">{visible.map(row => <article className="focus-card" key={row.category}>
        <h3>{row.category}</h3>{!row.id && row.budget === 0 && <p>Budget not set</p>}
        <dl className="focus-record-details">{cells(row).slice(1).map((value, i) => <div key={i}><dt>{columns[i + 1]}</dt><dd>{value}</dd></div>)}</dl>
        {row.committed > row.budget && <p>Over budget by {inr(row.committed - row.budget)}</p>}{action(row)}
      </article>)}</div>}
    </>}
  </section>
}

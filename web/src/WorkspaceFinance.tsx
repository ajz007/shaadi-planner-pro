import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import workbook from './workbook-demo.json'
import { PrintSection } from './PlanActions'
import { localDay } from './WorkspaceGuests'
import { VoiceField, VoiceNotice } from './VoiceField'

type RecordRow = { id: string; values: string[]; revision: number }
type Payment = { id: string; amount: number; date: string; method: string; notes: string; voided: boolean }
type Contract = RecordRow & { vendorId: string; value: number; openingPaid: number; paid: number; payments: Payment[] }
type Finance = { vendors: RecordRow[]; contracts: Contract[] }
type Request = <T>(path: string, body?: object, signal?: AbortSignal) => Promise<T>
type Section = 'Vendor Comparison' | 'Vendor Payments'

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })
const inr = (paise: number) => money.format(paise / 100)
const text = (data: FormData, name: string) => String(data.get(name) ?? '').trim()
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'The change could not be saved.'
const vendorTextFields = [0, 1, 3, 4, 5, 6, 7, 9]

export function WorkspaceFinance({ section, wedding, workbookView, request, vendorsHref }: {
  section: Section; wedding: { id: string; name: string; timeZone: string }
  workbookView: boolean; request: Request; vendorsHref: string
}) {
  const comparison = section === 'Vendor Comparison'
  const endpoint = '/weddings/' + wedding.id + '/finance'
  const columns = workbook.tables.find(table => table.name === section)!.columns
  const [finance, setFinance] = useState<Finance>()
  const [editing, setEditing] = useState<RecordRow | 'new'>()
  const [paying, setPaying] = useState<Contract>()
  const [selectedVendor, setSelectedVendor] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  async function load(signal?: AbortSignal) {
    const data = await request<Finance>(endpoint, undefined, signal)
    if (!signal?.aborted) setFinance(data)
  }

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal).catch(error => {
      if (!controller.signal.aborted) setError(errorMessage(error))
    })
    return () => controller.abort()
  }, [endpoint])

  const current = editing === 'new' ? undefined : editing
  const chosenVendor = finance?.vendors.find(vendor => vendor.id === selectedVendor)
  const contract = finance?.contracts.find(record => record.id === current?.id)
  const records = (comparison ? finance?.vendors : finance?.contracts) ?? []
  const categories = new Map<string, string>()
  if (comparison) {
    for (const record of records) {
      const label = record.values[0].trim()
      const key = label.toLowerCase()
      if (label && !categories.has(key)) categories.set(key, label)
    }
  }
  const activeCategory = categories.has(category) ? category : ''
  const visible = records.filter(row =>
    (!activeCategory || row.values[0].trim().toLowerCase() === activeCategory) &&
    row.values.join(' ').toLowerCase().includes(query.trim().toLowerCase()),
  )

  function edit(record: RecordRow | 'new') {
    setFeedback('')
    setError('')
    setPaying(undefined)
    setEditing(record)
    setSelectedVendor(record === 'new' ? '' : finance?.contracts.find(item => item.id === record.id)?.vendorId ?? '')
  }

  async function save(path: string, body: object, message: string) {
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      await request(endpoint + '/' + path, body)
      setEditing(undefined)
      setPaying(undefined)
      setFeedback(message)
      try { await load() }
      catch { setFinance(undefined); setError('Saved. Refresh the page to see the latest records.') }
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  function submitRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const values = columns.map((_, i) => text(form, String(i)))
    const id = current?.id ?? 'new'
    void save((comparison ? 'vendors/' : 'contracts/') + id,
      { values, vendorId: selectedVendor, revision: current?.revision ?? 0 },
      comparison ? 'Vendor saved.' : 'Contract saved.')
  }

  function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!paying) return
    const form = new FormData(event.currentTarget)
    void save('payments/' + paying.id, {
      amount: text(form, 'amount'), date: text(form, 'date'), method: text(form, 'method'),
      notes: text(form, 'notes'), revision: paying.revision,
    }, 'Payment recorded.')
  }

  function recordActions(record: RecordRow) {
    const item = finance?.contracts.find(contract => contract.id === record.id)
    return <div className="focus-actions">
      <button className="focus-secondary" disabled={busy} onClick={() => edit(record)} aria-label={'Edit ' + record.values[1]}>Edit</button>
      {item && item.value > item.paid && <button disabled={busy} onClick={() => {
        setEditing(undefined); setError(''); setFeedback(''); setPaying(item)
      }}>Record payment</button>}
    </div>
  }

  return <section aria-label={section}>
    <div className="focus-heading">
      <div><h2>{section}</h2><p className="focus-note">{comparison
        ? 'Compare live quotes and keep the latest scope and negotiated price.'
        : 'Book a vendor, record payments and see the outstanding balance.'}</p></div>
      {finance && (comparison || finance.vendors.length > 0) && <button disabled={busy} onClick={() => edit('new')}>
        {comparison ? 'Add vendor' : 'Add contract'}
      </button>}
    </div>
    {feedback && <p role="status">{feedback}</p>}
    {error && <p role="alert">{error}</p>}
    {!finance && !error && <p role="status">Loading vendor records…</p>}
    {finance && !comparison && !finance.vendors.length && <p><a href={vendorsHref}>Add a vendor in Vendor Comparison</a> before creating a contract.</p>}
    {editing && <form key={current?.id ?? 'new'} className="focus-card" onSubmit={submitRecord}>
      <h3>{current ? 'Edit' : 'Add'} {comparison ? 'vendor' : 'contract'}</h3>
      <fieldset className="workspace-fields" disabled={busy}>
        <div className="focus-form-grid">
          {comparison ? <>
            {vendorTextFields.map(i => <VoiceField key={i} label={columns[i]} name={String(i)}
              required={i === 0 || i === 1} multiline={[3, 4, 9].includes(i)} defaultValue={current?.values[i]} />)}
            {[2, 8].map(i => <label key={i} className="focus-field">{columns[i]} (INR)
              <input name={String(i)} type="number" min="0" step="0.01" defaultValue={current?.values[i]} />
            </label>)}
          </> : <>
            <label className="focus-field">Vendor
              <select required={!current || !!contract?.vendorId} value={selectedVendor} onChange={event => setSelectedVendor(event.target.value)}>
                <option value="">{current && !contract?.vendorId ? 'Keep imported vendor: ' + current.values[1] : 'Choose a vendor'}</option>
                {finance?.vendors.map(vendor => <option key={vendor.id} value={vendor.id}>{vendor.values[1]} · {vendor.values[0]}</option>)}
              </select>
            </label>
            <label className="focus-field">Contract value (INR)
              <input key={current?.id ?? selectedVendor} name="3" type="number" required min={(contract?.paid ?? 0) / 100}
                step="0.01" defaultValue={current?.values[3] || chosenVendor?.values[8] || chosenVendor?.values[2]} />
            </label>
            <label className="focus-field">Final due<input name="6" type="date" defaultValue={current?.values[6]} /></label>
            <VoiceField label="Owner" name="7" defaultValue={current?.values[7]} />
            <VoiceField label="Payment mode" name="8" defaultValue={current?.values[8]} />
            <VoiceField label="Notes" name="9" multiline defaultValue={current?.values[9]} />
          </>}
        </div>
        <VoiceNotice />
        <div className="focus-actions"><button>{busy ? 'Saving…' : 'Save'}</button>
          <button type="button" className="focus-secondary" onClick={() => setEditing(undefined)}>Cancel</button></div>
      </fieldset>
    </form>}
    {paying && <form key={paying.id} className="focus-card" onSubmit={submitPayment}>
      <h3>Record payment for {paying.values[1]}</h3>
      <p>{inr(paying.value - paying.paid)} remaining</p>
      <fieldset className="workspace-fields" disabled={busy}>
        <div className="focus-form-grid">
          <label className="focus-field">Amount (INR)<input name="amount" type="number" required min="0.01" max={(paying.value - paying.paid) / 100} step="0.01" /></label>
          <label className="focus-field">Payment date<input name="date" type="date" required defaultValue={localDay(wedding.timeZone)} /></label>
          <VoiceField label="Payment method" name="method" maxLength={120} />
          <VoiceField label="Payment notes" name="notes" multiline />
        </div>
        <VoiceNotice />
        <div className="focus-actions"><button>{busy ? 'Saving…' : 'Save payment'}</button>
          <button type="button" className="focus-secondary" onClick={() => setPaying(undefined)}>Cancel</button></div>
      </fieldset>
    </form>}
    {finance && <>
      <div className="focus-filters">
        <div><VoiceField label="Search vendors" value={query} onValueChange={setQuery} search /><VoiceNotice /></div>
        {comparison && <label className="focus-field">Filter by category
          <select value={activeCategory} onChange={event => setCategory(event.target.value)}>
            <option value="">All categories</option>
            {[...categories].sort(([, a], [, b]) => a.localeCompare(b)).map(([key, label]) =>
              <option key={key} value={key}>{label}</option>)}
          </select>
        </label>}
        {!!visible.length && <PrintSection title={section} columns={columns} records={visible.map(record => record.values)}
          filters={activeCategory ? 'Category: ' + categories.get(activeCategory) : undefined} weddingName={wedding.name} />}
      </div>
      {!visible.length && <p>{records.length ? 'No records match these filters.' : comparison ? 'No vendors yet.' : 'No contracts yet.'}</p>}
      {workbookView && !!visible.length && <div className="table-scroll" tabIndex={0} role="region" aria-label={section + ' table'}>
        <table className="imported-records"><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}<th>Actions</th></tr></thead>
          <tbody>{visible.map(record => <tr key={record.id}>{record.values.map((value, i) => <td key={i}>{value}</td>)}
            <td>{recordActions(record)}</td></tr>)}</tbody></table>
      </div>}
      {!workbookView && <div className="focus-record-grid">{visible.map(record => <article className="focus-card" key={record.id}>
        <div className="focus-heading"><h3>{record.values[1]}</h3><span className="focus-chip">{record.values[0]}</span></div>
        <dl className="focus-record-details">{record.values.map((value, i) => i > 1 && value && <div key={i}>
          <dt>{columns[i]}</dt><dd>{(comparison ? [2, 8] : [3, 4, 5]).includes(i) && Number.isFinite(Number(value)) ? inr(Number(value) * 100) : value}</dd>
        </div>)}</dl>
        {recordActions(record)}
      </article>)}</div>}
      {!comparison && finance.contracts.filter(item => visible.includes(item)).map(item => <details className="focus-card" key={item.id}>
        <summary>Payment history · {item.values[1]}</summary>
        {!!item.openingPaid && <p>Imported opening balance · {inr(item.openingPaid)}</p>}
        {item.payments.length === 0 && <p>No individual payments recorded.</p>}
        {item.payments.map(payment => <div key={payment.id} className="focus-item">
          <span><strong>{inr(payment.amount)} · {payment.date}{payment.voided && ' · Voided'}</strong>
            <small>{[payment.method, payment.notes].filter(Boolean).join(' · ')}</small></span>
          {!payment.voided && <button className="focus-secondary" disabled={busy} onClick={() => {
            if (window.confirm('Void this payment? It will remain visible in payment history.')) {
              void save('payments/' + item.id, { revision: item.revision, voidPayment: payment.id }, 'Payment voided.')
            }
          }}>Void payment</button>}
        </div>)}
      </details>)}
    </>}
  </section>
}

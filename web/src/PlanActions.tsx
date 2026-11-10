import { useState } from 'react'
import { usePlan } from './PlanData'

export function AddPlanEntry({ section }: { section: string }) {
  const { setRows, rows } = usePlan()
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const runSheet = section === 'Wedding Timeline'
  const event = section === 'Functions & Events' || runSheet
  const payment = section === 'Vendor Payments'
  const label = runSheet ? 'Add activity' : event ? 'Add event' : payment ? 'Add vendor payment' : 'Add vendor'
  const [vendor, setVendor] = useState('')
  const vendors = rows('Vendor Comparison')
  const selectedVendor = vendor === '' ? undefined : vendors[Number(vendor)]

  return <div className="plan-entry">
    {!open && <button onClick={() => { setOpen(true); setNotice('') }}>+ {label}</button>}
    {notice && <p role="status">{notice}</p>}
    {open && <form className="focus-card" onSubmit={e => {
      e.preventDefault()
      const data = new FormData(e.currentTarget)
      const get = (name: string) => String(data.get(name) ?? '').trim()
      const name = payment ? selectedVendor?.[1] : get('name')
      if (!name || (!event && !payment && !get('category'))) {
        setNotice('Enter a name and any required category.')
        return
      }
      if (event && !get('venue')) { setNotice('Enter a venue.'); return }
      if (runSheet) {
        setRows(section, current => [...current, [
          get('date'), get('time'), get('venue'), name, get('owner'), '', 'Not Started', '',
          get('duration') ? get('duration') + ' min' : '', get('notes'),
        ]])
      } else if (event) {
        setRows(section, current => [...current, [
          'F-' + crypto.randomUUID(), name, get('date'), get('time'), get('venue'), get('guests'),
          get('amount'), get('owner'), 'Planned', get('notes'), get('duration'),
        ]])
      } else if (payment && selectedVendor) {
        const amount = Math.round(Number(get('amount')) * 100)
        const paid = Math.round(Number(get('paid')) * 100)
        if (paid > amount) { setNotice('Paid amount cannot exceed the contract value.'); return }
        setRows(section, current => [...current, [
          selectedVendor[0], name, paid === amount ? 'Paid' : paid > 0 ? 'Part Paid' : 'Booked',
          String(amount / 100), String(paid / 100), String((amount - paid) / 100), get('date'), get('owner'), '', get('notes'),
        ]])
      } else {
        setRows(section, current => [...current, [
          get('category'), name, get('amount'), get('scope'), '', '', get('owner'), 'Shortlist', '', get('notes'),
        ]])
      }
      setNotice(name + ' added.')
      setVendor('')
      setOpen(false)
    }}>
      <h2>{label}</h2>
      <div className="focus-form-grid">
        {payment ? <label className="focus-field">Vendor<select required value={vendor} onChange={e => setVendor(e.target.value)}>
          <option value="">Choose a vendor</option>{vendors.map(([category, name], i) =>
            <option key={i} value={i}>{name} · {category}</option>)}
        </select></label> : <label className="focus-field">{runSheet ? 'Activity name' : event ? 'Event name' : 'Vendor name'}<input name="name" required maxLength={120} /></label>}
        {event && <>
          <label className="focus-field">Date<input name="date" type="date" required /></label>
          <label className="focus-field">Start time<input name="time" type="time" required /></label>
          <label className="focus-field">Venue<input name="venue" required maxLength={120} /></label>
          <label className="focus-field">Duration (minutes)<input name="duration" type="number" min="1" max="1440" /></label>
          {!runSheet && <label className="focus-field">Expected guests<input name="guests" type="number" min="0" max="100000" /></label>}
        </>}
        {!event && !payment && <>
          <label className="focus-field">Category<input name="category" required list="vendor-categories" maxLength={100} /></label>
          <datalist id="vendor-categories">{[...new Set(vendors.map(row => row[0]))].map(category => <option key={category} value={category} />)}</datalist>
          <label className="focus-field">Scope<input name="scope" maxLength={180} /></label>
        </>}
        {payment && <>
          <label className="focus-field">Final due date<input name="date" type="date" required /></label>
          <label className="focus-field">Already paid (₹)<input name="paid" type="number" min="0" max="1000000000" step="0.01" /></label>
        </>}
        {!runSheet && <label className="focus-field">{event ? 'Budget (₹)' : payment ? 'Contract value (₹)' : 'Quoted price (₹)'}
          <input name="amount" type="number" min={payment ? '0.01' : '0'} max="1000000000" step="0.01" required={payment}
            key={vendor} defaultValue={payment ? selectedVendor?.[8] || selectedVendor?.[2] : undefined} /></label>}
        <label className="focus-field">Owner<input name="owner" maxLength={100} /></label>
        <label className="focus-field">Notes<input name="notes" maxLength={300} /></label>
      </div>
      <div className="focus-actions"><button>Save {runSheet ? 'activity' : event ? 'event' : payment ? 'payment' : 'vendor'}</button>
        <button type="button" className="focus-secondary" onClick={() => { setOpen(false); setNotice(''); setVendor('') }}>Cancel</button></div>
    </form>}
  </div>
}

export function PrintSection({ title, columns, records, filters, weddingName = 'Aarav & Meera Wedding' }: {
  title: string; columns: string[]; records: string[][]; filters?: string; weddingName?: string
}) {
  return <>
    <button className="focus-secondary section-print-button" onClick={() => window.print()}>Print {title === 'Guest List' ? 'filtered guests' : 'this section'}</button>
    <section className="section-print" aria-hidden="true">
      <h1>{title}</h1><p>{weddingName} · {records.length} {records.length === 1 ? 'entry' : 'entries'}</p>
      {filters && <p>{filters}</p>}
      <table><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{records.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </section>
  </>
}

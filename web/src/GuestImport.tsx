import { useState } from 'react'
import type { FormEvent, RefObject } from 'react'
import { useWorkspaceData } from './WorkspaceData'

type GuestImportRow = {
  row: number; name: string; household: string; side: string; rsvp: string
  arrivalDate: string; arrivalTime: string; arrivalMode: string; stayRequired: string; transportRequired: string
  status: 'new' | 'duplicate' | 'conflict' | 'invalid'; reason?: string
}
type Review = { rows: GuestImportRow[]; review: string; ready: number }

const statusText = { new: 'Ready to add', duplicate: 'Duplicate', conflict: 'Possible duplicate', invalid: 'Needs correction' }
const template = 'data:text/csv;charset=utf-8,' + encodeURIComponent(
  'Guest Name,Household,Side,RSVP Status,Stay Required,Transport Required,Arrival Date,Arrival Time,Arrival Mode\r\n')
const pageSize = 50

export function GuestImport({ url, heading, onClose, onAdded }: {
  url: string
  heading: RefObject<HTMLHeadingElement | null>
  onClose: () => void
  onAdded: (count: number) => void
}) {
  const { fetchWorkspace } = useWorkspaceData()
  const [review, setReview] = useState<Review>()
  const [file, setFile] = useState<File>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)
  const [skippedOnly, setSkippedOnly] = useState(false)
  const skipped = review ? review.rows.length - review.ready : 0
  const rows = review?.rows.filter(row => !skippedOnly || row.status !== 'new') ?? []

  async function send(confirm?: string) {
    if (busy || !file) return
    const format = file.name.split('.').pop()?.toLowerCase()
    if (format !== 'csv' && format !== 'xlsx') {
      setError('Choose an Excel (.xlsx) or CSV file.')
      return
    }
    if (file.size === 0 || file.size > 2 * 1024 * 1024) {
      setError('Choose a file up to 2 MB.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await fetchWorkspace(url + '/import', {
        method: 'POST',
        headers: { 'X-Guest-Import-Format': format, ...(confirm ? { 'X-Guest-Import-Review': confirm } : {}) },
        body: file,
      })
      const data = await response.json()
      if (confirm && response.ok) {
        onAdded(data.added)
        return
      }
      if (!response.ok && response.status !== 409) throw new Error(data.error)
      if (!Array.isArray(data.rows)) throw new Error(data.error || 'Could not review the guest file.')
      setPage(0)
      setSkippedOnly(false)
      setReview(data)
      if (response.status === 409) setError('The guest list changed. Review the updated results before adding guests.')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not import guests.')
    } finally {
      setBusy(false)
    }
  }

  function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void send()
  }

  return <section className="focus-card" aria-labelledby="guest-import-heading">
    <h3 id="guest-import-heading" ref={heading} tabIndex={-1}>Import guests</h3>
    {error && <p role="alert">{error}</p>}
    {review ? <>
      <p role="status">{review.ready} ready to add · {skipped} to skip</p>
      {skipped > 0 && <p>To resolve a skipped row, correct it in your file and review the file again.</p>}
      {skipped > 0 && <label><input type="checkbox" checked={skippedOnly} disabled={busy} onChange={event => {
        setSkippedOnly(event.target.checked)
        setPage(0)
      }} /> Show skipped rows only</label>}
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Guest import preview">
        <table className="imported-records">
          <thead><tr>{['Row', 'Guest', 'Household', 'Guest details', 'Result'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{rows.slice(page * pageSize, (page + 1) * pageSize).map(row => <tr key={row.row}>
            <th scope="row">{row.row}</th><td>{row.name || '—'}</td><td>{row.household || '—'}</td>
            <td>{[row.side, row.rsvp, row.arrivalDate, row.arrivalTime, row.arrivalMode,
              row.stayRequired && 'Stay: ' + row.stayRequired, row.transportRequired && 'Transport: ' + row.transportRequired].filter(Boolean).join(' · ')}</td>
            <td><strong>{statusText[row.status]}</strong>{row.reason && <div>{row.reason}</div>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {rows.length > pageSize && <div className="focus-actions">
        <button type="button" className="focus-secondary" disabled={busy || page === 0} onClick={() => setPage(page - 1)}>Previous rows</button>
        <span>{page * pageSize + 1}–{Math.min(rows.length, (page + 1) * pageSize)} of {rows.length}</span>
        <button type="button" className="focus-secondary" disabled={busy || (page + 1) * pageSize >= rows.length} onClick={() => setPage(page + 1)}>Next rows</button>
      </div>}
      <div className="focus-actions">
        {review.ready > 0 && <button type="button" disabled={busy} onClick={() => void send(review.review)}>
          {busy ? 'Adding guests…' : 'Add ' + review.ready + (review.ready === 1 ? ' guest' : ' guests')}
        </button>}
        <button type="button" className="focus-secondary" disabled={busy} onClick={() => {
          setReview(undefined); setFile(undefined); setError('')
        }}>Choose another file</button>
        <button type="button" className="focus-secondary" disabled={busy} onClick={onClose}>Close</button>
      </div>
    </> : <form className="workspace-fields" onSubmit={preview}>
      <p>Upload a Shaadi Planner workbook, an Excel guest list, or a CSV. The file needs a Guest Name column.</p>
      <a href={template} download="shaadi-guest-import.csv">Download CSV template</a>
      <label className="focus-field">Excel or CSV file<input type="file" accept=".xlsx,.csv" required disabled={busy}
        onChange={event => { setFile(event.target.files?.[0]); setError('') }} /></label>
      <div className="focus-actions">
        <button disabled={busy}>{busy ? 'Reviewing guests…' : 'Review guests'}</button>
        <button type="button" className="focus-secondary" disabled={busy} onClick={onClose}>Cancel</button>
      </div>
    </form>}
  </section>
}

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useWorkspaceData } from './WorkspaceData'

export type ImportTotals = { guests: number; confirmed: number; rooms: number; plannedPaise: number; paidPaise: number; vendorDuePaise: number }
type Preview = {
  token: string; name: string; date: string; timeZone: string
  counts: { section: string; count: number }[]; totals: ImportTotals
}
type Issue = { sheet: string; row: number; message: string }
export type ImportedSection = { name: string; columns: string[]; rows: { number: number; values: string[]; guestLinks?: Record<number, string> }[] }
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })

function ImportSummary({ totals }: { totals: ImportTotals }) {
  const metrics: [string, string | number][] = [
    ['Guests', totals.guests], ['Confirmed', totals.confirmed], ['Rooms', totals.rooms],
    ['Planned budget', money.format(totals.plannedPaise / 100)], ['Budget paid', money.format(totals.paidPaise / 100)],
    ['Outstanding vendor balance', money.format(totals.vendorDuePaise / 100)],
  ]
  return <dl className="focus-summary">{metrics.map(([label, value]) =>
    <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
}

export function WorkspaceImport({ onCreated }: { onCreated: (id: string) => Promise<void> }) {
  const [preview, setPreview] = useState<Preview>()
  const [issues, setIssues] = useState<Issue[]>([])
  const [issueCount, setIssueCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const file = data.get('workbook')
    setError('')
    setIssues([])
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.xlsx') || file.size > 2 * 1024 * 1024) {
      setError('Choose an English v1.3.1 .xlsx file smaller than 2 MB.')
      return
    }
    setBusy(true)
    try {
      const result = await fetch('/api/workspace/import/preview', {
        method: 'POST', body: file, headers: { 'X-Wedding-Time-Zone': String(data.get('zone') ?? '').trim() },
      })
      const body = await result.json()
      if (!result.ok) {
        setIssues(body.issues ?? [])
        setIssueCount(body.issueCount ?? 0)
        throw new Error(body.error)
      }
      setPreview(body)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not review the workbook.')
    } finally {
      setBusy(false)
    }
  }

  async function confirm(token: string) {
    setBusy(true)
    setError('')
    try {
      const result = await fetch('/api/workspace/import/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
      })
      const body = await result.json()
      if (!result.ok) throw new Error(body.error)
      setPreview(undefined)
      await onCreated(body.id)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not create the wedding.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="focus-card">
    <h2>{preview ? 'Review workbook import' : 'Upload my workbook'}</h2>
    {preview ? <>
      <p><strong>{preview.name}</strong> · {preview.date} · {preview.timeZone}</p>
      <p>Review the records below. Creating the wedding keeps imported task assignments and adds the saved functions to the schedule.</p>
      <ImportSummary totals={preview.totals} />
      <dl className="focus-record-details">{preview.counts.map(({ section, count }) =>
        <div key={section}><dt>{section}</dt><dd>{count}</dd></div>)}</dl>
      <div className="focus-actions">
        <button disabled={busy} onClick={() => void confirm(preview.token)}>{busy ? 'Creating…' : 'Create wedding from workbook'}</button>
        <button className="focus-secondary" disabled={busy} onClick={() => { setPreview(undefined); setError('') }}>Choose a different file</button>
      </div>
    </> : <form onSubmit={event => void review(event)}>
      <p>Use a filled English v1.3.1 Shaadi Planner workbook. You’ll review it before creating the wedding.</p>
      <p className="focus-note">Uploading guest details? Read the <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy (opens in a new tab)</a>.</p>
      <fieldset className="workspace-fields" disabled={busy}>
        <label className="focus-field">Excel workbook<input name="workbook" type="file" accept=".xlsx" required /></label>
        <label className="focus-field">Wedding time zone<input name="zone" defaultValue="Asia/Kolkata" required maxLength={100} /></label>
        <button>{busy ? 'Reading workbook…' : 'Review workbook'}</button>
      </fieldset>
    </form>}
    {error && <p role="alert">{error}</p>}
    {issues.length > 0 && <><p>Showing {issues.length} of {issueCount} issues.</p>
      <ul>{issues.map((issue, index) => <li key={index}>
        <strong>{issue.sheet} · Row {issue.row}.</strong> {issue.message}
      </li>)}</ul>
    </>}
  </section>
}

export function useImportedPlanningRecords(wedding: string, enabled: boolean) {
  const { request } = useWorkspaceData()
  const [data, setData] = useState<{ sections: ImportedSection[]; totals: ImportTotals }>()
  const [error, setError] = useState('')
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    request<{ sections: ImportedSection[]; totals: ImportTotals }>('/weddings/' + wedding + '/imported-sections', undefined, controller.signal)
      .then(data => { if (!controller.signal.aborted) setData(data) })
      .catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [wedding, enabled, request])
  return { data, error }
}

export function ImportedPlanningRecords({ data, error }: { data?: { sections: ImportedSection[]; totals: ImportTotals }; error: string }) {
  const [selected, setSelected] = useState('')
  if (error) return <p role="alert">{error}</p>
  if (!data) return <p role="status">Loading import history…</p>
  if (!data.sections.length) return <p>No Excel workbook was imported for this wedding.</p>
  const section = data.sections.find(section => section.name === selected)
  const shown = section?.columns.flatMap((column, index) =>
    !column.endsWith('(Auto)') || column === 'Guest ID (Auto)' || column === 'Function ID (Auto)' ? [{ column, index }] : []) ?? []
  return <section className="focus-card">
    <h2>Import history</h2>
    <p>These are the records as they were imported from Excel. The live schedule and checklist show later edits.</p>
    <ImportSummary totals={data.totals} />
    <label className="focus-field">Imported section<select value={selected} onChange={event => setSelected(event.target.value)}>
      <option value="">Choose a section</option>{data.sections.map(section =>
        <option key={section.name} value={section.name}>{section.name === 'Guest List' ? 'Original Excel guest records' : section.name} ({section.rows.length})</option>)}
    </select></label>
    {section && <div className="table-scroll" tabIndex={0} role="region" aria-label={section.name + ' imported records'}>
      <table className="imported-records"><thead><tr><th scope="col">Excel row</th>{shown.map(({ column }) => <th key={column} scope="col">{column}</th>)}</tr></thead>
        <tbody>{section.rows.map(row => <tr key={row.number}><td>{row.number}</td>{shown.map(({ index }) => <td key={index}>{row.values[index]}</td>)}</tr>)}</tbody>
      </table>
    </div>}
  </section>
}

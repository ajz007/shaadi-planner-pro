import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import workbook from './workbook-demo.json'

type Table = (typeof workbook.tables)[number]
type Tables = Record<string, string[][]>
const storageKey = 'shaadi-planner-workspace-v1'
const initial = Object.fromEntries(workbook.tables.map(table => [table.name, table.rows]))

function load(): Tables {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Tables | null
    if (stored && workbook.tables.every(table => Array.isArray(stored[table.name]) &&
      stored[table.name].every(row => Array.isArray(row) && row.length >= table.columns.length && row.every(value => typeof value === 'string')))) return stored
  } catch {
    // The sample remains available when browser storage is disabled or invalid.
  }
  return initial
}

const Plan = createContext<{
  tables: Table[]
  rows: (section: string) => string[][]
  setRows: (section: string, update: (rows: string[][]) => string[][]) => void
  storageError: boolean
} | null>(null)

export function PlanProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState(load)
  const [storageError, setStorageError] = useState(false)
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(data))
      setStorageError(false)
    } catch {
      setStorageError(true)
    }
  }, [data])
  return <Plan.Provider value={{
    tables: workbook.tables.map(table => ({ ...table, rows: data[table.name] })),
    rows: section => data[section],
    setRows: (section, update) => setData(current => ({ ...current, [section]: update(current[section]) })),
    storageError,
  }}>{children}</Plan.Provider>
}

export function usePlan() {
  const plan = useContext(Plan)
  if (!plan) throw new Error('Wedding workspace is unavailable.')
  return plan
}

export function SnapshotDownload() {
  const { tables, rows } = usePlan()
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  async function download() {
    setStatus('')
    setBusy(true)
    const budget = rows('Budget vs Actual')
    const planned = budget.reduce((total, row) => total + Number(row[1]), 0)
    const paid = budget.reduce((total, row) => total + Number(row[2]), 0)
    const summary = [
      ['Metric', 'Value'], ['Planned budget', planned], ['Actual paid', paid], ['Budget remaining', planned - paid],
      ['Guests', rows('Guest List').length], ['Confirmed guests', rows('Guest List').filter(row => row[7] === 'Confirmed').length],
      ['Functions', rows('Functions & Events').length], ['Open tasks', rows('Family Responsibilities').filter(row => row[5] !== 'Done').length],
      ['Outstanding vendor balance', rows('Vendor Payments').reduce((total, row) => total + Number(row[5]), 0)],
    ]
    const numeric = /^(Budget|Actual Paid|Balance \(Auto\)|Quote|Negotiated Price|Contract Value|Paid|Expected Guests|Qty|Unit Cost|Total \(Auto\)|Duration \(minutes\))$/
    const sheets = [{ name: 'Dashboard', rows: summary }, ...tables.map(table => {
      const isFunction = table.name === 'Functions & Events'
      const isTimeline = table.name === 'Wedding Timeline'
      const extra = isFunction ? ['Duration (minutes)', 'Required people'] : isTimeline ? ['Required people'] : []
      const columns = [...table.columns, ...extra]
      return {
        name: table.name,
        rows: [columns, ...table.rows.map(row => columns.map((heading, i) => {
          const value = row[i] ?? ''
          const requiredIndex = isFunction ? 11 : isTimeline ? 10 : -1
          if (i === requiredIndex && value) {
            const people = JSON.parse(value) as string[]
            return people.join(', ') || 'No one required'
          }
          return numeric.test(heading) && value !== '' && Number.isFinite(Number(value)) ? Number(value) : value
        }))],
      }
    })]
    try {
      const response = await fetch('/api/workbook-snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheets }),
      })
      if (!response.ok) throw new Error('Workbook download failed. Try again.')
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = 'Shaadi-Planner-Current-Snapshot.xlsx'
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setStatus('Workbook download failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return <><button className="focus-secondary" disabled={busy} onClick={() => void download()}>{busy ? 'Preparing workbook…' : 'Download current Excel snapshot'}</button>
    {status && <span role="alert">{status}</span>}</>
}

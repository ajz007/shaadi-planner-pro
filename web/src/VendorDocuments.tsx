import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

type Document = { id: string; name: string; size: number }
async function documentRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'The document request failed.')
  }
  return response
}

export function VendorDocuments({ weddingId, vendorId, vendorName, close }: {
  weddingId: string; vendorId: string; vendorName: string; close: () => void
}) {
  const endpoint = '/api/workspace/weddings/' + weddingId + '/vendors/' + vendorId + '/documents'
  const [documents, setDocuments] = useState<Document[]>()
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)

  async function load(signal?: AbortSignal) {
    const response = await documentRequest(endpoint, { signal })
    const files: Document[] = await response.json()
    if (!signal?.aborted) setDocuments(files)
  }
  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [endpoint])

  async function change(url: string, body: FormData | undefined, message: string) {
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      await documentRequest(url, { method: 'POST', body })
      setFeedback(message)
      try { await load() }
      catch { setError('The change was saved. Reopen Documents to refresh the list.') }
      return true
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The change could not be saved.')
      return false
    } finally { setBusy(false) }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const body = new FormData(form)
    const files = body.getAll('files')
    if (!files.length || files.length > 5 || files.some(file => !(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024)) {
      setError('Choose up to five PDF, JPG or PNG files, up to 5 MB each.')
      return
    }
    if (await change(endpoint, body, 'Documents uploaded.')) form.reset()
  }

  return <section className="focus-card" aria-label={'Documents for ' + vendorName}>
    <div className="focus-heading"><h3>Documents · {vendorName}</h3>
      <button disabled={busy} className="focus-secondary" onClick={close}>Close documents</button></div>
    <p>PDF, JPG or PNG. Up to 5 MB each, 10 files per vendor and 50 MB per wedding. Wedding owners can download these documents.</p>
    {error && <p role="alert">{error}</p>}
    {feedback && <p role="status">{feedback}</p>}
    <form onSubmit={event => void upload(event)}>
      <fieldset className="workspace-fields" disabled={busy}>
        <label className="focus-field">Choose documents<input type="file" name="files" accept=".pdf,.png,.jpg,.jpeg" multiple required /></label>
        <button>{busy ? 'Working…' : 'Upload documents'}</button>
      </fieldset>
    </form>
    {documents?.length === 0 && <p>No documents uploaded yet.</p>}
    {documents?.map(file => <div key={file.id} className="focus-item">
      <span><a href={endpoint + '/' + file.id} download>{file.name}</a><small>{Math.max(1, Math.round(file.size / 1024))} KB</small></span>
      <button className="focus-secondary" disabled={busy} onClick={() => {
        if (window.confirm('Remove ' + file.name + '?')) void change(endpoint + '/' + file.id, undefined, 'Document removed.')
      }}>Remove</button>
    </div>)}
  </section>
}

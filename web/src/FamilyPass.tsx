import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { PreviewFrame } from './studio/PreviewFrame'
import './studio/studio.css'
import './family-pass.css'
import { defaultContent, optionsFor, templateFor, defaultTemplateId } from './invitation/model'
import { productByID, rupees, weddingPass } from './Shop'
import { workspaceRequest } from './WorkspaceData'
import { WorkspaceImport } from './WorkspaceImport'

type Draft = { bride: string; groom: string; date: string; function: string; functionTime: string }
type Status = { available: boolean; onSale: boolean; testCodeRequired: boolean; bundleProduct?: string; orderCode?: string }
const emptyDraft: Draft = { bride: '', groom: '', date: '', function: 'Wedding', functionTime: '' }
const template = templateFor(defaultTemplateId)
const checkoutURL = (code: string) => '/shop/purchase#' + code

export function FamilyPass({ accountId, onCreated }: { accountId: string; onCreated: (id: string) => Promise<void> }) {
  const storageKey = 'shaadi-family-preview:' + accountId
  const [draft, setDraft] = useState<Draft>(() => {
    try { return { ...emptyDraft, ...JSON.parse(sessionStorage.getItem(storageKey) ?? '{}') } }
    catch { return emptyDraft }
  })
  const [previewOpen, setPreviewOpen] = useState(false)
  const [preview, setPreview] = useState(false)
  const [status, setStatus] = useState<Status>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const bundle = productByID(status?.bundleProduct)
  const passReady = status?.available === true
  const valid = Boolean(draft.bride.trim() && draft.groom.trim() && draft.date && draft.function.trim() && draft.functionTime)

  useEffect(() => {
    const controller = new AbortController()
    workspaceRequest<Status>('/family-pass', undefined, controller.signal)
      .then(setStatus).catch(failure => { if (!controller.signal.aborted) setError(failure.message) })
    return () => controller.abort()
  }, [])

  function change(key: keyof Draft, value: string) {
    const next = { ...draft, [key]: value }
    setDraft(next)
    setPreview(false)
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* Storage may be disabled. */ }
  }

  async function purchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const result = await workspaceRequest<Status>('/family-pass', { email: form.get('email'), testAccess: form.get('testAccess') ?? '' })
      if (result.orderCode) window.location.assign(checkoutURL(result.orderCode))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Checkout could not start.')
      setBusy(false)
    }
  }

  async function finish(id: string) {
    try { sessionStorage.removeItem(storageKey) } catch { /* Storage may be disabled. */ }
    await onCreated(id)
    // The parent stays mounted when navigating between weddings.
    setStatus(undefined)
  }

  async function create() {
    setBusy(true)
    setError('')
    try {
      const result = await workspaceRequest<{ id: string }>('/weddings', {
        name: draft.bride.trim() + ' & ' + draft.groom.trim(), date: draft.date, timeZone: 'Asia/Kolkata',
        draft: { bride: draft.bride, groom: draft.groom, function: draft.function, functionTime: draft.functionTime },
      })
      await finish(result.id)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The wedding could not be created.')
    } finally {
      setBusy(false)
    }
  }

  function submitSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!valid || busy) return
    if (passReady) {
      void create()
    } else {
      setPreview(current => !current)
    }
  }

  const content = defaultContent()
  content.bride.name = draft.bride.trim()
  content.groom.name = draft.groom.trim()
  const name = content.bride.name + ' & ' + content.groom.name

  const details = <>
    <label className="focus-field">Bride’s name<input value={draft.bride} maxLength={56} required onChange={e => change('bride', e.target.value)} /></label>
    <label className="focus-field">Groom’s name<input value={draft.groom} maxLength={56} required onChange={e => change('groom', e.target.value)} /></label>
    <label className="focus-field">Wedding date<input type="date" value={draft.date} required onChange={e => change('date', e.target.value)} /></label>
    <label className="focus-field">First function<input value={draft.function} maxLength={120} required onChange={e => change('function', e.target.value)} /></label>
    <label className="focus-field">Start time (India time)<input type="time" value={draft.functionTime} required onChange={e => change('functionTime', e.target.value)} /></label>
  </>

  if (passReady) return <>
    <section className="focus-card">
      <h2>Create your wedding</h2>
      <p>Your Family Pass is ready. Enter your wedding details to start from scratch.</p>
      <form onSubmit={submitSetup}>
        <fieldset className="workspace-fields" disabled={busy}>
          {details}
          <div className="focus-actions"><button disabled={!valid || busy}>{busy ? 'Creating wedding…' : 'Create wedding'}</button></div>
        </fieldset>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
    <WorkspaceImport onCreated={finish} />
  </>

  return <div className="family-pass-entry">
    <section className="focus-card family-pass-checkout">
      <h2>Family Pass · {rupees(weddingPass.amount)} once per wedding</h2>
      <p>Purchase a Family Pass to set up your online wedding planner.</p>
      <p>Share invitations, collect RSVPs, and coordinate your guest list, rooms, pickups and budget with your family.</p>
      {bundle && <p><strong>{bundle.name} included at no extra cost.</strong>{bundle.slug === 'complete' &&
        ' Get the Excel planner, vendor negotiation toolkit, and WhatsApp and RSVP message templates.'}</p>}
      {!status && !error && <p role="status">Checking your Family Pass.</p>}
      {status?.orderCode ? <a className="package-button" href={checkoutURL(status.orderCode)}>Return to checkout or check payment</a> :
        status?.onSale ? <form className="workspace-fields" onSubmit={event => void purchase(event)}>
          <p>Access lasts through the 90th day after your wedding. Read the <a href="/terms" target="_blank" rel="noreferrer">terms</a> and <a href="/refunds" target="_blank" rel="noreferrer">refund policy</a> before payment.</p>
          <label className="focus-field">Receipt email<input name="email" type="email" required maxLength={254} /></label>
          {status.testCodeRequired && <label className="focus-field">Private test checkout code<input name="testAccess" type="password" required /></label>}
          <button disabled={busy}>Continue to payment</button>
        </form> : status && <p>Family Pass sales are currently paused.</p>}
      {error && <p role="alert">{error}</p>}
      <p><a href="/contact">Get purchase help</a></p>
    </section>
    <section className="focus-card family-pass-preview" aria-label="Optional invitation preview">
      <button type="button" className="focus-secondary" aria-expanded={previewOpen} aria-controls="family-pass-preview"
        onClick={() => { setPreviewOpen(!previewOpen); setPreview(false) }}>
        {previewOpen ? 'Hide invitation preview' : 'Want a quick invitation preview before you buy?'}
      </button>
      <div id="family-pass-preview" hidden={!previewOpen}>
        {previewOpen && <>
          <p>Enter a few details to see how your invitation could look.</p>
          <form onSubmit={submitSetup}>
            <fieldset className="workspace-fields">
              {details}
              <div className="focus-actions"><button disabled={!valid}>{preview ? 'Hide invitation' : 'Show invitation'}</button></div>
            </fieldset>
          </form>
          {preview && valid && <PreviewFrame label="Your sample wedding invitation" draft={{
            page: { name, date: draft.date, timeZone: 'Asia/Kolkata', design: { heading: name } },
            invitation: {
              template: { id: template.id, version: template.version, options: optionsFor(template) }, content, hasMusic: false,
              events: [{ id: 'first-function', name: draft.function, startsAt: draft.date + 'T' + draft.functionTime + ':00+05:30', place: '', address: '', mapUrl: '' }],
            },
            musicPath: '',
          }} />}
        </>}
      </div>
    </section>
  </div>
}

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Invitation } from './invitation/Invitation'
import { defaultContent, optionsFor, templateFor, defaultTemplateId } from './invitation/model'
import { rupees, weddingPass } from './Shop'
import { workspaceRequest } from './WorkspaceData'
import { WorkspaceImport } from './WorkspaceImport'

type Draft = { bride: string; groom: string; date: string; function: string; functionTime: string }
type Status = { available: boolean; onSale: boolean; testCodeRequired: boolean; includesEssentials?: boolean; orderCode?: string }
const emptyDraft: Draft = { bride: '', groom: '', date: '', function: 'Wedding', functionTime: '' }
const template = templateFor(defaultTemplateId)
const checkoutURL = (code: string) => '/shop/purchase#' + code

export function FamilyPass({ accountId, onCreated }: { accountId: string; onCreated: (id: string) => Promise<void> }) {
  const storageKey = 'shaadi-family-preview:' + accountId
  const [draft, setDraft] = useState<Draft>(() => {
    try { return { ...emptyDraft, ...JSON.parse(sessionStorage.getItem(storageKey) ?? '{}') } }
    catch { return emptyDraft }
  })
  const [preview, setPreview] = useState(false)
  const [status, setStatus] = useState<Status>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
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
    if (!status || !valid || busy) return
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

  return <>
    <section className="focus-card">
      <h2>{passReady ? 'Create your wedding' : 'Preview your wedding invitation'}</h2>
      <p>{passReady ? 'Your Family Pass is ready. Enter your wedding details to start from scratch.'
        : 'Preview privately for free. Activate one wedding to share invitations, collect RSVPs and plan with your family.'}</p>
      <form onSubmit={submitSetup}>
        <fieldset className="workspace-fields" disabled={busy}>
          <label className="focus-field">Bride’s name<input value={draft.bride} maxLength={56} required onChange={e => change('bride', e.target.value)} /></label>
          <label className="focus-field">Groom’s name<input value={draft.groom} maxLength={56} required onChange={e => change('groom', e.target.value)} /></label>
          <label className="focus-field">Wedding date<input type="date" value={draft.date} required onChange={e => change('date', e.target.value)} /></label>
          <label className="focus-field">First function<input value={draft.function} maxLength={120} required onChange={e => change('function', e.target.value)} /></label>
          <label className="focus-field">Start time (India time)<input type="time" value={draft.functionTime} required onChange={e => change('functionTime', e.target.value)} /></label>
          <div className="focus-actions">
            {passReady
              ? <button type="submit" disabled={!valid || busy}>{busy ? 'Creating wedding…' : 'Create wedding'}</button>
              : <button type="submit" disabled={!status || busy}>{preview ? 'Close preview' : 'Preview invitation'}</button>}
          </div>
        </fieldset>
      </form>
      {!passReady && preview && valid && <Invitation preview embedded page={{ name, date: draft.date, timeZone: 'Asia/Kolkata', design: { heading: name } }}
        invitation={{ template: { id: template.id, version: template.version, options: optionsFor(template) }, content, hasMusic: false,
          events: [{ id: 'first-function', name: draft.function, startsAt: draft.date + 'T' + draft.functionTime + ':00+05:30', place: '', address: '', mapUrl: '' }] }} />}
    </section>
    {!passReady && <section className="focus-card">
      <h2>Family Pass · {rupees(weddingPass.amount)} once per wedding</h2>
      <p>Includes all functions in one wedding, family collaboration, household invitations, RSVPs, rooms, pickups, budget and Excel export.</p>
      {status?.onSale && status.includesEssentials && <p>Includes English Excel Essentials at no extra cost.</p>}
      {!status && !error && <p role="status">Checking your Family Pass.</p>}
      {status?.orderCode ? <a className="package-button" href={checkoutURL(status.orderCode)}>Return to checkout or check payment</a> :
        status?.onSale ? <form className="workspace-fields" onSubmit={event => void purchase(event)}>
          <p>Access lasts through the 90th day after your wedding. Read the <a href="/terms" target="_blank" rel="noreferrer">terms</a> and <a href="/refunds" target="_blank" rel="noreferrer">refund policy</a> before payment.</p>
          <label className="focus-field">Receipt email<input name="email" type="email" required maxLength={254} /></label>
          {status.testCodeRequired && <label className="focus-field">Private test checkout code<input name="testAccess" type="password" required /></label>}
          <button disabled={busy}>Continue to checkout</button>
        </form> : status && <p>Family Pass sales are currently paused. You can still preview your invitation.</p>}
      <p><a href="/contact">Get purchase help</a></p>
    </section>}
    {error && <p role="alert">{error}</p>}
    {passReady && <WorkspaceImport onCreated={finish} />}
  </>
}

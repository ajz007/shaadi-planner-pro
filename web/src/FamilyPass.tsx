import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import './family-pass.css'
import { productByID, rupees, weddingPass } from './Shop'
import { marketingChoice, attribution } from './shopMeta'
import { workspaceRequest } from './WorkspaceData'
import { WorkspaceImport } from './WorkspaceImport'
import { useWeddingDraft, WeddingDetailsFields, WeddingInvitationPreview } from './WeddingInvitationPreview'

type Status = { available: boolean; onSale: boolean; testCodeRequired: boolean; bundleProduct?: string; orderCode?: string }
const checkoutURL = (code: string) => '/shop/purchase#' + code

export function FamilyPass({ accountId, onCreated }: { accountId: string; onCreated: (id: string) => Promise<void> }) {
  const { draft, valid, change, clear } = useWeddingDraft(accountId)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [status, setStatus] = useState<Status>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const bundle = productByID(status?.bundleProduct)
  const passReady = status?.available === true

  useEffect(() => {
    const controller = new AbortController()
    workspaceRequest<Status>('/family-pass', undefined, controller.signal)
      .then(setStatus).catch(failure => { if (!controller.signal.aborted) setError(failure.message) })
    return () => controller.abort()
  }, [])

  async function purchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const result = await workspaceRequest<Status>('/family-pass', { email: form.get('email'), testAccess: form.get('testAccess') ?? '', meta: marketingChoice() === 'yes' ? attribution() : undefined })
      if (result.orderCode) window.location.assign(checkoutURL(result.orderCode))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Checkout could not start.')
      setBusy(false)
    }
  }

  async function finish(id: string) {
    clear()
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
    if (valid && !busy) void create()
  }

  if (passReady) return <>
    <section className="focus-card">
      <h2>Create your wedding</h2>
      <p>Your Family Pass is ready. Enter your wedding details to start from scratch.</p>
      <form onSubmit={submitSetup}>
        <fieldset className="workspace-fields" disabled={busy}>
          <WeddingDetailsFields draft={draft} change={change} />
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
        ' Get the Excel planner, vendor negotiation toolkit, and WhatsApp and RSVP message templates.'}{bundle.slug === 'all-in-one' &&
        ' Get the Excel planner, vendor negotiation toolkit, WhatsApp and RSVP message templates, and Sangeet Host Kit PRO.'}</p>}
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
        onClick={() => setPreviewOpen(open => !open)}>
        {previewOpen ? 'Hide invitation preview' : 'Want a quick invitation preview before you buy?'}
      </button>
      <div id="family-pass-preview" hidden={!previewOpen}>
        {previewOpen && <WeddingInvitationPreview draft={draft} valid={valid} change={change} />}
      </div>
    </section>
  </div>
}

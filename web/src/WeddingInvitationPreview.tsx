import { useState } from 'react'
import { defaultContent, defaultTemplateId, optionsFor, templateFor } from './invitation/model'
import { PreviewFrame } from './studio/PreviewFrame'
import './studio/studio.css'

type Draft = { bride: string; groom: string; date: string; function: string; functionTime: string }
type ChangeDraft = (key: keyof Draft, value: string) => void

const emptyDraft: Draft = { bride: '', groom: '', date: '', function: 'Wedding', functionTime: '' }
const template = templateFor(defaultTemplateId)

export function useWeddingDraft(accountId: string) {
  const storageKey = 'shaadi-family-preview:' + accountId
  const [draft, setDraft] = useState<Draft>(() => {
    try { return { ...emptyDraft, ...JSON.parse(sessionStorage.getItem(storageKey) ?? '{}') } }
    catch { return emptyDraft }
  })
  const valid = Boolean(draft.bride.trim() && draft.groom.trim() && draft.date && draft.function.trim() && draft.functionTime)

  function change(key: keyof Draft, value: string) {
    const next = { ...draft, [key]: value }
    setDraft(next)
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* Storage may be disabled. */ }
  }

  function clear() {
    try { sessionStorage.removeItem(storageKey) } catch { /* Storage may be disabled. */ }
  }

  return { draft, valid, change, clear }
}

export function WeddingDetailsFields({ draft, change }: { draft: Draft; change: ChangeDraft }) {
  return <>
    <label className="focus-field">Bride's name<input value={draft.bride} maxLength={56} required onChange={e => change('bride', e.target.value)} /></label>
    <label className="focus-field">Groom's name<input value={draft.groom} maxLength={56} required onChange={e => change('groom', e.target.value)} /></label>
    <label className="focus-field">Wedding date<input type="date" value={draft.date} required onChange={e => change('date', e.target.value)} /></label>
    <label className="focus-field">First function<input value={draft.function} maxLength={120} required onChange={e => change('function', e.target.value)} /></label>
    <label className="focus-field">Start time (India time)<input type="time" value={draft.functionTime} required onChange={e => change('functionTime', e.target.value)} /></label>
  </>
}

export function WeddingInvitationPreview({ draft, valid, change }: { draft: Draft; valid: boolean; change: ChangeDraft }) {
  const [preview, setPreview] = useState(false)
  const content = defaultContent()
  content.bride.name = draft.bride.trim()
  content.groom.name = draft.groom.trim()
  const name = content.bride.name + ' & ' + content.groom.name

  return <>
    <p>Enter a few details to see how your invitation could look.</p>
    <form onSubmit={event => {
      event.preventDefault()
      if (valid) setPreview(current => !current)
    }}>
      <fieldset className="workspace-fields">
        <WeddingDetailsFields draft={draft} change={(key, value) => {
          change(key, value)
          setPreview(false)
        }} />
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
  </>
}

export function WorkspaceWeddingPreview({ accountId }: { accountId: string }) {
  const { draft, valid, change } = useWeddingDraft(accountId)
  return <WeddingInvitationPreview draft={draft} valid={valid} change={change} />
}

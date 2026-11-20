import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { useWorkspaceData } from '../WorkspaceData'
import type { Plan } from '../Workspace'
import type { GuestPage } from '../GuestWeddingPage'
import { eventIcons, iconFor, optionsFor, symbols, templateFor, withDefaults } from '../invitation/model'
import type { EventIcon, InvitationContent, InvitationDesign, InvitationEvent, InvitationSymbol, SectionKey } from '../invitation/model'
import type { PreviewDraft } from '../invitation/InvitationPreview'
import { ContactEditor, DesignOptions, FamilyEditor, Field, PersonFields, timeFormat } from './fields'
import { Gallery } from './Gallery'
import { PreviewFrame } from './PreviewFrame'
import './studio.css'

type Status = { live: boolean; everPublished: boolean; publishedAt?: string; savedAt?: string; unpublishedChanges: boolean }
type Settings = Status & { template: InvitationDesign; content: InvitationContent; hasMusic: boolean; musicName: string; revision: number; events: InvitationEvent[] }
type View = 'designs' | 'edit' | 'publish'
type Step = { key: string; title: string; section?: SectionKey; hint: string }

const steps: Step[] = [
  { key: 'design', title: 'Design', section: 'hero', hint: 'Palette and the touches this design offers.' },
  { key: 'couple', title: 'Couple', section: 'couple', hint: 'Names, honorifics and parents.' },
  { key: 'blessing', title: 'Blessings', section: 'blessing', hint: 'Symbols, shloka, kuldevi, elders and the invitation line.' },
  { key: 'events', title: 'Functions', section: 'events', hint: 'Icons, subtitles and time labels for each function.' },
  { key: 'family', title: 'Family', section: 'family', hint: 'Relatives grouped into cards.' },
  { key: 'venue', title: 'Venue & replies', section: 'venue', hint: 'Dress code and the reply-by date.' },
  { key: 'contacts', title: 'Contacts', section: 'contacts', hint: 'Who guests can call or message.' },
  { key: 'closing', title: 'Closing', section: 'closing', hint: 'The last lines and the hosts.' },
  { key: 'music', title: 'Music', hint: 'Background music after the opening.' },
]

const previewKey = 'shaadi-invitation-preview'
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Try again.'
const snapshot = (settings: Settings) => JSON.stringify({ template: settings.template, content: settings.content })
const publishedTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' })

// The server stores a draft and a published snapshot. Organizers edit the
// draft; guests only ever see the snapshot, which changes when they publish.
function normalize(result: Settings): Settings {
  const design = templateFor(result.template?.id)
  return { ...result, content: withDefaults(result.content, result.revision),
    template: { id: design.id, version: design.version, options: optionsFor(design, result.template?.options) } }
}

export function InvitationStudio({ wedding, rsvpHref }: { wedding: Plan['wedding']; rsvpHref: string }) {
  const { request } = useWorkspaceData()
  const path = '/weddings/' + wedding.id + '/guest-rsvp'
  const [settings, setSettings] = useState<Settings>()
  const [page, setPage] = useState<GuestPage>()
  const [saved, setSaved] = useState('')
  const [view, setView] = useState<View>('designs')
  const [step, setStep] = useState('design')
  const [showPreview, setShowPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([request<Settings>(path + '/invitation', undefined, controller.signal), request<GuestPage>(path + '/page', undefined, controller.signal)])
      .then(([result, guestPage]) => {
        if (controller.signal.aborted) return
        const loaded = normalize(result)
        setSettings(loaded)
        setSaved(snapshot(loaded))
        setPage(guestPage)
        setView(result.revision > 0 ? 'edit' : 'designs')
      })
      .catch(error => { if (!controller.signal.aborted) setError(errorText(error)) })
    return () => controller.abort()
  }, [path, request])

  const dirty = !!settings && snapshot(settings) !== saved
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const guestEvents = useMemo(() => settings?.events.filter(event => !event.familyOnly) ?? [], [settings?.events])
  const draftFor = (template: InvitationDesign): PreviewDraft => ({
    page: page ?? { name: wedding.name, date: wedding.date, timeZone: wedding.timeZone, design: { heading: '' } },
    invitation: { template, content: settings!.content, hasMusic: settings!.hasMusic, events: guestEvents },
    musicPath: '/api/workspace' + path + '/invitation/music',
    greeting: 'Sharma family',
  })
  const draft = useMemo(() => settings && draftFor(settings.template), [settings, page, guestEvents]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!settings || !draft) return error ? <p role="alert">{error}</p> : <p role="status">Opening the invitation studio…</p>

  const content = settings.content
  const design = templateFor(settings.template.id)
  const update = (patch: Partial<Settings>) => { setNotice(''); setSettings(current => current && { ...current, ...patch }) }
  const set = (patch: Partial<InvitationContent>) => update({ content: { ...content, ...patch } })
  const setStyle = (id: string, patch: Partial<InvitationContent['events'][string]>) => {
    const current = content.events[id] ?? { icon: '' as EventIcon, subtitle: '', timeLabel: '' }
    set({ events: { ...content.events, [id]: { ...current, ...patch } } })
  }

  const reload = async () => {
    const loaded = normalize(await request<Settings>(path + '/invitation'))
    setSettings(loaded)
    setSaved(snapshot(loaded))
  }
  // Saves the draft only. Returns the new revision, or undefined on failure.
  async function saveDraft(): Promise<number | undefined> {
    const contacts = content.contacts.filter(contact => contact.name.trim() || contact.phone.trim())
    const result = await request<{ revision: number }>(path + '/invitation', {
      content: { ...content, contacts }, template: { id: settings!.template.id, options: settings!.template.options }, revision: settings!.revision,
    })
    const next = { ...settings!, revision: result.revision, content: { ...content, contacts } }
    setSettings(next)
    setSaved(snapshot(next))
    return result.revision
  }
  async function run(work: () => Promise<string>) {
    setBusy(true)
    setError('')
    setNotice('')
    try { setNotice(await work()) } catch (error) { setError(errorText(error)) }
    finally { setBusy(false) }
  }
  const save = () => run(async () => {
    await saveDraft()
    await reload()
    return settings!.everPublished ? 'Draft saved. Guests keep seeing the published version until you publish.'
      : 'Draft saved. Publish when you’re ready for guests to see it.'
  })
  const change = (action: 'publish' | 'unpublish' | 'discard') => run(async () => {
    const revision = action === 'publish' && dirty ? await saveDraft() : settings!.revision
    await request(path + '/invitation/publish', { action, revision })
    await reload()
    return action === 'publish' ? 'Published. Guests now see this version on their RSVP and schedule links.'
      : action === 'unpublish' ? 'Hidden from guests. Their links show the simple RSVP page until you publish again.'
        : 'Unpublished changes discarded. The draft now matches what guests see.'
  })
  async function uploadMusic(file?: File) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (file && (file.size > 5 * 1024 * 1024 || !/\.mp3$/i.test(file.name))) throw new Error('Choose an MP3 file up to 5 MB.')
      const response = await fetch('/api/workspace' + path + '/invitation/music?revision=' + settings!.revision, {
        method: 'POST', body: file ?? '', headers: file ? { 'Content-Type': 'audio/mpeg', 'X-File-Name': encodeURIComponent(file.name) } : {},
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not save the music.')
      setSettings(current => current && { ...current, revision: data.revision, hasMusic: !!file, musicName: file?.name ?? '' })
      setNotice(file ? 'Music saved.' : 'Music removed.')
    } catch (error) { setError(errorText(error)) }
    finally { setBusy(false) }
  }
  function openFullPreview() {
    try {
      localStorage.setItem(previewKey, JSON.stringify(draft))
      window.open('/invitation-preview', '_blank', 'noopener')
    } catch { setError('Could not open the preview. Allow site storage in this browser and try again.') }
  }
  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file) void uploadMusic(file)
  }
  const useDesign = (template: InvitationDesign) => {
    const next = templateFor(template.id)
    update({ template: { id: next.id, version: next.version, options: optionsFor(next, { ...settings.template.options, ...template.options }) } })
    setView('edit')
    setStep('design')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const current = steps.find(item => item.key === step) ?? steps[0]
  const index = steps.indexOf(current)
  const unused = current.section && !design.sections.includes(current.section)
  const canPublish = dirty || settings.unpublishedChanges || !settings.live
  const status = !settings.everPublished ? ['Not published yet', '']
    : !settings.live ? ['Hidden from guests', '']
      : settings.unpublishedChanges || dirty ? ['Live · unpublished changes', ' is-pending'] : ['Live for guests', ' is-live']
  const checklist: [boolean, string][] = [
    [!!(content.groom.name || content.bride.name), 'The couple’s names are filled in'],
    [guestEvents.length > 0, 'At least one guest function is in the planner'],
    [content.contacts.some(contact => contact.name && contact.phone), 'A contact for guests (recommended)'],
    [!!content.rsvpBy, 'A reply-by date (recommended)'],
  ]

  const panels: Record<string, ReactNode> = {
    design: <>
      <div className="studio-current-design">
        <div><strong>{design.name}</strong><p>{design.description}</p></div>
        <button type="button" className="focus-secondary" onClick={() => setView('designs')}>Change design</button>
      </div>
      <DesignOptions design={design} values={settings.template.options} onChange={options => update({ template: { ...settings.template, options } })} />
    </>,
    couple: <>
      <PersonFields title="Groom" person={content.groom} onChange={groom => set({ groom })} />
      <PersonFields title="Bride" person={content.bride} onChange={bride => set({ bride })} />
      <label className="inv-editor-toggle"><input type="checkbox" checked={content.brideFirst} onChange={event => set({ brideFirst: event.target.checked })} />
        Show the bride first (for invitations from the bride’s family)</label>
      <p className="inv-editor-hint">The couple photo is the cover photo under <a href={rsvpHref}>Guest RSVP → Customize the wedding page</a>.</p>
    </>,
    blessing: <>
      <fieldset className="inv-editor-box">
        <legend>Sacred symbols (up to three)</legend>
        <div className="inv-editor-checks">{symbols.map(option => <label key={option.value}><input type="checkbox"
          checked={content.symbols.includes(option.value)} disabled={!content.symbols.includes(option.value) && content.symbols.length >= 3}
          onChange={event => set({ symbols: event.target.checked ? [...content.symbols, option.value]
            : content.symbols.filter((value: InvitationSymbol) => value !== option.value) })} />{option.label}</label>)}</div>
      </fieldset>
      <Field label="Invocation" value={content.invocation} onChange={invocation => set({ invocation })} max={80} />
      <Field label="Shloka" rows={3} value={content.shloka} onChange={shloka => set({ shloka })} max={300} hint="Leave empty to skip. Each line shows on its own line." />
      <div className="inv-editor-grid">
        <Field label="Blessing line" value={content.blessingIntro} onChange={blessingIntro => set({ blessingIntro })} max={120} />
        <Field label="Kuldevi or deity" value={content.deity} onChange={deity => set({ deity })} max={80} placeholder="Amba Mata" />
        <Field label="Elders line" value={content.eldersIntro} onChange={eldersIntro => set({ eldersIntro })} max={120} />
        <Field label="Elders" value={content.elders} onChange={elders => set({ elders })} max={200} placeholder="Shri Mohan Sharma & Smt. Kamla Sharma" />
        <Field label="Note under elders" value={content.eldersNote} onChange={eldersNote => set({ eldersNote })} max={80} placeholder="(Dadaji and Dadiji)" />
        <Field label="Cover title" value={content.title} onChange={title => set({ title })} max={40} />
      </div>
      <Field label="Invitation line" value={content.intro} onChange={intro => set({ intro })} max={200} />
    </>,
    events: <>
      {settings.events.length === 0 && <p>Add functions in the planner. They appear here with their date, time and venue.</p>}
      {settings.events.map(event => {
        const style = content.events[event.id]
        return <fieldset className="inv-editor-box" key={event.id}>
          <legend>{event.name}{event.familyOnly && ' · Family only'}</legend>
          <p className="inv-editor-hint">{timeFormat(event.startsAt)}{event.place && ' · ' + event.place}</p>
          <div className="inv-editor-grid">
            <label className="focus-field">Icon<select value={style?.icon ?? ''} onChange={change => setStyle(event.id, { icon: change.target.value as EventIcon })}>
              {eventIcons.map(option => <option key={option.value} value={option.value}>{option.value ? option.label : option.label + ' (' + iconFor(event) + ')'}</option>)}
            </select></label>
            <Field label="Subtitle" value={style?.subtitle ?? ''} onChange={subtitle => setStyle(event.id, { subtitle })} max={80} placeholder="followed by dinner" />
            <Field label="Time label" value={style?.timeLabel ?? ''} onChange={timeLabel => setStyle(event.id, { timeLabel })} max={60} placeholder="Shubh muhurat, 7:30 PM" />
          </div>
        </fieldset>
      })}
      <p className="inv-editor-hint">Each guest sees only the functions on their own link. Family-only functions don’t appear in this preview. Venue addresses and map links come from the planner’s places.</p>
    </>,
    family: <FamilyEditor families={content.families} onChange={families => set({ families })} />,
    venue: <div className="inv-editor-grid">
      <Field label="Dress code" value={content.dressCode} onChange={dressCode => set({ dressCode })} max={200} placeholder="Festive Indian wear" />
      <Field label="Reply by" type="date" value={content.rsvpBy} onChange={rsvpBy => set({ rsvpBy })} max={10} />
    </div>,
    contacts: <ContactEditor contacts={content.contacts} onChange={contacts => set({ contacts })} />,
    closing: <div className="inv-editor-grid">
      <Field label="Closing line" value={content.closing} onChange={closing => set({ closing })} max={120} />
      <Field label="Regards line" value={content.regardsIntro} onChange={regardsIntro => set({ regardsIntro })} max={60} />
      <Field label="Hosts" value={content.hosts} onChange={hosts => set({ hosts })} max={200} placeholder="Shri Rajesh & Smt. Sunita Sharma" />
    </div>,
    music: <>
      <p>Music starts after the guest opens the invitation, with a large On/Off button. Upload only music you have the right to share,
        such as a licensed or royalty-free shehnai track. MP3, up to 5 MB. Music saves straight away.</p>
      {settings.hasMusic && <p><strong>{settings.musicName || 'Background music'}</strong></p>}
      <div className="focus-actions">
        <label className="focus-secondary inv-editor-file">{settings.hasMusic ? 'Replace music' : 'Choose an MP3'}
          <input type="file" accept="audio/mpeg,.mp3" onChange={choose} /></label>
        {settings.hasMusic && <button type="button" className="focus-secondary" onClick={() => void uploadMusic()}>Remove music</button>}
      </div>
    </>,
  }

  return <div className="studio">
    <div className="studio-bar">
      <nav className="studio-tabs" aria-label="Invitation studio">
        {([['designs', '1. Choose a design'], ['edit', '2. Personalise'], ['publish', '3. Publish']] as [View, string][]).map(([key, label]) =>
          <button key={key} type="button" aria-current={view === key ? 'step' : undefined} onClick={() => setView(key)}>{label}</button>)}
      </nav>
      <div className="studio-status">
        <span className={'studio-pill' + status[1]}>{status[0]}</span>
        {dirty && <span className="studio-unsaved">Unsaved changes</span>}
        <button type="button" className="focus-secondary" onClick={openFullPreview}>Preview draft</button>
        <button type="button" className="focus-secondary" disabled={busy || !dirty} onClick={() => void save()}>{busy ? 'Working…' : 'Save draft'}</button>
        <button type="button" disabled={busy || !canPublish} onClick={() => void change('publish')}>
          {settings.everPublished && settings.live ? 'Publish changes' : 'Publish'}</button>
      </div>
    </div>
    {settings.revision > 0 && view !== 'publish' && <p className="studio-draft-note">
      <strong>Your draft</strong>{settings.savedAt && <> · last saved {publishedTime.format(new Date(settings.savedAt))}</>}
      {' · '}{!settings.everPublished ? 'Not published yet, so guests can’t see it.'
        : !settings.live ? 'Hidden from guests.'
          : settings.unpublishedChanges || dirty ? 'Guests see an earlier published version.' : 'Guests see this version.'}
      {' '}<button type="button" className="studio-link" onClick={openFullPreview}>Open full-screen preview</button>
    </p>}
    {error && <p role="alert" className="studio-message">{error}</p>}
    {notice && <p role="status" className="studio-message">{notice}</p>}

    {view === 'designs' && <Gallery current={settings.template.id} draftFor={draftFor} onUse={useDesign} />}

    {view === 'edit' && <div className={'studio-workspace' + (showPreview ? ' is-previewing' : '')}>
      <div className="studio-editor">
        <ol className="studio-steps">
          {steps.map(item => <li key={item.key}>
            <button type="button" aria-current={item.key === step ? 'step' : undefined} onClick={() => setStep(item.key)}
              className={item.section && !design.sections.includes(item.section) ? 'is-unused' : undefined}>{item.title}</button>
          </li>)}
        </ol>
        <fieldset className="studio-panel workspace-fields" disabled={busy}>
          <legend><span>{current.title}</span><small>{current.hint}</small></legend>
          {unused && <p className="inv-editor-hint studio-unused">“{design.name}” doesn’t show this section. What you enter is kept and appears if you switch to a design that has it.</p>}
          {panels[current.key]}
          <div className="studio-step-nav">
            <button type="button" className="focus-secondary" disabled={index === 0} onClick={() => setStep(steps[index - 1].key)}>Back</button>
            {index < steps.length - 1 ? <button type="button" onClick={() => setStep(steps[index + 1].key)}>Next: {steps[index + 1].title}</button>
              : <button type="button" onClick={() => setView('publish')}>Next: Publish</button>}
          </div>
        </fieldset>
      </div>
      <button type="button" className="studio-preview-toggle focus-secondary" aria-expanded={showPreview}
        onClick={() => setShowPreview(value => !value)}>{showPreview ? 'Hide preview' : 'Show live preview'}</button>
      <div className="studio-preview-column"><PreviewFrame draft={draft} focus={current.section} /></div>
    </div>}

    {view === 'publish' && <div className="studio-publish">
      <section className="focus-card">
        <h2>Publish to guests</h2>
        <p>Guests see the <strong>published</strong> version when they open their RSVP or schedule link, with their own RSVP inside.
          Saving keeps your changes in a draft that only you see, until you publish. Publishing doesn’t message anyone: share the links
          from <a href={rsvpHref}>Guest RSVP</a>.</p>
        <dl className="studio-state">
          <div><dt>Guests see</dt><dd>{settings.live ? 'This invitation' : 'The simple RSVP page'}</dd></div>
          <div><dt>Last published</dt><dd>{settings.publishedAt ? publishedTime.format(new Date(settings.publishedAt)) : 'Never'}</dd></div>
          <div><dt>Your draft</dt><dd>{dirty ? 'Has unsaved changes' : settings.unpublishedChanges ? 'Has changes guests don’t see yet'
            : settings.everPublished ? 'Matches what guests see' : 'Not published yet'}</dd></div>
        </dl>
        <ul className="studio-checklist">
          {checklist.map(([done, label]) => <li key={label} className={done ? 'is-done' : undefined}>
            <span className="studio-sr">{done ? 'Done: ' : 'To do: '}</span>{label}</li>)}
        </ul>
        <div className="focus-actions">
          <button type="button" disabled={busy || !canPublish} onClick={() => void change('publish')}>
            {!settings.everPublished ? 'Publish invitation' : settings.live ? (canPublish ? 'Publish changes' : 'Published') : 'Publish again'}</button>
          <button type="button" className="focus-secondary" onClick={openFullPreview}>Open full-screen preview</button>
          <a className="focus-secondary" href={rsvpHref}>Go to Guest RSVP links</a>
        </div>
        {(settings.unpublishedChanges || settings.live) && <div className="focus-actions studio-quiet-actions">
          {settings.unpublishedChanges && !dirty && <button type="button" className="focus-secondary" disabled={busy} onClick={() => {
            if (window.confirm('Discard the changes guests haven’t seen? Your draft goes back to the published version.')) void change('discard')
          }}>Discard unpublished changes</button>}
          {settings.live && <button type="button" className="focus-secondary" disabled={busy} onClick={() => {
            if (window.confirm('Stop showing this invitation? Guests will see the simple RSVP page until you publish again.')) void change('unpublish')
          }}>Stop showing to guests</button>}
        </div>}
      </section>
      <div className="studio-preview-column"><PreviewFrame draft={draft} /></div>
    </div>}
  </div>
}

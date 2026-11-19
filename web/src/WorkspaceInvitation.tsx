import { useEffect, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { useWorkspaceData } from './WorkspaceData'
import type { GuestPage } from './GuestWeddingPage'
import { eventIcons, iconFor, palettes, symbols, withDefaults } from './invitation/model'
import type { Contact, EventIcon, FamilySection, InvitationContent, InvitationEvent, InvitationPerson, InvitationSymbol } from './invitation/model'

type Settings = { enabled: boolean; content: InvitationContent; hasMusic: boolean; musicName: string; revision: number; events: InvitationEvent[] }
export const invitationPreviewKey = 'shaadi-invitation-preview'
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Try again.'
const phonePattern = '\\+?[0-9][0-9 \\-]{6,18}[0-9]'
const timeFormat = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

function Field({ label, value, onChange, max, placeholder, rows, hint, type, pattern }: {
  label: string; value: string; onChange: (value: string) => void; max: number; placeholder?: string; rows?: number; hint?: string
  type?: string; pattern?: string
}) {
  return <label className="focus-field">{label}
    {rows ? <textarea rows={rows} maxLength={max} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} />
      : <input type={type ?? 'text'} maxLength={max} value={value} placeholder={placeholder} pattern={pattern} onChange={event => onChange(event.target.value)} />}
    {hint && <small>{hint}</small>}
  </label>
}

function Group({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) {
  return <details className="inv-editor-group" open={open}>
    <summary>{title}</summary>
    <div className="inv-editor-body">{children}</div>
  </details>
}

function PersonFields({ title, person, onChange }: { title: string; person: InvitationPerson; onChange: (person: InvitationPerson) => void }) {
  const set = (key: keyof InvitationPerson) => (value: string) => onChange({ ...person, [key]: value })
  return <fieldset className="inv-editor-box">
    <legend>{title}</legend>
    <div className="inv-editor-grid">
      <Field label="Honorific" value={person.honorific} onChange={set('honorific')} max={30} placeholder="Chi." />
      <Field label="Full name" value={person.name} onChange={set('name')} max={80} placeholder="Rishabh Shrivastava" />
      <Field label="Name on the cover" value={person.shortName} onChange={set('shortName')} max={30} placeholder="Rishabh" />
      <Field label="Parents label" value={person.parentLabel} onChange={set('parentLabel')} max={40} placeholder="Son of" />
    </div>
    <Field label="Parents" value={person.parents} onChange={set('parents')} max={200} placeholder="Shri Rakesh Shrivastava & Smt. Renu Shrivastava" />
  </fieldset>
}

const sampleFamily = (heading: string): FamilySection => ({
  heading,
  cards: [
    { title: 'With blessings from heaven', lines: [{ relation: 'Nanaji and Naniji', names: '' }] },
    { title: 'Looking forward to welcoming you', lines: [{ relation: 'Chachaji and Chachiji', names: '' }, { relation: 'Mausaji and Mausiji', names: '' }] },
    { title: 'Awaiting your presence', lines: [{ relation: 'Brothers and sisters', names: '' }] },
  ],
})

function FamilyEditor({ families, onChange }: { families: FamilySection[]; onChange: (families: FamilySection[]) => void }) {
  const update = (index: number, family: FamilySection) => onChange(families.map((item, i) => i === index ? family : item))
  return <>
    <p>Group relatives into cards. Put one name or couple per line. Empty rows are left out.</p>
    {families.map((family, f) => <fieldset className="inv-editor-box" key={f}>
      <legend>Family section {f + 1}</legend>
      <Field label="Heading" value={family.heading} onChange={heading => update(f, { ...family, heading })} max={80} placeholder="The Groom’s Family" />
      {family.cards.map((card, c) => {
        const setCard = (next: typeof card) => update(f, { ...family, cards: family.cards.map((item, i) => i === c ? next : item) })
        return <div className="inv-editor-card" key={c}>
          <Field label={'Card ' + (c + 1) + ' title'} value={card.title} onChange={title => setCard({ ...card, title })} max={80} placeholder="Looking forward to welcoming you" />
          {card.lines.map((line, l) => {
            const setLine = (next: typeof line) => setCard({ ...card, lines: card.lines.map((item, i) => i === l ? next : item) })
            return <div className="inv-editor-grid" key={l}>
              <Field label="Relation" value={line.relation} onChange={relation => setLine({ ...line, relation })} max={80} placeholder="Fufaji and Buaji of Groom" />
              <Field label="Names" rows={2} value={line.names} onChange={names => setLine({ ...line, names })} max={600} placeholder="Shri Vipin Mathur & Smt. Anjali Mathur" />
              <button type="button" className="focus-secondary" onClick={() => setCard({ ...card, lines: card.lines.filter((_, i) => i !== l) })}>Remove row</button>
            </div>
          })}
          <div className="focus-actions">
            {card.lines.length < 12 && <button type="button" className="focus-secondary" onClick={() => setCard({ ...card, lines: [...card.lines, { relation: '', names: '' }] })}>Add row</button>}
            <button type="button" className="focus-secondary" onClick={() => update(f, { ...family, cards: family.cards.filter((_, i) => i !== c) })}>Remove card</button>
          </div>
        </div>
      })}
      <div className="focus-actions">
        {family.cards.length < 6 && <button type="button" className="focus-secondary" onClick={() => update(f, { ...family, cards: [...family.cards, { title: '', lines: [{ relation: '', names: '' }] }] })}>Add card</button>}
        <button type="button" className="focus-secondary" onClick={() => onChange(families.filter((_, i) => i !== f))}>Remove section</button>
      </div>
    </fieldset>)}
    {families.length < 4 && <div className="focus-actions">
      <button type="button" className="focus-secondary" onClick={() => onChange([...families, sampleFamily(families.length ? 'The Bride’s Family' : 'The Groom’s Family')])}>Add a family section</button>
    </div>}
  </>
}

function ContactEditor({ contacts, onChange }: { contacts: Contact[]; onChange: (contacts: Contact[]) => void }) {
  const update = (index: number, contact: Contact) => onChange(contacts.map((item, i) => i === index ? contact : item))
  return <>
    <p>Guests can call or WhatsApp these people from the invitation. Ten-digit numbers are treated as Indian numbers.</p>
    {contacts.map((contact, i) => <div className="inv-editor-grid" key={i}>
      <Field label="Name" value={contact.name} onChange={name => update(i, { ...contact, name })} max={80} />
      <Field label="Role" value={contact.role} onChange={role => update(i, { ...contact, role })} max={60} placeholder="Groom’s brother" />
      <Field label="Phone" type="tel" pattern={phonePattern} value={contact.phone} onChange={phone => update(i, { ...contact, phone })} max={20} placeholder="+91 98765 43210" />
      <button type="button" className="focus-secondary" onClick={() => onChange(contacts.filter((_, index) => index !== i))}>Remove</button>
    </div>)}
    {contacts.length < 6 && <div className="focus-actions">
      <button type="button" className="focus-secondary" onClick={() => onChange([...contacts, { name: '', role: '', phone: '' }])}>Add contact</button>
    </div>}
  </>
}

export function WorkspaceInvitation({ path, page }: { path: string; page?: GuestPage }) {
  const { request, preview: demo } = useWorkspaceData()
  const [settings, setSettings] = useState<Settings>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    request<Settings>(path + '/invitation', undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) setSettings({ ...result, content: withDefaults(result.content, result.revision) }) })
      .catch(error => { if (!controller.signal.aborted) setError(errorText(error)) })
    return () => controller.abort()
  }, [path, request])

  if (!settings) return <details className="focus-card guest-page-editor">
    <summary>Design the digital invitation</summary>
    {error ? <p role="alert">{demo ? 'Open your own wedding to design an invitation.' : error}</p> : <p role="status">Loading…</p>}
  </details>

  const content = settings.content
  const set = (patch: Partial<InvitationContent>) => {
    setNotice('')
    setSettings(current => current && { ...current, content: { ...current.content, ...patch } })
  }
  const setStyle = (id: string, patch: Partial<InvitationContent['events'][string]>) => {
    const current = content.events[id] ?? { icon: '' as EventIcon, subtitle: '', timeLabel: '' }
    set({ events: { ...content.events, [id]: { ...current, ...patch } } })
  }
  async function save(enabled = settings!.enabled) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const contacts = content.contacts.filter(contact => contact.name.trim() || contact.phone.trim())
      const result = await request<{ revision: number }>(path + '/invitation', { enabled, content: { ...content, contacts }, revision: settings!.revision })
      setSettings(current => current && { ...current, enabled, revision: result.revision, content: { ...current.content, contacts } })
      setNotice(enabled ? 'Invitation saved. Guests now see it when they open their RSVP or schedule link.' : 'Invitation saved as a draft. Guests still see the simple page.')
    } catch (error) { setError(errorText(error)) }
    finally { setBusy(false) }
  }
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
  function openPreview() {
    if (!page) return
    const events = settings!.events.filter(event => !event.familyOnly)
    try {
      localStorage.setItem(invitationPreviewKey, JSON.stringify({
        page, invitation: { content, hasMusic: settings!.hasMusic, events }, musicPath: '/api/workspace' + path + '/invitation/music',
      }))
      window.open('/invitation-preview', '_blank', 'noopener')
    } catch { setError('Could not open the preview. Allow site storage in this browser and try again.') }
  }
  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file) void uploadMusic(file)
  }

  return <details className="focus-card guest-page-editor inv-editor">
    <summary>Design the digital invitation</summary>
    <p>Build an animated invitation with an envelope opening, blessings, the festivities, family and contacts. When it’s on,
      guests see it on their RSVP and schedule links, with their RSVP inside it.</p>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <fieldset className="workspace-fields" disabled={busy}>
      <div className="inv-editor-grid">
        <label className="focus-field">Palette<select value={content.palette} onChange={event => set({ palette: event.target.value as InvitationContent['palette'] })}>
          {palettes.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>
        <label className="inv-editor-toggle"><input type="checkbox" checked={settings.enabled}
          onChange={event => setSettings({ ...settings, enabled: event.target.checked })} />Show this invitation to guests</label>
      </div>

      <Group title="The couple" open>
        <PersonFields title="Groom" person={content.groom} onChange={groom => set({ groom })} />
        <PersonFields title="Bride" person={content.bride} onChange={bride => set({ bride })} />
        <label className="inv-editor-toggle"><input type="checkbox" checked={content.brideFirst} onChange={event => set({ brideFirst: event.target.checked })} />
          Show the bride first (for invitations from the bride’s family)</label>
      </Group>

      <Group title="Blessings and opening lines">
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
          <Field label="Kuldevi or deity" value={content.deity} onChange={deity => set({ deity })} max={80} placeholder="Shri Durga Maa" />
          <Field label="Elders line" value={content.eldersIntro} onChange={eldersIntro => set({ eldersIntro })} max={120} />
          <Field label="Elders" value={content.elders} onChange={elders => set({ elders })} max={200} placeholder="Shri Ishverlal & Smt. Ranjan Shrivastava" />
          <Field label="Note under elders" value={content.eldersNote} onChange={eldersNote => set({ eldersNote })} max={80} placeholder="(Dadaji and Dadiji)" />
          <Field label="Cover title" value={content.title} onChange={title => set({ title })} max={40} />
        </div>
        <Field label="Invitation line" value={content.intro} onChange={intro => set({ intro })} max={200} />
        <p className="inv-editor-hint">The couple photo comes from the cover photo under “Customize the wedding page”.</p>
      </Group>

      <Group title="Festivities">
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
              <Field label="Subtitle" value={style?.subtitle ?? ''} onChange={subtitle => setStyle(event.id, { subtitle })} max={80} placeholder="followed by grand dinner" />
              <Field label="Time label" value={style?.timeLabel ?? ''} onChange={timeLabel => setStyle(event.id, { timeLabel })} max={60} placeholder="Brahma Muhurat, 4:00 AM" />
            </div>
          </fieldset>
        })}
        <p className="inv-editor-hint">Each guest sees only the functions on their own link. Venue addresses and map links come from the planner’s places.</p>
      </Group>

      <Group title="Family"><FamilyEditor families={content.families} onChange={families => set({ families })} /></Group>

      <Group title="Venue, dress code and replies">
        <div className="inv-editor-grid">
          <Field label="Dress code" value={content.dressCode} onChange={dressCode => set({ dressCode })} max={200} placeholder="Fancy enough to celebrate, comfortable enough to dance." />
          <Field label="Reply by" type="date" value={content.rsvpBy} onChange={rsvpBy => set({ rsvpBy })} max={10} />
        </div>
      </Group>

      <Group title="Contacts"><ContactEditor contacts={content.contacts} onChange={contacts => set({ contacts })} /></Group>

      <Group title="Closing">
        <div className="inv-editor-grid">
          <Field label="Closing line" value={content.closing} onChange={closing => set({ closing })} max={120} />
          <Field label="Regards line" value={content.regardsIntro} onChange={regardsIntro => set({ regardsIntro })} max={60} />
          <Field label="Hosts" value={content.hosts} onChange={hosts => set({ hosts })} max={200} placeholder="Shri Rakesh & Smt. Renu Shrivastava" />
        </div>
      </Group>

      <Group title="Background music">
        <p>Music starts after the guest opens the envelope, with a large On/Off button. Upload only music you have the right to share,
          such as a licensed or royalty-free shehnai track. MP3, up to 5 MB.</p>
        {settings.hasMusic && <p><strong>{settings.musicName || 'Background music'}</strong></p>}
        <div className="focus-actions">
          <label className="focus-secondary inv-editor-file">{settings.hasMusic ? 'Replace music' : 'Choose an MP3'}
            <input type="file" accept="audio/mpeg,.mp3" onChange={choose} /></label>
          {settings.hasMusic && <button type="button" className="focus-secondary" onClick={() => void uploadMusic()}>Remove music</button>}
        </div>
      </Group>

      <div className="focus-actions inv-editor-save">
        <button type="button" onClick={() => void save()}>{busy ? 'Saving…' : 'Save invitation'}</button>
        <button type="button" className="focus-secondary" disabled={!page} onClick={openPreview}>Preview</button>
      </div>
    </fieldset>
  </details>
}

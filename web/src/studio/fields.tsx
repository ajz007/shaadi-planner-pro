// Form building blocks for the invitation studio. Each one edits a slice of
// the shared invitation content; none of them knows which design is chosen.
import type { Contact, FamilySection, InvitationPerson, OptionValues, TemplateManifest } from '../invitation/model'

const phonePattern = '\\+?[0-9][0-9 \\-]{6,18}[0-9]'
export const timeFormat = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export function Field({ label, value, onChange, max, placeholder, rows, hint, type, pattern }: {
  label: string; value: string; onChange: (value: string) => void; max: number; placeholder?: string; rows?: number; hint?: string
  type?: string; pattern?: string
}) {
  return <label className="focus-field">{label}
    {rows ? <textarea rows={rows} maxLength={max} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} />
      : <input type={type ?? 'text'} maxLength={max} value={value} placeholder={placeholder} pattern={pattern} onChange={event => onChange(event.target.value)} />}
    {hint && <small>{hint}</small>}
  </label>
}

export function Swatch({ colours }: { colours: string[] }) {
  return <span className="studio-swatch" aria-hidden="true">{colours.map(colour => <i key={colour} style={{ background: colour }} />)}</span>
}

// The design options form is generated from the template manifest, so a new
// template brings its own options without a new form.
export function DesignOptions({ design, values, onChange }: { design: TemplateManifest; values: OptionValues; onChange: (values: OptionValues) => void }) {
  return <div className="inv-editor-grid">{design.options.map(option => {
    const set = (value: string | boolean) => onChange({ ...values, [option.key]: value })
    if (option.type === 'boolean') return <label className="inv-editor-toggle" key={option.key}>
      <input type="checkbox" checked={values[option.key] === true} onChange={event => set(event.target.checked)} />{option.label}</label>
    if (option.type === 'choice' && option.choices.every(choice => choice.swatch)) return <fieldset className="studio-swatches" key={option.key}>
      <legend>{option.label}</legend>
      {option.choices.map(choice => <label key={choice.value} className={values[option.key] === choice.value ? 'is-selected' : undefined}>
        <input type="radio" name={'option-' + option.key} value={choice.value} checked={values[option.key] === choice.value}
          onChange={() => set(choice.value)} />
        <Swatch colours={choice.swatch!} />{choice.label}
      </label>)}
    </fieldset>
    if (option.type === 'choice') return <label className="focus-field" key={option.key}>{option.label}
      <select value={String(values[option.key])} onChange={event => set(event.target.value)}>
        {option.choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
      </select>{option.help && <small>{option.help}</small>}</label>
    return <Field key={option.key} label={option.label} value={String(values[option.key] ?? '')} onChange={set} max={option.max} hint={option.help} />
  })}</div>
}

const personExamples = {
  Groom: { name: 'Aarav Sharma', shortName: 'Aarav', parentLabel: 'Son of', parents: 'Shri Rajesh Sharma & Smt. Sunita Sharma' },
  Bride: { name: 'Meera Iyer', shortName: 'Meera', parentLabel: 'Daughter of', parents: 'Shri Venkat Iyer & Smt. Lakshmi Iyer' },
}

export function PersonFields({ title, person, onChange }: { title: 'Groom' | 'Bride'; person: InvitationPerson; onChange: (person: InvitationPerson) => void }) {
  const example = personExamples[title]
  const set = (key: keyof InvitationPerson) => (value: string) => onChange({ ...person, [key]: value })
  return <fieldset className="inv-editor-box">
    <legend>{title}</legend>
    <div className="inv-editor-grid">
      <Field label="Honorific" value={person.honorific} onChange={set('honorific')} max={30} placeholder="Chi." />
      <Field label="Full name" value={person.name} onChange={set('name')} max={80} placeholder={example.name} />
      <Field label="Name on the cover" value={person.shortName} onChange={set('shortName')} max={30} placeholder={example.shortName} />
      <Field label="Parents label" value={person.parentLabel} onChange={set('parentLabel')} max={40} placeholder={example.parentLabel} />
    </div>
    <Field label="Parents" value={person.parents} onChange={set('parents')} max={200} placeholder={example.parents} />
  </fieldset>
}

const sampleFamily = (heading: string): FamilySection => ({
  heading,
  cards: [
    { title: 'In loving memory', lines: [{ relation: 'Nanaji and Naniji', names: '' }] },
    { title: 'Eager to welcome you', lines: [{ relation: 'Chachaji and Chachiji', names: '' }, { relation: 'Mausaji and Mausiji', names: '' }] },
    { title: 'With love from', lines: [{ relation: 'Brothers and sisters', names: '' }] },
  ],
})

export function FamilyEditor({ families, onChange }: { families: FamilySection[]; onChange: (families: FamilySection[]) => void }) {
  const update = (index: number, family: FamilySection) => onChange(families.map((item, i) => i === index ? family : item))
  return <>
    <p>Group relatives into cards. Put one name or couple per line. Empty rows are left out.</p>
    {families.map((family, f) => <fieldset className="inv-editor-box" key={f}>
      <legend>Family section {f + 1}</legend>
      <Field label="Heading" value={family.heading} onChange={heading => update(f, { ...family, heading })} max={80} placeholder="The Groom’s Family" />
      {family.cards.map((card, c) => {
        const setCard = (next: typeof card) => update(f, { ...family, cards: family.cards.map((item, i) => i === c ? next : item) })
        return <div className="inv-editor-card" key={c}>
          <Field label={'Card ' + (c + 1) + ' title'} value={card.title} onChange={title => setCard({ ...card, title })} max={80} placeholder="Eager to welcome you" />
          {card.lines.map((line, l) => {
            const setLine = (next: typeof line) => setCard({ ...card, lines: card.lines.map((item, i) => i === l ? next : item) })
            return <div className="inv-editor-grid" key={l}>
              <Field label="Relation" value={line.relation} onChange={relation => setLine({ ...line, relation })} max={80} placeholder="Mamaji and Mamiji" />
              <Field label="Names" rows={2} value={line.names} onChange={names => setLine({ ...line, names })} max={600} placeholder="Shri Arun Verma & Smt. Neha Verma" />
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

export function ContactEditor({ contacts, onChange }: { contacts: Contact[]; onChange: (contacts: Contact[]) => void }) {
  const update = (index: number, contact: Contact) => onChange(contacts.map((item, i) => i === index ? contact : item))
  return <>
    <p>Guests can call or WhatsApp these people from the invitation. Ten-digit numbers are treated as Indian numbers.</p>
    {contacts.map((contact, i) => <div className="inv-editor-grid" key={i}>
      <Field label="Name" value={contact.name} onChange={name => update(i, { ...contact, name })} max={80} />
      <Field label="Role" value={contact.role} onChange={role => update(i, { ...contact, role })} max={60} placeholder="Groom’s brother" />
      <Field label="Phone" type="tel" pattern={phonePattern} value={contact.phone} onChange={phone => update(i, { ...contact, phone })} max={20} placeholder="+91 98XXX XXXXX" />
      <button type="button" className="focus-secondary" onClick={() => onChange(contacts.filter((_, index) => index !== i))}>Remove</button>
    </div>)}
    {contacts.length < 6 && <div className="focus-actions">
      <button type="button" className="focus-secondary" onClick={() => onChange([...contacts, { name: '', role: '', phone: '' }])}>Add contact</button>
    </div>}
  </>
}

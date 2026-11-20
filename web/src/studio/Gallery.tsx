import { useEffect, useMemo, useRef, useState } from 'react'
import { optionsFor, templates } from '../invitation/model'
import type { InvitationDesign, TemplateManifest } from '../invitation/model'
import type { PreviewDraft } from '../invitation/InvitationPreview'
import { PreviewFrame } from './PreviewFrame'
import { Swatch } from './fields'

// Each template folder ships a phone screenshot of the opened invitation.
const thumbnails = import.meta.glob<string>('../invitation/templates/*/preview.png', { eager: true, query: '?url', import: 'default' })
const thumbnailFor = (id: string) => thumbnails['../invitation/templates/' + id + '/preview.png']

const moodLabels: Record<string, string> = {
  festive: 'Festive', royal: 'Royal', minimal: 'Minimal', romantic: 'Romantic', serene: 'Serene',
  playful: 'Playful', glamorous: 'Glamorous', heritage: 'Heritage',
}
const regionLabels: Record<string, string> = { 'all-india': 'All of India', north: 'North', south: 'South', east: 'East', west: 'West' }
const timeLabels: Record<string, string> = { day: 'Daytime', night: 'Evening', any: 'Day or evening' }

const palettesOf = (template: TemplateManifest) => {
  const option = template.options.find(option => option.key === 'palette')
  return option?.type === 'choice' ? option.choices : []
}

export function Gallery({ current, draftFor, onUse }: {
  current: string
  draftFor: (design: InvitationDesign) => PreviewDraft
  onUse: (design: InvitationDesign) => void
}) {
  const [moods, setMoods] = useState<string[]>([])
  const [region, setRegion] = useState('')
  const [time, setTime] = useState('')
  const [open, setOpen] = useState<InvitationDesign>()
  const dialog = useRef<HTMLDialogElement>(null)

  const shown = templates.filter(template =>
    (!moods.length || moods.some(mood => template.tags.mood.includes(mood))) &&
    (!region || template.tags.region.includes(region) || template.tags.region.includes('all-india')) &&
    (!time || template.tags.time === time || template.tags.time === 'any'))
  const usedMoods = useMemo(() => [...new Set(templates.flatMap(template => template.tags.mood))], [])

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal()
    if (!open && dialog.current?.open) dialog.current.close()
  }, [open])

  const preview = (template: TemplateManifest, palette?: string) => setOpen({
    id: template.id, version: template.version, options: optionsFor(template, palette ? { palette } : {}),
  })
  const openTemplate = open && templates.find(template => template.id === open.id)

  return <section className="studio-gallery" aria-labelledby="studio-gallery-title">
    <div className="studio-gallery-head">
      <div>
        <h2 id="studio-gallery-title">Choose a design</h2>
        <p>Every design uses your details, so you can switch at any time without retyping. Open one to see it with your names and functions.</p>
      </div>
      <p className="studio-count">{shown.length} of {templates.length} designs</p>
    </div>
    <div className="studio-filters">
      <div className="studio-chips" role="group" aria-label="Mood">
        {usedMoods.map(mood => <button key={mood} type="button" aria-pressed={moods.includes(mood)}
          onClick={() => setMoods(current => current.includes(mood) ? current.filter(item => item !== mood) : [...current, mood])}>
          {moodLabels[mood] ?? mood}</button>)}
      </div>
      <label className="focus-field">Region<select value={region} onChange={event => setRegion(event.target.value)}>
        <option value="">Any region</option>
        {Object.entries(regionLabels).filter(([key]) => key !== 'all-india').map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label className="focus-field">Time of day<select value={time} onChange={event => setTime(event.target.value)}>
        <option value="">Any time</option><option value="day">Daytime</option><option value="night">Evening</option>
      </select></label>
      {(moods.length > 0 || region || time) && <button type="button" className="focus-secondary"
        onClick={() => { setMoods([]); setRegion(''); setTime('') }}>Clear filters</button>}
    </div>
    {shown.length === 0 && <p role="status">No designs match these filters yet. New designs are added regularly.</p>}
    <ul className="studio-cards">
      {shown.map(template => {
        const thumbnail = thumbnailFor(template.id)
        const palettes = palettesOf(template)
        return <li key={template.id} className={'studio-card' + (template.id === current ? ' is-current' : '')}>
          <button type="button" className="studio-card-image" onClick={() => preview(template)} aria-label={'Preview ' + template.name}>
            {thumbnail ? <img src={thumbnail} alt="" loading="lazy" />
              : <span className="studio-card-placeholder" style={{ background: `linear-gradient(135deg, ${(palettes[0]?.swatch ?? ['#f5e6d3', '#e8c9a0']).join(', ')})` }} />}
            {template.id === current && <span className="studio-badge">Your design</span>}
            {template.premium && <span className="studio-badge is-premium">Premium</span>}
          </button>
          <div className="studio-card-body">
            <h3>{template.name}</h3>
            <p>{template.description}</p>
            <div className="studio-card-palettes" aria-label="Palettes">
              {palettes.map(choice => choice.swatch && <button type="button" key={choice.value} title={choice.label}
                aria-label={'Preview in ' + choice.label} onClick={() => preview(template, choice.value)}><Swatch colours={choice.swatch} /></button>)}
            </div>
            <p className="studio-tags">{[...template.tags.mood.map(mood => moodLabels[mood] ?? mood), timeLabels[template.tags.time]].join(' · ')}</p>
            <div className="focus-actions">
              <button type="button" onClick={() => preview(template)}>Preview</button>
              <button type="button" className="focus-secondary" onClick={() => onUse({ id: template.id, version: template.version, options: optionsFor(template) })}>
                {template.id === current ? 'Keep this design' : 'Use this design'}</button>
            </div>
          </div>
        </li>
      })}
    </ul>

    <dialog ref={dialog} className="studio-dialog" onClose={() => setOpen(undefined)} aria-labelledby="studio-dialog-title">
      {open && openTemplate && <>
        <header>
          <div>
            <h2 id="studio-dialog-title">{openTemplate.name}</h2>
            <p>{openTemplate.description}</p>
          </div>
          <button type="button" className="focus-secondary" onClick={() => setOpen(undefined)}>Close</button>
        </header>
        <div className="studio-dialog-body">
          <PreviewFrame draft={draftFor(open)} label={openTemplate.name + ' preview'} />
          <aside>
            <h3>Palette</h3>
            <div className="studio-dialog-palettes">
              {palettesOf(openTemplate).map(choice => <button key={choice.value} type="button" aria-pressed={open.options.palette === choice.value}
                onClick={() => setOpen({ ...open, options: { ...open.options, palette: choice.value } })}>
                {choice.swatch && <Swatch colours={choice.swatch} />}{choice.label}</button>)}
            </div>
            <p className="studio-tags">{openTemplate.tags.mood.map(mood => moodLabels[mood] ?? mood).join(' · ')} · {timeLabels[openTemplate.tags.time]}
              {' · '}{openTemplate.tags.region.map(region => regionLabels[region] ?? region).join(', ')}</p>
            <button type="button" onClick={() => { onUse(open); setOpen(undefined) }}>
              {open.id === current ? 'Keep this design' : 'Use this design'}</button>
            <p className="inv-editor-hint">Shown with your own names and functions. Tap the preview to open the invitation.</p>
          </aside>
        </div>
      </>}
    </dialog>
  </section>
}

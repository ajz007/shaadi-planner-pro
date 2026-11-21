import { Fragment, useEffect, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { EventArt, Icon } from '../../art'
import { downloadCalendar, mapLink, reducedMotion, useCountdown, useFitText, useFonts, useReveal, whatsappNumber } from '../../effects'
import { coupleNames, iconFor } from '../../model'
import { dayKey, dayLabel, lines, longDate, timeLabel } from '../../format'
import { useMusic } from '../../music'
import type { InvitationContent, InvitationEvent, InvitationPerson, SectionKey } from '../../model'
import type { TemplateProps } from '../../types'
import { SectionAnchor } from '../../SectionAnchor'
import { BananaLeaf, BananaPlant, Bell, Gopuram, JasmineStrand, JasmineSwag, KnotTile, Kolam, Lamp, Pillar, SymbolPlate, useKolam } from './art'
import './style.css'

const fonts = 'https://fonts.googleapis.com/css2?family=Marcellus&family=Alegreya:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Noto+Serif+Devanagari:wght@500;600&display=swap'
const lockClass = 't-temple-kolam-locked'

type Stage = 'closed' | 'drawing' | 'lit' | 'leaving' | 'done'

const dayWords = ['Day one', 'Day two', 'Day three', 'Day four', 'Day five', 'Day six', 'Day seven']
const strands = [
  { left: 3, length: 9, delay: 0 }, { left: 13, length: 6, delay: -1.2 }, { left: 23, length: 11, delay: -2.1 }, { left: 31, length: 4, delay: -0.6 },
  { left: 65, length: 4, delay: -1.6 }, { left: 73, length: 11, delay: -0.3 }, { left: 83, length: 7, delay: -2.4 }, { left: 93, length: 10, delay: -1 },
]

const crownStrands = [
  { left: 2, length: 7, delay: -.4 }, { left: 9, length: 4, delay: -1.5 }, { left: 16, length: 6, delay: -2.6 },
  { left: 80, length: 6, delay: -1.1 }, { left: 87, length: 4, delay: -2 }, { left: 94, length: 7, delay: -.2 },
]

function Opening({ names, title, date, greeting, hint, stage, onOpen, onContinue }: {
  names: [string, string]; title: string; date: string; greeting?: string; hint: string; stage: Stage; onOpen: () => void; onContinue: () => void
}) {
  const kolam = useKolam('lamp')
  const first = useRef<HTMLSpanElement>(null)
  const second = useRef<HTMLSpanElement>(null)
  useFitText(first, names[0])
  useFitText(second, names[1])
  const couple = names.filter(Boolean).join(' and ')
  return <div className="tk-opening" data-stage={stage} onClick={() => stage === 'lit' && onContinue()}>
    <div className="tk-opening-glow" aria-hidden="true" />
    <div className="tk-opening-strands" aria-hidden="true">
      {strands.map((strand, i) => <JasmineStrand key={i} length={strand.length} className="tk-opening-strand"
        style={{ left: strand.left + '%', animationDelay: strand.delay + 's' }} />)}
    </div>
    <div className="tk-opening-words">
      {greeting && <p className="tk-opening-dear">Dear {greeting},</p>}
      <p className="tk-opening-title">{title || 'Shubh Vivah'}</p>
      <p className="tk-opening-names" aria-hidden={stage === 'closed' || stage === 'drawing'}>
        <span ref={first}>{names[0]}</span>
        {names[1] && <><em>&amp;</em><span ref={second}>{names[1]}</span></>}
      </p>
      <p className="tk-opening-date">{date}</p>
    </div>
    <div className="tk-threshold">
      <div className="tk-floor" aria-hidden="true">
        <Kolam shape={kolam} className="tk-opening-kolam" duration={1.5} pad={30} />
      </div>
      <button type="button" className="tk-lamp-button" data-open
        onClick={event => { event.stopPropagation(); if (stage === 'closed') onOpen(); else if (stage === 'lit') onContinue() }}
        aria-label={'Light the lamp and open the wedding invitation of ' + couple}>
        <span className="tk-lamp-halo" />
        <Lamp className="tk-opening-lamp" />
      </button>
    </div>
    <p className="tk-opening-hint" aria-live="polite">{stage === 'lit' ? 'Tap anywhere to step inside' : hint ||
      <>Touch the lamp to light it and open {names[0]}{names[1] && <> &amp; {names[1]}</>}’s invitation</>}</p>
  </div>
}

function Head({ kicker, title, id }: { kicker?: string; title: string; id: string }) {
  return <header className="tk-head" data-reveal>
    <div className="tk-head-garland" aria-hidden="true">
      <Bell className="tk-head-bell is-l" />
      <JasmineSwag className="tk-head-swag" sag={14} />
      <Bell className="tk-head-bell is-r" />
    </div>
    {kicker && <p className="tk-kicker">{kicker}</p>}
    <h2 id={id}>{title}</h2>
    <BananaLeaf className="tk-head-leaf" />
  </header>
}

function Countdown({ target }: { target: number }) {
  const time = useCountdown(target)
  if (time.done) return null
  const cells: [number, string][] = [[time.days, 'Days'], [time.hours, 'Hours'], [time.minutes, 'Minutes'], [time.seconds, 'Seconds']]
  return <section className="tk-section tk-countdown" aria-labelledby="tk-count">
    <p className="tk-kicker" id="tk-count" data-reveal>Until the auspicious hour</p>
    <div className="tk-tiles" data-reveal role="timer" aria-live="off">
      {cells.map(([value, label]) => <div className="tk-tile-cell" key={label}>
        <span className="tk-tile-face"><KnotTile /><strong>{String(value).padStart(2, '0')}</strong></span>
        <span className="tk-tile-label">{label}</span>
      </div>)}
    </div>
  </section>
}

function Person({ label, person }: { label: string; person: InvitationPerson }) {
  return <article className="tk-arch tk-person" data-reveal>
    <p className="tk-tag">{label}</p>
    {person.honorific && <p className="tk-honorific">{person.honorific}</p>}
    <h3>{person.name}</h3>
    {person.parents && <>
      <span className="tk-dots" aria-hidden="true"><i /><i /><i /></span>
      <p className="tk-label">{person.parentLabel}</p>
      <p className="tk-parents">{person.parents}</p>
    </>}
  </article>
}

function Steps({ events, content, zone, sharedPlace }: { events: InvitationEvent[]; content: InvitationContent; zone: string; sharedPlace: string }) {
  const days = new Map<string, InvitationEvent[]>()
  for (const event of events) {
    const key = dayKey(event.startsAt, zone)
    days.set(key, [...(days.get(key) ?? []), event])
  }
  return <ol className="tk-days">
    {[...days.values()].map((dayEvents, d) => <li key={dayEvents[0].id} className="tk-day">
      <p className="tk-tablet" data-reveal>
        <span className="tk-tablet-n">{dayWords[d] ?? 'Day ' + (d + 1)}</span>
        <span className="tk-tablet-date">{dayLabel(dayEvents[0].startsAt, zone)}</span>
      </p>
      <ol className="tk-steps" style={{ '--count': dayEvents.length } as CSSProperties}>
        {dayEvents.map((event, i) => {
          const style = content.events[event.id]
          const link = mapLink(event)
          return <li key={event.id} className="tk-step" data-reveal style={{ '--i': i } as CSSProperties}>
            <span className="tk-step-icon"><EventArt icon={iconFor(event, style)} /></span>
            <div className="tk-step-text">
              <h3>{event.name}</h3>
              {style?.subtitle && <p className="tk-step-sub">{style.subtitle}</p>}
              {!sharedPlace && event.place && <p className="tk-step-place">
                {Icon.pin}<span>{event.place}</span>
                {link && <a href={link} target="_blank" rel="noreferrer">Directions</a>}
              </p>}
            </div>
            <p className="tk-step-time">{style?.timeLabel || timeLabel(event.startsAt, zone)}</p>
          </li>
        })}
      </ol>
    </li>)}
  </ol>
}

function Families({ content }: { content: InvitationContent }) {
  return <>{content.families.map((family, i) => <section className="tk-section" key={i} aria-labelledby={'tk-family-' + i}>
    <Head kicker="Our people" title={family.heading || 'The Families'} id={'tk-family-' + i} />
    <div className="tk-grid">
      {family.cards.map((card, j) => <article className="tk-arch tk-family" key={j} data-reveal>
        {card.title && <h3>{card.title}</h3>}
        {card.lines.map((line, k) => <div className="tk-family-line" key={k}>
          {line.relation && <p className="tk-label">{line.relation}</p>}
          {lines(line.names).map(name => <p className="tk-name" key={name}>{name}</p>)}
        </div>)}
      </article>)}
    </div>
  </section>)}</>
}

function ClosingKolam() {
  const kolam = useKolam('flower')
  return <div className="tk-closing-kolam" data-reveal><Kolam shape={kolam} duration={1.3} pad={24} /></div>
}

export default function TempleKolam({ page, invitation, manifest: design, options, greeting, rsvp, loadMusic, preview }: TemplateProps) {
  useFonts(fonts)
  const { content, events } = invitation
  const palette = String(options.palette ?? 'temple-red')
  const names = coupleNames(content, page.design.heading || page.name)
  const [stage, setStage] = useState<Stage>('closed')
  const [still] = useState(reducedMotion)
  const root = useRef<HTMLElement>(null)
  const firstName = useRef<HTMLSpanElement>(null)
  const secondName = useRef<HTMLSpanElement>(null)
  const closingNames = useRef<HTMLParagraphElement>(null)
  const timers = useRef<number[]>([])
  const music = useMusic(loadMusic, invitation.hasMusic)
  const open = stage === 'done'
  useReveal(root, open)
  useFitText(firstName, names[0])
  useFitText(secondName, names[1])

  const coupleTitle = names.filter(Boolean).join(' & ')
  useFitText(closingNames, coupleTitle)
  useEffect(() => {
    const title = document.title
    document.title = coupleTitle + ' | Wedding Invitation'
    return () => { document.title = title }
  }, [coupleTitle])
  useEffect(() => {
    document.documentElement.classList.toggle(lockClass, !open)
    return () => document.documentElement.classList.remove(lockClass)
  }, [open])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const stageRef = useRef<Stage>('closed')
  const go = (next: Stage) => { stageRef.current = next; setStage(next) }
  const later = (ms: number, work: () => void) => { timers.current.push(window.setTimeout(work, ms)) }
  const finish = () => {
    if (stageRef.current === 'leaving' || stageRef.current === 'done') return
    go('leaving')
    later(still ? 0 : 900, () => { go('done'); window.scrollTo(0, 0) })
    later(still ? 50 : 1000, music.start)
  }
  const light = () => {
    if (still) { finish(); return }
    go('drawing')
    later(2100, () => { if (stageRef.current === 'drawing') go('lit') })
    later(7100, () => { if (stageRef.current === 'lit') finish() })
  }

  const sharedPlace = events.length > 0 && events.every(event => event.place && event.place === events[0].place) ? events[0].place : ''
  const places = [...new Map(events.filter(event => event.place).map(event => [event.place, event])).values()]
  const target = events.length ? Date.parse(events[0].startsAt) : Date.parse(page.date + 'T00:00:00Z')
  const calendar = () => downloadCalendar(names.filter(Boolean).join('-') + '-wedding.ics', coupleTitle + ' Wedding', events,
    content.dressCode ? 'Dress code: ' + content.dressCode : '')
  const people: [string, InvitationPerson][] = content.brideFirst
    ? [['The Bride', content.bride], ['The Groom', content.groom]] : [['The Groom', content.groom], ['The Bride', content.bride]]
  const shownPeople = people.filter(([, person]) => person.name)
  const hasBlessing = !!(content.symbols.length || content.invocation || content.shloka || content.deity || content.elders || content.intro || page.design.coverPhoto)
  const toRsvp = (event: MouseEvent) => { event.preventDefault(); document.getElementById('rsvp')?.scrollIntoView({ behavior: still ? 'auto' : 'smooth' }) }

  const render: Record<SectionKey, () => ReactNode> = {
    hero: () => <section className="tk-section tk-hero" aria-label={coupleTitle}>
      <div className="tk-crown" aria-hidden="true">
        <span className="tk-sun" />
        {crownStrands.map((strand, i) => <JasmineStrand key={i} length={strand.length} className="tk-crown-strand"
          style={{ left: strand.left + '%', animationDelay: strand.delay + 's' }} />)}
        <Gopuram className="tk-crown-gopuram" />
      </div>
      <div className="tk-wall" aria-hidden="true" />
      <div className="tk-hero-body">
        {greeting && <p className="tk-greeting" data-reveal>Dear {greeting},</p>}
        {content.title && <p className="tk-hero-title" data-reveal>{content.title}</p>}
        <h1 className="tk-names" data-reveal>
          <span ref={firstName}>{names[0]}</span>
          {names[1] && <><span className="tk-amp">&amp;</span><span ref={secondName}>{names[1]}</span></>}
        </h1>
        <p className="tk-date" data-reveal>{longDate(page.date)}</p>
        <div className="tk-actions" data-reveal>
          {events.length > 0 && <button type="button" className="tk-button" onClick={calendar}>{Icon.calendar}Keep the date</button>}
          {rsvp && <a className="tk-button is-quiet" href="#rsvp" onClick={toRsvp}>Reply now</a>}
        </div>
      </div>
    </section>,
    blessing: () => hasBlessing && <section className="tk-section tk-blessing">
      {content.symbols.length > 0 && <div className="tk-plates" data-reveal>
        {content.symbols.map((symbol, i) => <SymbolPlate key={symbol} symbol={symbol} large={content.symbols.length === 3 ? i === 1 : i === 0} />)}
      </div>}
      {content.invocation && <p className="tk-invocation" data-reveal lang="hi">{content.invocation}</p>}
      {content.shloka && <p className="tk-shloka" data-reveal lang="sa">{lines(content.shloka).map(line => <span key={line}>{line}</span>)}</p>}
      {content.deity && <div className="tk-blessed" data-reveal>
        {content.blessingIntro && <p className="tk-soft">{content.blessingIntro}</p>}
        <p className="tk-deity">{content.deity}</p>
      </div>}
      {content.elders && <div className="tk-blessed" data-reveal>
        {content.eldersIntro && <p className="tk-soft">{content.eldersIntro}</p>}
        <p className="tk-elders">{content.elders}</p>
        {content.eldersNote && <p className="tk-note">{content.eldersNote}</p>}
      </div>}
      {page.design.coverPhoto && <figure className="tk-photo" data-reveal>
        <img src={'data:image/jpeg;base64,' + page.design.coverPhoto} alt={coupleTitle} />
      </figure>}
      {content.intro && <p className="tk-intro" data-reveal>{content.intro}</p>}
    </section>,
    couple: () => shownPeople.length > 0 && <section className="tk-section tk-couple" aria-labelledby="tk-couple">
      <h2 className="tk-hidden" id="tk-couple">{shownPeople.map(([label]) => label).join(' and ')}</h2>
      <div className="tk-pair">
        {shownPeople.map(([label, person], i) => <Fragment key={label}>
          {i > 0 && <span className="tk-pair-amp" aria-hidden="true"><span>&amp;</span></span>}
          <Person label={label} person={person} />
        </Fragment>)}
      </div>
    </section>,
    countdown: () => <Countdown target={target} />,
    events: () => events.length > 0 && <section className="tk-section" aria-labelledby="tk-events">
      <Head kicker="Step by step" title="The Ceremonies" id="tk-events" />
      {sharedPlace && <a className="tk-chip" data-reveal href={mapLink(events[0]) || undefined} target="_blank" rel="noreferrer">
        {Icon.pin}<span>All ceremonies at <strong>{sharedPlace}</strong></span>
      </a>}
      <Steps events={events} content={content} zone={page.timeZone} sharedPlace={sharedPlace} />
    </section>,
    rsvp: () => rsvp && <section className="tk-section tk-rsvp" id="rsvp" aria-labelledby="tk-rsvp">
      <Head kicker="Kindly reply" title="Shall we lay a leaf for you?" id="tk-rsvp" />
      {content.rsvpBy && <p className="tk-soft tk-rsvp-by" data-reveal>We would love to hear from you by {longDate(content.rsvpBy)}</p>}
      <div className="tk-rsvp-body" data-reveal>{rsvp}</div>
    </section>,
    family: () => <Families content={content} />,
    venue: () => (places.length > 0 || content.dressCode) && <section className="tk-section tk-venue" aria-labelledby="tk-venue">
      <Head kicker="Where the lamps are lit" title={sharedPlace || (places.length === 1 ? places[0].place : 'The Venues')} id="tk-venue" />
      <div className="tk-mandapam">
        <Pillar className="tk-mandapam-pillar is-l" /><Pillar className="tk-mandapam-pillar is-r" />
        <div className="tk-mandapam-body">
          {places.map(place => <article className="tk-place" key={place.place} data-reveal>
            <span className="tk-place-icon">{Icon.pin}</span>
            <h3>{place.place}</h3>
            {place.address && <p className="tk-address">{place.address}</p>}
            {!sharedPlace && mapLink(place) && <a className="tk-link" href={mapLink(place)} target="_blank" rel="noreferrer">Get directions</a>}
          </article>)}
          {content.dressCode && <article className="tk-place is-attire" data-reveal>
            <p className="tk-label">What to wear</p>
            <p className="tk-address">{content.dressCode}</p>
          </article>}
          <div className="tk-actions" data-reveal>
            {events.length > 0 && <button type="button" className="tk-button is-quiet" onClick={calendar}>{Icon.calendar}Add to Calendar</button>}
            {sharedPlace && mapLink(events[0]) && <a className="tk-button" href={mapLink(events[0])} target="_blank" rel="noreferrer">{Icon.nav}Get Directions</a>}
          </div>
        </div>
      </div>
    </section>,
    contacts: () => content.contacts.length > 0 && <section className="tk-section" aria-labelledby="tk-contacts">
      <Head kicker="For any help on the way" title="Call on us" id="tk-contacts" />
      <ul className="tk-contacts">
        {content.contacts.map(contact => <li className="tk-contact" key={contact.name + contact.phone} data-reveal>
          <div className="tk-contact-who">
            <h3>{contact.name}</h3>
            {contact.role && <p className="tk-label">{contact.role}</p>}
          </div>
          <div className="tk-contact-actions">
            <a className="tk-button is-small" href={'tel:' + contact.phone.replace(/[\s-]/g, '')} aria-label={'Call ' + contact.name}>{Icon.phone}Call</a>
            <a className="tk-button is-small is-quiet" href={'https://wa.me/' + whatsappNumber(contact.phone)} target="_blank" rel="noreferrer"
              aria-label={'WhatsApp ' + contact.name}>{Icon.chat}WhatsApp</a>
          </div>
        </li>)}
      </ul>
    </section>,
    closing: () => <section className="tk-section tk-closing" aria-label="Closing">
      <ClosingKolam />
      {content.closing && <p className="tk-closing-line" data-reveal>{content.closing}</p>}
      <p className="tk-closing-names" data-reveal ref={closingNames}>{names[0]}{names[1] && <><em>&amp;</em>{names[1]}</>}</p>
      {sharedPlace && <div className="tk-blessed" data-reveal>
        <p className="tk-elders">{sharedPlace}</p>
        {events[0].address && <p className="tk-note">{events[0].address}</p>}
      </div>}
      {content.hosts && <div className="tk-blessed" data-reveal>
        {content.regardsIntro && <p className="tk-soft">{content.regardsIntro}</p>}
        <p className="tk-hosts">{content.hosts}</p>
      </div>}
      <div className="tk-gate" aria-hidden="true">
        <BananaPlant className="tk-gate-plant is-l" /><BananaPlant className="tk-gate-plant is-r" />
      </div>
      <div className="tk-wall is-foot" aria-hidden="true" />
    </section>,
  }
  const order: SectionKey[] = design.sections.includes('rsvp') ? design.sections : [...design.sections, 'rsvp']

  return <div className="t-temple-kolam" data-palette={palette} data-stage={stage} data-bells={options.bells === false ? 'still' : 'swing'}>
    {stage !== 'done' && <Opening names={names} title={content.title} date={longDate(page.date)} greeting={greeting} hint={String(options.lampLine ?? '')}
      stage={stage} onOpen={light} onContinue={finish} />}
    <div className="tk-backdrop" aria-hidden="true" />
    {preview && <p className="tk-preview">Preview · This is how your guests will see the invitation</p>}
    <main className="tk-main" ref={root} aria-hidden={!open && stage !== 'leaving'}>
      {order.map(key => <Fragment key={key}><SectionAnchor section={key} />{render[key]()}</Fragment>)}
    </main>

    {music.available && open && <button type="button" className={'tk-music' + (music.blocked ? ' is-pulse' : '')}
      aria-pressed={music.playing} onClick={music.toggle}>
      {music.playing ? Icon.soundOn : Icon.soundOff}<span>{music.playing ? 'Music On' : 'Music Off'}</span>
    </button>}
  </div>
}

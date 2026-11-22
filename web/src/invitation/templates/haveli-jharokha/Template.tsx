import { createContext, Fragment, useContext, useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { EventArt, Icon } from '../../art'
import { downloadCalendar, mapLink, reducedMotion, useCountdown, useFitText, useFonts, useReveal, whatsappNumber } from '../../effects'
import { coupleNames, iconFor } from '../../model'
import { dayKey, dayLabel, lines, longDate, timeLabel } from '../../format'
import { useMusic } from '../../music'
import type { InvitationContent, InvitationEvent, InvitationPerson, SectionKey } from '../../model'
import type { TemplateProps } from '../../types'
import { SectionAnchor } from '../../SectionAnchor'
import { ArchCrown, Diya, Gate, JaliPattern, JaliShade, Jharokha, Pigeon, Plate, Rooftop, Skyline, TileBand, useArch, Wall } from './art'
import './style.css'

const fonts = 'https://fonts.googleapis.com/css2?family=Yeseva+One&family=Crimson+Pro:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=Martel:wght@400;600&display=swap'
const lockClass = 't-haveli-jharokha-locked'

type Stage = 'closed' | 'opening' | 'open' | 'leaving' | 'done'
const dayWords = ['First day', 'Second day', 'Third day', 'Fourth day', 'Fifth day', 'Sixth day', 'Seventh day']

// The lattice-shadow pattern is defined once per invitation and shared by every window.
const ShadeContext = createContext('')

function Window({ size = 232, className, crown, children, label, id }: {
  size?: number; className?: string; crown?: ReactNode; children: ReactNode; label?: string; id?: string
}) {
  const shade = useContext(ShadeContext)
  const shape = useArch(size)
  return <article className={'hj-window ' + (className ?? '')} data-reveal aria-label={label} id={id}
    style={{ '--crown-h': shape.h + 'px', '--slot-y': (shape.base * 0.56 - shape.h + 10) + 'px' } as CSSProperties}>
    <ArchCrown width={size} rosette={!crown} />
    {crown && <span className="hj-slot">{crown}</span>}
    {shade && <JaliShade pattern={shade} />}
    <div className="hj-window-body">{children}</div>
  </article>
}

function OpeningView({ names, date }: { names: [string, string]; date: string }) {
  const first = useRef<HTMLSpanElement>(null)
  const second = useRef<HTMLSpanElement>(null)
  useFitText(first, names[0])
  useFitText(second, names[1])
  return <span className="hj-view-inner">
    <span className="hj-view-sun" />
    <span className="hj-view-words">
      <span className="hj-view-names">
        <span ref={first}>{names[0]}</span>
        {names[1] && <><em>&amp;</em><span ref={second}>{names[1]}</span></>}
      </span>
      <span className="hj-view-date">{date}</span>
    </span>
    <Skyline className="hj-view-city" />
    <span className="hj-view-flood" />
  </span>
}

function Opening({ names, title, date, greeting, hint, stage, pigeons, onOpen, onContinue }: {
  names: [string, string]; title: string; date: string; greeting?: string; hint: string; stage: Stage; pigeons: boolean
  onOpen: () => void; onContinue: () => void
}) {
  const couple = names.filter(Boolean).join(' and ')
  return <div className="hj-opening" data-stage={stage} onClick={() => stage === 'open' && onContinue()}>
    <div className="hj-op-wall" aria-hidden="true"><Wall /></div>
    <div className="hj-op-top">
      {greeting && <p className="hj-op-dear">Dear {greeting},</p>}
    </div>
    <div className="hj-op-house">
      <span className="hj-op-rays" aria-hidden="true" />
      <button type="button" className="hj-op-window" data-open
        onClick={event => { event.stopPropagation(); if (stage === 'closed') onOpen(); else if (stage === 'open') onContinue() }}
        aria-label={'Open the jharokha shutters and the wedding invitation of ' + couple}>
        <Jharokha className="hj-op-jharokha" view={<OpeningView names={names} date={date} />} />
      </button>
      {pigeons && <>
        <Pigeon className="hj-op-pigeon is-a" />
        <Pigeon className="hj-op-pigeon is-b" />
      </>}
    </div>
    <div className="hj-op-foot">
      <p className="hj-op-plaque"><span>{title || 'Shubh Vivah'}</span><span className="hj-op-plaque-date">{date}</span></p>
      <p className="hj-op-hint" aria-live="polite">{stage === 'open' ? 'Tap anywhere to step through the window' : hint ||
        <>Tap the shutters to open your invitation to {names[0]}{names[1] && <> &amp; {names[1]}</>}’s wedding</>}</p>
    </div>
  </div>
}

function Head({ kicker, title, id }: { kicker?: string; title: string; id: string }) {
  return <header className="hj-head" data-reveal>
    {kicker && <p className="hj-kicker">{kicker}</p>}
    <h2 id={id}>{title}</h2>
    <span className="hj-rule" aria-hidden="true"><i /></span>
  </header>
}

function Countdown({ target }: { target: number }) {
  const time = useCountdown(target)
  if (time.done) return null
  const cells: [number, string][] = [[time.days, 'Days'], [time.hours, 'Hours'], [time.minutes, 'Minutes'], [time.seconds, 'Seconds']]
  return <section className="hj-section hj-countdown" aria-labelledby="hj-count">
    <div className="hj-plaque" data-reveal>
      <p className="hj-kicker" id="hj-count">The courtyard fills in</p>
      <div className="hj-count" role="timer" aria-live="off">
        {cells.map(([value, label]) => <div className="hj-count-cell" key={label}>
          <strong>{String(value).padStart(2, '0')}</strong><span>{label}</span>
        </div>)}
      </div>
    </div>
  </section>
}

function Person({ label, person }: { label: string; person: InvitationPerson }) {
  return <Window className="hj-person" size={208}>
    <p className="hj-tag">{label}</p>
    {person.honorific && <p className="hj-honorific">{person.honorific}</p>}
    <h3>{person.name}</h3>
    {person.parents && <>
      <span className="hj-dot-rule" aria-hidden="true" />
      <p className="hj-label">{person.parentLabel}</p>
      <p className="hj-parents">{person.parents}</p>
    </>}
  </Window>
}

function Storeys({ events, content, zone, sharedPlace }: { events: InvitationEvent[]; content: InvitationContent; zone: string; sharedPlace: string }) {
  const days = new Map<string, InvitationEvent[]>()
  for (const event of events) {
    const key = dayKey(event.startsAt, zone)
    days.set(key, [...(days.get(key) ?? []), event])
  }
  return <ol className="hj-storeys">
    {[...days.values()].map((dayEvents, d) => <li key={dayEvents[0].id} className="hj-storey">
      <p className="hj-ledge-label" data-reveal>
        <span className="hj-ledge-day">{dayWords[d] ?? 'Day ' + (d + 1)}</span>
        <span className="hj-ledge-date">{dayLabel(dayEvents[0].startsAt, zone)}</span>
      </p>
      <ol className={'hj-bays' + (dayEvents.length === 1 ? ' is-single' : '')}>
        {dayEvents.map(event => {
          const style = content.events[event.id]
          const link = mapLink(event)
          return <li key={event.id} className="hj-bay">
            <Window size={132} className="hj-event" crown={<span className="hj-disc"><EventArt icon={iconFor(event, style)} /></span>}>
              <h3>{event.name}</h3>
              {style?.subtitle && <p className="hj-event-sub">{style.subtitle}</p>}
              <p className="hj-time">{style?.timeLabel || timeLabel(event.startsAt, zone)}</p>
              {!sharedPlace && event.place && <p className="hj-event-place">
                <span>{event.place}</span>
                {link && <a href={link} target="_blank" rel="noreferrer">{Icon.nav}Directions</a>}
              </p>}
            </Window>
          </li>
        })}
      </ol>
    </li>)}
  </ol>
}

function Families({ content }: { content: InvitationContent }) {
  return <>{content.families.map((family, i) => <section className="hj-section hj-families" key={i} aria-labelledby={'hj-family-' + i}>
    <Head kicker="Those who welcome you" title={family.heading || 'Our Families'} id={'hj-family-' + i} />
    <div className="hj-grid">
      {family.cards.map((card, j) => <Window className="hj-family" key={j} size={190}>
        {card.title && <h3>{card.title}</h3>}
        {card.lines.map((line, k) => <div className="hj-family-line" key={k}>
          {line.relation && <p className="hj-label">{line.relation}</p>}
          {lines(line.names).map(name => <p className="hj-name" key={name}>{name}</p>)}
        </div>)}
      </Window>)}
    </div>
  </section>)}</>
}

function ClosingView() {
  return <span className="hj-view-inner is-dusk">
    <span className="hj-view-sun" />
    <Skyline className="hj-view-city" />
    <Diya className="hj-view-diya" />
  </span>
}

export default function HaveliJharokha({ page, invitation, manifest: design, options, greeting, rsvp, loadMusic, preview, embedded }: TemplateProps) {
  useFonts(fonts)
  const { content, events } = invitation
  const palette = String(options.palette ?? 'terracotta')
  const pigeons = options.pigeons !== false
  const names = coupleNames(content, page.design.heading || page.name)
  const [stage, setStage] = useState<Stage>('closed')
  const [still] = useState(reducedMotion)
  const shadeId = useId()
  const root = useRef<HTMLDivElement>(null)
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
    later(still ? 0 : 1000, () => { go('done'); window.scrollTo(0, 0) })
    later(still ? 50 : 1050, music.start)
  }
  const openShutters = () => {
    if (still) { finish(); return }
    go('opening')
    later(1900, () => { if (stageRef.current === 'opening') go('open') })
    later(6900, () => { if (stageRef.current === 'open') finish() })
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
    hero: () => <section className="hj-section hj-hero" aria-label={coupleTitle}>
      <div className="hj-roofline" aria-hidden="true">
        <Rooftop className="hj-rooftop" />
        {pigeons && <><Pigeon className="hj-roof-pigeon is-a" /><Pigeon className="hj-roof-pigeon is-b" /><Pigeon className="hj-roof-pigeon is-c" /></>}
      </div>
      <div className="hj-facade">
        <Wall className="hj-facade-wall" />
        <Window size={248} className="hj-hero-window">
          {greeting && <p className="hj-greeting">Dear {greeting},</p>}
          {content.title && <p className="hj-hero-title">{content.title}</p>}
          <h1 className="hj-names">
            <span ref={firstName}>{names[0]}</span>
            {names[1] && <><span className="hj-amp">&amp;</span><span ref={secondName}>{names[1]}</span></>}
          </h1>
          <p className="hj-date">{longDate(page.date)}</p>
          <div className="hj-actions">
            {events.length > 0 && <button type="button" className="hj-button" onClick={calendar}>{Icon.calendar}Mark the day</button>}
            {rsvp && <a className="hj-button is-quiet" href="#rsvp" onClick={toRsvp}>Send your reply</a>}
          </div>
        </Window>
      </div>
      <TileBand className="is-hero" />
    </section>,
    blessing: () => hasBlessing && <section className="hj-section hj-blessing">
      <Window size={232} className="hj-blessing-window" label="Blessings">
        {content.symbols.length > 0 && <div className="hj-plates">
          {content.symbols.map((symbol, i) => <Plate key={symbol} symbol={symbol} large={content.symbols.length === 3 ? i === 1 : i === 0} />)}
        </div>}
        {content.invocation && <p className="hj-invocation" lang="hi">{content.invocation}</p>}
        {content.shloka && <p className="hj-shloka" lang="sa">{lines(content.shloka).map(line => <span key={line}>{line}</span>)}</p>}
        {content.deity && <div className="hj-blessed">
          {content.blessingIntro && <p className="hj-soft">{content.blessingIntro}</p>}
          <p className="hj-deity">{content.deity}</p>
        </div>}
        {content.elders && <div className="hj-blessed">
          {content.eldersIntro && <p className="hj-soft">{content.eldersIntro}</p>}
          <p className="hj-elders">{content.elders}</p>
          {content.eldersNote && <p className="hj-note">{content.eldersNote}</p>}
        </div>}
        {page.design.coverPhoto && <figure className="hj-photo">
          <img src={'data:image/jpeg;base64,' + page.design.coverPhoto} alt={coupleTitle} />
        </figure>}
        {content.intro && <p className="hj-intro">{content.intro}</p>}
      </Window>
    </section>,
    countdown: () => <Countdown target={target} />,
    couple: () => shownPeople.length > 0 && <section className="hj-section hj-couple" aria-labelledby="hj-couple">
      <Head kicker="Two families, one courtyard" title={shownPeople.map(([label]) => label.replace('The ', '')).join(' & ')} id="hj-couple" />
      <div className={'hj-pair' + (shownPeople.length === 1 ? ' is-single' : '')}>
        {shownPeople.map(([label, person], i) => <Fragment key={label}>
          {i > 0 && <span className="hj-pair-amp" aria-hidden="true"><span>&amp;</span></span>}
          <div className="hj-pair-cell">
            {pigeons && i === shownPeople.length - 1 && <Pigeon className="hj-perch" />}
            <Person label={label} person={person} />
          </div>
        </Fragment>)}
      </div>
    </section>,
    events: () => events.length > 0 && <section className="hj-section hj-events" aria-labelledby="hj-events">
      <TileBand />
      <Head kicker="Floor by floor" title="The Celebrations" id="hj-events" />
      {sharedPlace && <a className="hj-chip" data-reveal href={mapLink(events[0]) || undefined} target="_blank" rel="noreferrer">
        {Icon.pin}<span>Every function at <strong>{sharedPlace}</strong></span>
      </a>}
      <Storeys events={events} content={content} zone={page.timeZone} sharedPlace={sharedPlace} />
    </section>,
    rsvp: () => rsvp && <section className="hj-section hj-rsvp" id="rsvp" aria-labelledby="hj-rsvp">
      <Head kicker="A word from you" title="Will we see you at the haveli?" id="hj-rsvp" />
      {content.rsvpBy && <p className="hj-soft hj-rsvp-by" data-reveal>Kindly reply by {longDate(content.rsvpBy)}</p>}
      <Window size={232} className="hj-rsvp-window"><div className="hj-rsvp-body">{rsvp}</div></Window>
    </section>,
    family: () => <Families content={content} />,
    venue: () => (places.length > 0 || content.dressCode) && <section className="hj-section hj-venue" aria-labelledby="hj-venue">
      <TileBand />
      <Head kicker="Finding your way" title={sharedPlace || (places.length === 1 ? places[0].place : 'The Venues')} id="hj-venue" />
      <Window size={232} className="hj-venue-window" crown={<Gate className="hj-gate" />}>
        {places.map(place => <div className="hj-place" key={place.place}>
          {(!sharedPlace || places.length > 1) && <h3>{place.place}</h3>}
          {place.address && <p className="hj-address">{place.address}</p>}
          {!sharedPlace && mapLink(place) && <a className="hj-link" href={mapLink(place)} target="_blank" rel="noreferrer">{Icon.nav}Get directions</a>}
        </div>)}
        {content.dressCode && <div className="hj-attire">
          <p className="hj-label">What to wear</p>
          <p>{content.dressCode}</p>
        </div>}
        <div className="hj-actions">
          {events.length > 0 && <button type="button" className="hj-button is-quiet" onClick={calendar}>{Icon.calendar}Add to Calendar</button>}
          {sharedPlace && mapLink(events[0]) && <a className="hj-button" href={mapLink(events[0])} target="_blank" rel="noreferrer">{Icon.nav}Get Directions</a>}
        </div>
      </Window>
    </section>,
    contacts: () => content.contacts.length > 0 && <section className="hj-section hj-contacts-section" aria-labelledby="hj-contacts">
      <Head kicker="Knock any time" title="Ask for us" id="hj-contacts" />
      <ul className="hj-contacts">
        {content.contacts.map(contact => <li className="hj-contact" key={contact.name + contact.phone} data-reveal>
          <div>
            <h3>{contact.name}</h3>
            {contact.role && <p className="hj-label">{contact.role}</p>}
          </div>
          <div className="hj-contact-actions">
            <a className="hj-button is-small" href={'tel:' + contact.phone.replace(/[\s-]/g, '')} aria-label={'Call ' + contact.name}>{Icon.phone}Call</a>
            <a className="hj-button is-small is-quiet" href={'https://wa.me/' + whatsappNumber(contact.phone)} target="_blank" rel="noreferrer"
              aria-label={'WhatsApp ' + contact.name}>{Icon.chat}WhatsApp</a>
          </div>
        </li>)}
      </ul>
    </section>,
    closing: () => <section className="hj-section hj-closing" aria-label="Closing">
      <TileBand />
      <div className="hj-closing-house" data-reveal aria-hidden="true">
        <Jharokha className="hj-closing-jharokha is-open" view={<ClosingView />} />
        {pigeons && <Pigeon className="hj-closing-pigeon" />}
      </div>
      <p className="hj-soft hj-lamp-line" data-reveal>We will keep a lamp lit in the window for you</p>
      {content.closing && <p className="hj-closing-line" data-reveal>{content.closing}</p>}
      <p className="hj-closing-names" data-reveal ref={closingNames}>{names[0]}{names[1] && <><em>&amp;</em>{names[1]}</>}</p>
      {sharedPlace && <div className="hj-blessed" data-reveal>
        <p className="hj-elders">{sharedPlace}</p>
        {events[0].address && <p className="hj-note">{events[0].address}</p>}
      </div>}
      {content.hosts && <div className="hj-blessed" data-reveal>
        {content.regardsIntro && <p className="hj-soft">{content.regardsIntro}</p>}
        <p className="hj-hosts">{content.hosts}</p>
      </div>}
    </section>,
  }
  const order: SectionKey[] = design.sections.includes('rsvp') ? design.sections : [...design.sections, 'rsvp']

  const Container = embedded ? 'div' : 'main'
  return <div className="t-haveli-jharokha" data-palette={palette} data-stage={stage} data-jali={options.jaliLight === false ? 'off' : 'on'}>
    {stage !== 'done' && <Opening names={names} title={content.title} date={longDate(page.date)} greeting={greeting} hint={String(options.windowLine ?? '')}
      stage={stage} pigeons={pigeons} onOpen={openShutters} onContinue={finish} />}
    <svg className="hj-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs><JaliPattern id={shadeId} size={30} width={4.5} /></defs></svg>
    <div className="hj-backdrop" aria-hidden="true"><Wall /></div>
    {preview && <p className="hj-preview">Preview · This is how your guests will see the invitation</p>}
    <ShadeContext.Provider value={options.jaliLight === false ? '' : shadeId}>
      <Container className="hj-main" ref={root} aria-hidden={!open && stage !== 'leaving'}>
        {order.map(key => <Fragment key={key}><SectionAnchor section={key} />{render[key]()}</Fragment>)}
      </Container>
    </ShadeContext.Provider>

    {music.available && open && <button type="button" className={'hj-music' + (music.blocked ? ' is-pulse' : '')}
      aria-pressed={music.playing} onClick={music.toggle}>
      {music.playing ? Icon.soundOn : Icon.soundOff}<span>{music.playing ? 'Music On' : 'Music Off'}</span>
    </button>}
  </div>
}

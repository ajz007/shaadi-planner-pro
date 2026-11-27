import { Fragment, useEffect, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent, ReactNode, RefObject } from 'react'
import { EventArt, Icon } from '../../art'
import { downloadCalendar, mapLink, reducedMotion, useCountdown, useFitText, useFonts, useReveal, whatsappNumber } from '../../effects'
import { coupleNames, iconFor } from '../../model'
import { dayKey, dayLabel, lines, longDate, timeLabel } from '../../format'
import { useMusic } from '../../music'
import type { InvitationContent, InvitationEvent, InvitationPerson, SectionKey } from '../../model'
import type { TemplateProps } from '../../types'
import { SectionAnchor } from '../../SectionAnchor'
import { Backwaters, Deepam, Jasmine, Lamp, LampFlames, Nirapara, Palm, SymbolPlate, wickOrder } from './art'
import './style.css'

const fonts = 'https://fonts.googleapis.com/css2?family=Gilda+Display&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500&family=Noto+Serif+Devanagari:wght@500;600&display=swap'
const lockClass = 't-kerala-kasavu-locked'

type Stage = 'closed' | 'lighting' | 'lit' | 'leaving' | 'done'

const dayNames = ['The first day', 'The second day', 'The third day', 'The fourth day', 'The fifth day', 'The sixth day', 'The seventh day']

// The gold borders down both edges of the cloth. As the guest reads further
// the woven band widens, and a glint runs along it while the page moves.
function useKasavuBorder(root: RefObject<HTMLDivElement | null>, active: boolean) {
  useEffect(() => {
    const element = root.current
    if (!element || !active || reducedMotion()) return
    let frame = 0, idle = 0
    const update = () => {
      frame = 0
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
      const progress = Math.min(1, Math.max(0, window.scrollY / max))
      element.style.setProperty('--kk-weave', progress.toFixed(3))
      const travel = window.innerHeight * 1.4
      element.style.setProperty('--kk-glint', ((window.scrollY * .8) % travel - window.innerHeight * .4).toFixed(1) + 'px')
    }
    const scroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
      element.dataset.shimmer = 'on'
      clearTimeout(idle)
      idle = window.setTimeout(() => { element.dataset.shimmer = 'off' }, 700)
    }
    update()
    window.addEventListener('scroll', scroll, { passive: true })
    window.addEventListener('resize', scroll)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(idle)
      window.removeEventListener('scroll', scroll)
      window.removeEventListener('resize', scroll)
      element.style.removeProperty('--kk-weave')
      delete element.dataset.shimmer
    }
  }, [root, active])
}

function Borders() {
  return <div className="kk-borders" aria-hidden="true">
    {['is-l', 'is-r'].map(side => <div key={side} className={'kk-border ' + side}>
      <span className="kk-border-band"><span className="kk-border-glint" /></span>
      <span className="kk-border-teeth" />
    </div>)}
  </div>
}

function Opening({ names, title, date, greeting, hint, stage, lit, onOpen, onContinue }: {
  names: [string, string]; title: string; date: string; greeting?: string; hint: string; stage: Stage; lit: boolean[]
  onOpen: () => void; onContinue: () => void
}) {
  const first = useRef<HTMLSpanElement>(null)
  const second = useRef<HTMLSpanElement>(null)
  useFitText(first, names[0])
  useFitText(second, names[1])
  const couple = names.filter(Boolean).join(' and ')
  const count = lit.filter(Boolean).length
  const ready = stage === 'lit'
  return <div className="kk-opening" data-stage={stage} data-wicks={count}
    onClick={() => (stage === 'lit' || stage === 'lighting') && onContinue()}>
    <Palm className="kk-opening-palm is-l" /><Palm className="kk-opening-palm is-r" />
    <div className="kk-opening-glow" aria-hidden="true" />
    <div className="kk-opening-words" aria-hidden={stage === 'closed'}>
      {greeting && <p className="kk-opening-dear">Dear {greeting},</p>}
      <p className="kk-opening-title">{title || 'Shubh Vivah'}</p>
      <p className="kk-opening-names">
        <span ref={first}>{names[0]}</span>
        {names[1] && <><em>&amp;</em><span ref={second}>{names[1]}</span></>}
      </p>
      <p className="kk-opening-date">{date}</p>
    </div>
    <div className="kk-altar">
      <Nirapara className="kk-para is-l" />
      <div className="kk-lamp-slot">
        <Lamp className="kk-lamp" />
        <button type="button" className="kk-lamp-button" data-open
          onClick={event => { event.stopPropagation(); if (stage === 'closed') onOpen(); else onContinue() }}
          aria-label={'Light the lamp and open the wedding invitation of ' + couple}>
          <span className="kk-lamp-halo" />
          <LampFlames lit={lit} className="kk-lamp-flames" />
        </button>
      </div>
      <Nirapara className="kk-para is-r" />
    </div>
    <div className="kk-veil" aria-hidden="true" />
    <div className="kk-dusk-words">
      {greeting && <p className="kk-dusk-dear">Dear {greeting},</p>}
      <p className="kk-dusk-line">An invitation waits in the lamplight</p>
    </div>
    <p className="kk-opening-hint" aria-live="polite">
      {ready ? <span className="kk-hint-lit">Tap anywhere to come in</span>
        : <span className="kk-hint-dusk">{hint || <>Touch the lamp to light it for {names[0]}{names[1] && <> &amp; {names[1]}</>}</>}</span>}
    </p>
  </div>
}

function Head({ kicker, title, id }: { kicker?: string; title: string; id: string }) {
  return <header className="kk-head" data-reveal>
    {kicker && <p className="kk-kicker">{kicker}</p>}
    <h2 id={id}>{title}</h2>
    <Jasmine className="kk-jasmine" />
  </header>
}

function Countdown({ target }: { target: number }) {
  const time = useCountdown(target)
  if (time.done) return null
  const cells: [number, string][] = [[time.days, 'Days'], [time.hours, 'Hours'], [time.minutes, 'Minutes'], [time.seconds, 'Seconds']]
  return <section className="kk-section kk-countdown" aria-labelledby="kk-count">
    <p className="kk-kicker" id="kk-count" data-reveal>Until the lamp is lit for us</p>
    <div className="kk-count" data-reveal role="timer" aria-live="off">
      {cells.map(([value, label]) => <div className="kk-count-cell" key={label}>
        <Deepam className="kk-count-lamp" />
        <strong>{String(value).padStart(2, '0')}</strong>
        <span>{label}</span>
      </div>)}
    </div>
  </section>
}

function Person({ label, person }: { label: string; person: InvitationPerson }) {
  return <article className="kk-fold kk-person" data-reveal>
    <p className="kk-tag">{label}</p>
    {person.honorific && <p className="kk-honorific">{person.honorific}</p>}
    <h3>{person.name}</h3>
    {person.parents && <>
      <p className="kk-label">{person.parentLabel}</p>
      <p className="kk-parents">{person.parents}</p>
    </>}
  </article>
}

function Days({ events, content, zone, sharedPlace }: { events: InvitationEvent[]; content: InvitationContent; zone: string; sharedPlace: string }) {
  const days = new Map<string, InvitationEvent[]>()
  for (const event of events) {
    const key = dayKey(event.startsAt, zone)
    days.set(key, [...(days.get(key) ?? []), event])
  }
  return <ol className="kk-days">
    {[...days.values()].map((dayEvents, d) => <li key={dayEvents[0].id} className="kk-day">
      <p className="kk-day-band" data-reveal>
        <span className="kk-day-n">{days.size > 1 ? dayNames[d] ?? 'Day ' + (d + 1) : 'The day'}</span>
        <span className="kk-day-date">{dayLabel(dayEvents[0].startsAt, zone)}</span>
      </p>
      <ol className="kk-events">
        {dayEvents.map((event, i) => {
          const style = content.events[event.id]
          const link = mapLink(event)
          return <li key={event.id} className="kk-fold kk-event" data-reveal style={{ '--i': i } as CSSProperties}>
            <span className="kk-event-icon"><EventArt icon={iconFor(event, style)} /></span>
            <div className="kk-event-text">
              <h3>{event.name}</h3>
              {style?.subtitle && <p className="kk-event-sub">{style.subtitle}</p>}
              <p className="kk-event-time">{style?.timeLabel || timeLabel(event.startsAt, zone)}</p>
              {!sharedPlace && event.place && <p className="kk-event-place">
                {Icon.pin}<span>{event.place}</span>
                {link && <a href={link} target="_blank" rel="noreferrer">Directions</a>}
              </p>}
            </div>
          </li>
        })}
      </ol>
    </li>)}
  </ol>
}

function Families({ content }: { content: InvitationContent }) {
  return <>{content.families.map((family, i) => <section className="kk-section" key={i} aria-labelledby={'kk-family-' + i}>
    <Head kicker="Woven into this day" title={family.heading || 'Our Families'} id={'kk-family-' + i} />
    <div className="kk-grid">
      {family.cards.map((card, j) => <article className="kk-fold kk-family" key={j} data-reveal>
        {card.title && <h3>{card.title}</h3>}
        {card.lines.map((line, k) => <div className="kk-family-line" key={k}>
          {line.relation && <p className="kk-label">{line.relation}</p>}
          {lines(line.names).map(name => <p className="kk-name" key={name}>{name}</p>)}
        </div>)}
      </article>)}
    </div>
  </section>)}</>
}

export default function KeralaKasavu({ page, invitation, manifest: design, options, greeting, rsvp, loadMusic, preview }: TemplateProps) {
  useFonts(fonts)
  const { content, events } = invitation
  const palette = String(options.palette ?? 'kasavu')
  const names = coupleNames(content, page.design.heading || page.name)
  const [stage, setStage] = useState<Stage>('closed')
  const [lit, setLit] = useState<boolean[]>([false, false, false, false, false])
  const [still] = useState(reducedMotion)
  const shell = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLElement>(null)
  const firstName = useRef<HTMLSpanElement>(null)
  const secondName = useRef<HTMLSpanElement>(null)
  const closingNames = useRef<HTMLParagraphElement>(null)
  const timers = useRef<number[]>([])
  const music = useMusic(loadMusic, invitation.hasMusic)
  const open = stage === 'done'
  useReveal(root, open)
  useKasavuBorder(shell, open && options.shimmer !== false)
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
    setLit([true, true, true, true, true])
    go('leaving')
    later(still ? 0 : 900, () => { go('done'); window.scrollTo(0, 0) })
    later(still ? 50 : 1000, music.start)
  }
  const light = () => {
    if (still) { finish(); return }
    go('lighting')
    wickOrder.forEach((wick, i) => later(250 + i * 300, () => setLit(current => current.map((on, j) => on || j === wick))))
    later(2000, () => { if (stageRef.current === 'lighting') go('lit') })
    later(7000, () => { if (stageRef.current === 'lit') finish() })
  }
  // A tap while the wicks are still catching keeps the moment; only a tap
  // after the lamp is fully lit (or the studio's second click) continues.
  const proceed = () => { if (stageRef.current === 'lit') finish() }

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
    blessing: () => hasBlessing && <section className="kk-section kk-blessing">
      {content.symbols.length > 0 && <div className="kk-symbols" data-reveal>
        {content.symbols.map((symbol, i) => <SymbolPlate key={symbol} symbol={symbol} large={content.symbols.length === 3 ? i === 1 : i === 0} />)}
      </div>}
      {content.invocation && <p className="kk-invocation" data-reveal lang="hi">{content.invocation}</p>}
      {content.shloka && <p className="kk-shloka" data-reveal lang="sa">{lines(content.shloka).map(line => <span key={line}>{line}</span>)}</p>}
      {content.deity && <div className="kk-blessed" data-reveal>
        {content.blessingIntro && <p className="kk-soft">{content.blessingIntro}</p>}
        <p className="kk-deity">{content.deity}</p>
      </div>}
      {content.elders && <div className="kk-blessed" data-reveal>
        {content.eldersIntro && <p className="kk-soft">{content.eldersIntro}</p>}
        <p className="kk-elders">{content.elders}</p>
        {content.eldersNote && <p className="kk-note">{content.eldersNote}</p>}
      </div>}
      {page.design.coverPhoto && <figure className="kk-photo" data-reveal>
        <img src={'data:image/jpeg;base64,' + page.design.coverPhoto} alt={coupleTitle} />
      </figure>}
      {content.intro && <p className="kk-intro" data-reveal>{content.intro}</p>}
    </section>,
    hero: () => <section className="kk-section kk-hero" aria-label={coupleTitle}>
      <div className="kk-canopy" aria-hidden="true">
        <Palm className="kk-hero-palm is-l" /><Palm className="kk-hero-palm is-r" />
      </div>
      <div className="kk-hero-body">
        {greeting && <p className="kk-greeting" data-reveal>Dear {greeting},</p>}
        {content.title && <p className="kk-hero-title" data-reveal>{content.title}</p>}
        <h1 className="kk-names" data-reveal>
          <span ref={firstName}>{names[0]}</span>
          {names[1] && <><span className="kk-amp">&amp;</span><span ref={secondName}>{names[1]}</span></>}
        </h1>
        <div className="kk-hero-rule" aria-hidden="true" data-reveal><span /><Deepam className="kk-hero-lamp" /><span /></div>
        <p className="kk-date" data-reveal>{longDate(page.date)}</p>
        <div className="kk-actions" data-reveal>
          {events.length > 0 && <button type="button" className="kk-button" onClick={calendar}>{Icon.calendar}Save to calendar</button>}
          {rsvp && <a className="kk-button is-quiet" href="#rsvp" onClick={toRsvp}>Send your reply</a>}
        </div>
      </div>
    </section>,
    countdown: () => <Countdown target={target} />,
    couple: () => shownPeople.length > 0 && <section className="kk-section kk-couple" aria-labelledby="kk-couple">
      <Head kicker="Two threads, one weave" title="The Couple" id="kk-couple" />
      <div className="kk-pair">
        {shownPeople.map(([label, person], i) => <Fragment key={label}>
          {i > 0 && <span className="kk-pair-amp" aria-hidden="true">&amp;</span>}
          <Person label={label} person={person} />
        </Fragment>)}
      </div>
    </section>,
    events: () => events.length > 0 && <section className="kk-section kk-functions" aria-labelledby="kk-events">
      <Head kicker="Each one lit like a wick" title="Days of the Wedding" id="kk-events" />
      {sharedPlace && <a className="kk-chip" data-reveal href={mapLink(events[0]) || undefined} target="_blank" rel="noreferrer">
        {Icon.pin}<span>Everything takes place at <strong>{sharedPlace}</strong></span>
      </a>}
      <Days events={events} content={content} zone={page.timeZone} sharedPlace={sharedPlace} />
    </section>,
    rsvp: () => rsvp && <section className="kk-section kk-rsvp" id="rsvp" aria-labelledby="kk-rsvp">
      <Head kicker="Kindly let us know" title="A place by the lamp is kept for you" id="kk-rsvp" />
      {content.rsvpBy && <p className="kk-soft kk-center" data-reveal>Do tell us by {longDate(content.rsvpBy)}</p>}
      <div className="kk-rsvp-body" data-reveal>{rsvp}</div>
    </section>,
    family: () => <Families content={content} />,
    venue: () => (places.length > 0 || content.dressCode) && <section className="kk-section kk-venue" aria-labelledby="kk-venue">
      <Head kicker="Where we gather" title={sharedPlace || (places.length === 1 ? places[0].place : 'The Venues')} id="kk-venue" />
      <div className="kk-shore">
        <Backwaters className="kk-backwaters" />
        <div className="kk-shore-body">
          {places.map(place => <article className="kk-place" key={place.place} data-reveal>
            <h3>{place.place}</h3>
            {place.address && <p className="kk-address">{place.address}</p>}
            {!sharedPlace && mapLink(place) && <a className="kk-link" href={mapLink(place)} target="_blank" rel="noreferrer">{Icon.nav}Get directions</a>}
          </article>)}
          {content.dressCode && <article className="kk-place is-attire" data-reveal>
            <p className="kk-label">What to wear</p>
            <p className="kk-address">{content.dressCode}</p>
          </article>}
          <div className="kk-actions" data-reveal>
            {events.length > 0 && <button type="button" className="kk-button is-quiet" onClick={calendar}>{Icon.calendar}Add to Calendar</button>}
            {sharedPlace && mapLink(events[0]) && <a className="kk-button" href={mapLink(events[0])} target="_blank" rel="noreferrer">{Icon.nav}Get Directions</a>}
          </div>
        </div>
      </div>
    </section>,
    contacts: () => content.contacts.length > 0 && <section className="kk-section" aria-labelledby="kk-contacts">
      <Head kicker="If you need anything" title="Call the Family" id="kk-contacts" />
      <ul className="kk-contacts">
        {content.contacts.map(contact => <li className="kk-contact" key={contact.name + contact.phone} data-reveal>
          <div className="kk-contact-who">
            <h3>{contact.name}</h3>
            {contact.role && <p className="kk-label">{contact.role}</p>}
          </div>
          <div className="kk-contact-actions">
            <a className="kk-button is-small" href={'tel:' + contact.phone.replace(/[\s-]/g, '')} aria-label={'Call ' + contact.name}>{Icon.phone}Call</a>
            <a className="kk-button is-small is-quiet" href={'https://wa.me/' + whatsappNumber(contact.phone)} target="_blank" rel="noreferrer"
              aria-label={'WhatsApp ' + contact.name}>{Icon.chat}WhatsApp</a>
          </div>
        </li>)}
      </ul>
    </section>,
    closing: () => <section className="kk-section kk-closing" aria-label="Closing">
      <Deepam className="kk-closing-lamp" />
      {content.closing && <p className="kk-closing-line" data-reveal>{content.closing}</p>}
      <p className="kk-closing-names" data-reveal ref={closingNames}>{names[0]}{names[1] && <><em>&amp;</em>{names[1]}</>}</p>
      {sharedPlace && <div className="kk-blessed" data-reveal>
        <p className="kk-elders">{sharedPlace}</p>
        {events[0].address && <p className="kk-note">{events[0].address}</p>}
      </div>}
      {content.hosts && <div className="kk-blessed" data-reveal>
        {content.regardsIntro && <p className="kk-soft">{content.regardsIntro}</p>}
        <p className="kk-hosts">{content.hosts}</p>
      </div>}
      <Jasmine className="kk-jasmine is-wide" width={300} />
    </section>,
  }
  const order: SectionKey[] = design.sections.includes('rsvp') ? design.sections : [...design.sections, 'rsvp']

  return <div className="t-kerala-kasavu" ref={shell} data-palette={palette} data-stage={stage}>
    <Borders />
    {stage !== 'done' && <Opening names={names} title={content.title} date={longDate(page.date)} greeting={greeting} hint={String(options.lampLine ?? '')}
      stage={stage} lit={lit} onOpen={light} onContinue={proceed} />}
    {preview && <p className="kk-preview">Preview · This is how your guests will see the invitation</p>}
    <main className="kk-main" ref={root} aria-hidden={!open && stage !== 'leaving'}>
      {order.map(key => <Fragment key={key}><SectionAnchor section={key} />{render[key]()}</Fragment>)}
    </main>

    {music.available && open && <button type="button" className={'kk-music' + (music.blocked ? ' is-pulse' : '')}
      aria-pressed={music.playing} onClick={music.toggle}>
      {music.playing ? Icon.soundOn : Icon.soundOff}<span>{music.playing ? 'Music On' : 'Music Off'}</span>
    </button>}
  </div>
}

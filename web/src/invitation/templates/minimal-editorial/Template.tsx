import { Fragment, useEffect, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent, ReactNode, RefObject } from 'react'
import { Icon } from '../../art'
import { downloadCalendar, mapLink, reducedMotion, useCountdown, useFitText, useFonts, useReveal, whatsappNumber } from '../../effects'
import { coupleNames, iconFor } from '../../model'
import { dayKey, dayLabel, lines, longDate, timeLabel } from '../../format'
import { useMusic } from '../../music'
import type { InvitationContent, InvitationEvent, InvitationPerson, SectionKey } from '../../model'
import type { TemplateProps } from '../../types'
import { SectionAnchor } from '../../SectionAnchor'
import { AgendaMark, Monogram, SymbolMark } from './art'
import './style.css'

const fonts = 'https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..700;1,6..96,400..600&family=Inter+Tight:wght@400;500;600&family=Noto+Serif+Devanagari:wght@400;500;600&display=swap'
const lockClass = 't-minimal-editorial-locked'

type Stage = 'closed' | 'turning' | 'turned' | 'leaving' | 'done'

const words = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve']
const word = (n: number) => words[n] ?? String(n)
const two = (n: number) => String(n).padStart(2, '0')
const numericDate = (date: string) => date.split('-').reverse().join('.')
const latin = (text: string) => /^[\u0000-ɏ‘-‟\s]*$/.test(text)

// Splits a heading into letters for the scroll-linked setting, keeping words
// unbroken. Scripts other than Latin stay whole so conjuncts shape correctly.
function Letters({ text }: { text: string }) {
  if (!latin(text)) return <span className="me-w"><span className="me-l" style={{ '--i': 0 } as CSSProperties}>{text}</span></span>
  let i = 0
  return <>{text.split(/(\s+)/).map((part, w) => /^\s+$/.test(part) ? ' ' : part && <span className="me-w" key={w}>
    {Array.from(part).map((letter, k) => <span className="me-l" key={k} style={{ '--i': i++ } as CSSProperties}>{letter}</span>)}
  </span>)}</>
}

// Letters of every [data-letters] heading settle in as it rises up the screen.
function useLetterScroll(root: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const element = root.current
    if (!element || !active || reducedMotion()) return
    let frame = 0
    const update = () => {
      frame = 0
      const height = window.innerHeight
      for (const target of element.querySelectorAll<HTMLElement>('[data-letters]')) {
        const top = target.getBoundingClientRect().top
        const progress = Math.min(1, Math.max(0, (height * 0.97 - top) / (height * 0.4)))
        target.style.setProperty('--p', progress.toFixed(3))
        target.style.setProperty('--n', String(target.querySelectorAll('.me-l').length))
      }
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    const observer = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(schedule)
    observer?.observe(element, { childList: true, subtree: true })
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [root, active])
}

function Opening({ names, initials, title, date, greeting, hint, stage, onOpen, onContinue }: {
  names: [string, string]; initials: [string, string]; title: string; date: string; greeting?: string; hint: string
  stage: Stage; onOpen: () => void; onContinue: () => void
}) {
  const first = useRef<HTMLSpanElement>(null)
  const second = useRef<HTMLSpanElement>(null)
  useFitText(first, names[0])
  useFitText(second, names[1])
  const turned = stage === 'turned' || stage === 'leaving'
  return <div className="me-opening" data-stage={stage} onClick={() => stage === 'turned' && onContinue()}>
    <div className="me-stage">
      <button type="button" className="me-card" data-open
        onClick={event => { event.stopPropagation(); if (stage === 'closed') onOpen(); else if (stage === 'turned') onContinue() }}
        aria-label={'Turn the card over to open the wedding invitation of ' + names.filter(Boolean).join(' and ')}>
        <span className="me-card-turn">
          <span className="me-face is-front" aria-hidden={turned}>
            <span className="me-face-top"><span>An invitation</span><span>{date.split('.')[2]}</span></span>
            <Monogram initials={initials} className="is-card" />
            {greeting ? <span className="me-face-dear">for {greeting}</span> : <span className="me-face-dear">for you</span>}
            <span className="me-face-foot"><span>{date}</span><span className="me-face-turn">Turn over <i aria-hidden="true">↻</i></span></span>
          </span>
          <span className="me-face is-back" aria-hidden={!turned}>
            <span className="me-face-top"><span>{title || 'The Wedding'}</span><span>{date}</span></span>
            <span className="me-back-names">
              <span className="me-back-name" ref={first}>{names[0]}</span>
              {names[1] && <><span className="me-back-amp">&amp;</span><span className="me-back-name is-second" ref={second}>{names[1]}</span></>}
            </span>
            <span className="me-face-foot"><span>are getting married</span><span>RSVP inside</span></span>
          </span>
        </span>
      </button>
    </div>
    <p className="me-opening-hint" aria-live="polite">{turned ? 'Tap anywhere to read on' : hint || 'Tap the card to turn it over'}</p>
  </div>
}

function Shell({ number, label, title, id, anchor, className, children, letters }: {
  number?: number; label: string; title?: string; id: string; anchor?: string; className?: string; children: ReactNode; letters: boolean
}) {
  return <section className={'me-section ' + (className ?? '')} id={anchor} aria-labelledby={id}>
    <header className="me-rail" data-reveal>
      {number !== undefined && <span className="me-num" aria-hidden="true">{two(number)}</span>}
      <p className="me-label">{label}</p>
    </header>
    <div className="me-body">
      {title ? <h2 className="me-title" id={id} data-letters={letters ? '' : undefined}>
        <span className="me-sr">{title}</span><span aria-hidden="true"><Letters text={title} /></span>
      </h2> : <h2 className="me-sr" id={id}>{label}</h2>}
      {children}
    </div>
  </section>
}

function Countdown({ target }: { target: number }) {
  const time = useCountdown(target)
  if (time.done) return null
  const cells: [string, string][] = [[String(time.days).padStart(3, '0'), 'Days'], [two(time.hours), 'Hours'], [two(time.minutes), 'Minutes'], [two(time.seconds), 'Seconds']]
  return <section className="me-section me-countdown" aria-labelledby="me-count">
    <header className="me-rail" data-reveal><p className="me-label" id="me-count">Until the day</p></header>
    <div className="me-body">
      <div className="me-count" role="timer" aria-live="off" data-reveal>
        {cells.map(([value, label]) => <div className="me-count-cell" key={label}><strong>{value}</strong><span>{label}</span></div>)}
      </div>
    </div>
  </section>
}

function Person({ label, person }: { label: string; person: InvitationPerson }) {
  return <article className="me-person" data-reveal>
    <p className="me-small">{label}</p>
    {person.honorific && <p className="me-honorific">{person.honorific}</p>}
    <h3>{person.name}</h3>
    {person.parents && <p className="me-parents"><span className="me-small is-quiet">{person.parentLabel}</span>{person.parents}</p>}
  </article>
}

function Agenda({ events, content, zone, sharedPlace }: { events: InvitationEvent[]; content: InvitationContent; zone: string; sharedPlace: string }) {
  const days = new Map<string, InvitationEvent[]>()
  for (const event of events) {
    const key = dayKey(event.startsAt, zone)
    days.set(key, [...(days.get(key) ?? []), event])
  }
  let number = 0
  return <ol className="me-agenda">
    {[...days.values()].map((dayEvents, d) => <li key={dayEvents[0].id} className="me-agenda-day">
      <p className="me-agenda-date" data-reveal><span>{dayLabel(dayEvents[0].startsAt, zone)}</span><span className="me-small">Day {two(d + 1)}</span></p>
      <ol>
        {dayEvents.map(event => {
          const style = content.events[event.id]
          const link = mapLink(event)
          number++
          return <li key={event.id} className="me-row" data-reveal>
            <span className="me-row-n" aria-hidden="true">{two(number)}</span>
            <p className="me-row-time">{style?.timeLabel || timeLabel(event.startsAt, zone)}</p>
            <div className="me-row-what">
              <h3><AgendaMark icon={iconFor(event, style)} /><span>{event.name}</span></h3>
              {style?.subtitle && <p className="me-row-sub">{style.subtitle}</p>}
            </div>
            {!sharedPlace && event.place && <p className="me-row-place">
              <span>{event.place}</span>
              {link && <a className="me-link" href={link} target="_blank" rel="noreferrer">Directions <i aria-hidden="true">↗</i></a>}
            </p>}
          </li>
        })}
      </ol>
    </li>)}
  </ol>
}

export default function MinimalEditorial({ page, invitation, manifest: design, options, greeting, rsvp, loadMusic, preview, embedded }: TemplateProps) {
  useFonts(fonts)
  const { content, events } = invitation
  const palette = String(options.palette ?? 'ivory')
  const letters = options.letterReveal !== false
  const names = coupleNames(content, page.design.heading || page.name)
  const initials: [string, string] = [names[0].charAt(0).toUpperCase(), (names[1] || names[0]).charAt(0).toUpperCase()]
  const [stage, setStage] = useState<Stage>('closed')
  const [still] = useState(reducedMotion)
  const root = useRef<HTMLDivElement>(null)
  const firstName = useRef<HTMLSpanElement>(null)
  const secondName = useRef<HTMLSpanElement>(null)
  const closingFirst = useRef<HTMLSpanElement>(null)
  const closingSecond = useRef<HTMLSpanElement>(null)
  const timers = useRef<number[]>([])
  const music = useMusic(loadMusic, invitation.hasMusic)
  const open = stage === 'done'
  useReveal(root, open)
  useLetterScroll(root, open && letters)
  useFitText(firstName, names[0])
  useFitText(secondName, names[1])
  useFitText(closingFirst, names[0])
  useFitText(closingSecond, names[1])

  const coupleTitle = names.filter(Boolean).join(' & ')
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
    later(still ? 0 : 800, () => { go('done'); window.scrollTo(0, 0) })
    later(still ? 50 : 900, music.start)
  }
  const turn = () => {
    if (still) { finish(); return }
    go('turning')
    later(1500, () => { if (stageRef.current === 'turning') go('turned') })
    later(6500, () => { if (stageRef.current === 'turned') finish() })
  }

  const sharedPlace = events.length > 0 && events.every(event => event.place && event.place === events[0].place) ? events[0].place : ''
  const places = [...new Map(events.filter(event => event.place).map(event => [event.place, event])).values()]
  const dayCount = new Set(events.map(event => dayKey(event.startsAt, page.timeZone))).size
  const target = events.length ? Date.parse(events[0].startsAt) : Date.parse(page.date + 'T00:00:00Z')
  const calendar = () => downloadCalendar(names.filter(Boolean).join('-') + '-wedding.ics', coupleTitle + ' Wedding', events,
    content.dressCode ? 'Dress code: ' + content.dressCode : '')
  const people: [string, InvitationPerson][] = content.brideFirst
    ? [['The Bride', content.bride], ['The Groom', content.groom]] : [['The Groom', content.groom], ['The Bride', content.bride]]
  const shownPeople = people.filter(([, person]) => person.name)
  const hasBlessing = !!(content.symbols.length || content.invocation || content.shloka || content.deity || content.elders || content.intro || page.design.coverPhoto)
  const toRsvp = (event: MouseEvent) => { event.preventDefault(); document.getElementById('rsvp')?.scrollIntoView({ behavior: still ? 'auto' : 'smooth' }) }
  const agendaTitle = (dayCount === 1 ? 'One day' : word(dayCount) + ' days') + ', ' + (events.length === 1 ? 'one celebration' : word(events.length).toLowerCase() + ' celebrations')

  // Sections are numbered in the order they appear, like the pages of a
  // magazine; the cover and the countdown carry no number.
  const shown: Record<SectionKey, boolean> = {
    hero: true, blessing: hasBlessing, countdown: false, couple: shownPeople.length > 0, events: events.length > 0, rsvp: !!rsvp,
    family: content.families.length > 0, venue: places.length > 0 || !!content.dressCode, contacts: content.contacts.length > 0, closing: false,
  }
  const order: SectionKey[] = design.sections.includes('rsvp') ? design.sections : [...design.sections, 'rsvp']
  const numbers = new Map<SectionKey, number>()
  let counter = 0
  for (const key of order) {
    if (!shown[key]) continue
    if (key === 'family') { numbers.set(key, counter + 1); counter += content.families.length } else if (key !== 'hero') numbers.set(key, ++counter)
  }

  const render: Record<SectionKey, () => ReactNode> = {
    hero: () => <section className="me-hero" aria-label={coupleTitle}>
      <div className="me-masthead" data-reveal>
        <span>{content.title || 'The Wedding'}</span>
        <Monogram initials={initials} className="is-small" />
        <span>{numericDate(page.date)}</span>
      </div>
      {greeting && <p className="me-dear" data-reveal>Dear {greeting},</p>}
      <h1 className="me-names" data-reveal>
        <span className="me-name-line"><span ref={firstName}><Letters text={names[0]} /></span></span>
        {names[1] && <>
          <span className="me-names-amp" aria-hidden="true">&amp;</span>
          <span className="me-name-line is-second"><span ref={secondName}><Letters text={names[1]} /></span></span>
        </>}
        <span className="me-sr">{coupleTitle}</span>
      </h1>
      <dl className="me-meta" data-reveal>
        <div><dt>Date</dt><dd>{longDate(page.date)}</dd></div>
        {(sharedPlace || places.length > 0) && <div><dt>{sharedPlace || places.length === 1 ? 'Place' : 'Places'}</dt>
          <dd>{sharedPlace || (places.length === 1 ? places[0].place : word(places.length) + ' venues')}</dd></div>}
        {events.length > 0 && <div><dt>Programme</dt><dd>{agendaTitle.charAt(0).toUpperCase() + agendaTitle.slice(1)}</dd></div>}
      </dl>
      <div className="me-actions" data-reveal>
        {events.length > 0 && <button type="button" className="me-button" onClick={calendar}>Save the date</button>}
        {rsvp && <a className="me-button is-line" href="#rsvp" onClick={toRsvp}>Reply <i aria-hidden="true">→</i></a>}
      </div>
    </section>,
    blessing: () => hasBlessing && <Shell number={numbers.get('blessing')} label="Foreword" id="me-blessing" className="me-blessing" letters={letters}>
      {content.symbols.length > 0 && <div className="me-symbols" data-reveal>
        {content.symbols.map((symbol, i) => <SymbolMark key={symbol} symbol={symbol} large={content.symbols.length === 3 ? i === 1 : i === 0} />)}
      </div>}
      {content.invocation && <p className="me-invocation" data-reveal lang="hi">{content.invocation}</p>}
      {content.shloka && <p className="me-shloka" data-reveal lang="sa">{lines(content.shloka).map(line => <span key={line}>{line}</span>)}</p>}
      {(content.deity || content.elders) && <div className="me-graces" data-reveal>
        {content.deity && <div>
          {content.blessingIntro && <p className="me-small is-quiet">{content.blessingIntro}</p>}
          <p className="me-grace">{content.deity}</p>
        </div>}
        {content.elders && <div>
          {content.eldersIntro && <p className="me-small is-quiet">{content.eldersIntro}</p>}
          <p className="me-grace">{content.elders}</p>
          {content.eldersNote && <p className="me-note">{content.eldersNote}</p>}
        </div>}
      </div>}
      {content.intro && <p className="me-pull" data-reveal>{content.intro}</p>}
      {page.design.coverPhoto && <figure className="me-photo" data-reveal>
        <img src={'data:image/jpeg;base64,' + page.design.coverPhoto} alt={coupleTitle} />
        <figcaption><span>{coupleTitle}</span><span>{longDate(page.date)}</span></figcaption>
      </figure>}
    </Shell>,
    countdown: () => <Countdown target={target} />,
    couple: () => shownPeople.length > 0 && <Shell number={numbers.get('couple')} label="The Couple" title="Meet the two of them" id="me-couple" letters={letters}>
      <div className="me-pair">
        {shownPeople.map(([label, person], i) => <Fragment key={label}>
          {i > 0 && <span className="me-pair-amp" aria-hidden="true">&amp;</span>}
          <Person label={label} person={person} />
        </Fragment>)}
      </div>
    </Shell>,
    events: () => events.length > 0 && <Shell number={numbers.get('events')} label="The Agenda" title={agendaTitle} id="me-events" letters={letters}>
      {sharedPlace && <p className="me-where" data-reveal>
        <span>Every celebration is at <strong>{sharedPlace}</strong></span>
        {mapLink(events[0]) && <a className="me-link" href={mapLink(events[0])} target="_blank" rel="noreferrer">Directions <i aria-hidden="true">↗</i></a>}
      </p>}
      <Agenda events={events} content={content} zone={page.timeZone} sharedPlace={sharedPlace} />
    </Shell>,
    rsvp: () => rsvp && <Shell number={numbers.get('rsvp')} label="Your Reply" title="We’re saving you a seat" id="me-rsvp" anchor="rsvp"
      className="me-rsvp" letters={letters}>
      {content.rsvpBy && <p className="me-lede" data-reveal>Kindly let us know by {longDate(content.rsvpBy)}.</p>}
      <div className="me-rsvp-body" data-reveal>{rsvp}</div>
    </Shell>,
    family: () => content.families.map((family, i) => <Shell key={i} number={(numbers.get('family') ?? 0) + i} label="The Families"
      title={family.heading || 'With love, from home'} id={'me-family-' + i} letters={letters}>
      <div className="me-families">
        {family.cards.map((card, j) => <article className="me-family" key={j} data-reveal>
          {card.title && <h3 className="me-small">{card.title}</h3>}
          {card.lines.map((line, k) => <div className="me-family-line" key={k}>
            {line.relation && <p className="me-relation">{line.relation}</p>}
            {lines(line.names).map(name => <p className="me-family-name" key={name}>{name}</p>)}
          </div>)}
        </article>)}
      </div>
    </Shell>),
    venue: () => (places.length > 0 || content.dressCode) && <Shell number={numbers.get('venue')} label={places.length > 1 ? 'The Venues' : 'The Venue'}
      title={sharedPlace || (places.length === 1 ? places[0].place : places.length ? 'Where to find us' : 'What to wear')} id="me-venue" letters={letters}>
      <dl className="me-details" data-reveal>
        {places.map(place => <div key={place.place}>
          <dt>{sharedPlace || places.length === 1 ? 'Address' : place.place}</dt>
          <dd>
            {place.address || place.place}
            {!sharedPlace && places.length > 1 && mapLink(place) && <a className="me-link" href={mapLink(place)} target="_blank" rel="noreferrer">Directions <i aria-hidden="true">↗</i></a>}
          </dd>
        </div>)}
        {content.dressCode && <div><dt>Dress code</dt><dd>{content.dressCode}</dd></div>}
      </dl>
      <div className="me-actions" data-reveal>
        {events.length > 0 && <button type="button" className="me-button is-line" onClick={calendar}>{Icon.calendar}Add to Calendar</button>}
        {(sharedPlace || places.length === 1) && mapLink(places[0]) && <a className="me-button" href={mapLink(places[0])} target="_blank" rel="noreferrer">{Icon.nav}Get Directions</a>}
      </div>
    </Shell>,
    contacts: () => content.contacts.length > 0 && <Shell number={numbers.get('contacts')} label="Contacts" title="Questions? Ask us" id="me-contacts" letters={letters}>
      <ul className="me-contacts">
        {content.contacts.map(contact => <li className="me-contact" key={contact.name + contact.phone} data-reveal>
          <div>
            <h3>{contact.name}</h3>
            {contact.role && <p className="me-contact-role">{contact.role}</p>}
          </div>
          <div className="me-contact-actions">
            <a className="me-button is-small" href={'tel:' + contact.phone.replace(/[\s-]/g, '')} aria-label={'Call ' + contact.name}>{Icon.phone}Call</a>
            <a className="me-button is-small is-line" href={'https://wa.me/' + whatsappNumber(contact.phone)} target="_blank" rel="noreferrer"
              aria-label={'WhatsApp ' + contact.name}>{Icon.chat}WhatsApp</a>
          </div>
        </li>)}
      </ul>
    </Shell>,
    closing: () => <section className="me-closing" aria-label="Closing">
      {content.closing && <p className="me-closing-line" data-reveal>{content.closing}</p>}
      <p className="me-closing-names" data-reveal>
        <span ref={closingFirst}>{names[0]}</span>
        {names[1] && <><em>&amp;</em><span ref={closingSecond}>{names[1]}</span></>}
      </p>
      {content.hosts && <div className="me-hosts" data-reveal>
        {content.regardsIntro && <p className="me-small is-quiet">{content.regardsIntro}</p>}
        <p className="me-grace">{content.hosts}</p>
      </div>}
      <div className="me-colophon" data-reveal>
        <span>{coupleTitle}</span>
        <Monogram initials={initials} className="is-small" />
        <span>{numericDate(page.date)}</span>
      </div>
    </section>,
  }

  const Container = embedded ? 'div' : 'main'
  return <div className="t-minimal-editorial" data-palette={palette} data-stage={stage} data-grid={options.grid === false ? 'off' : 'on'}
    data-letters={letters ? 'scroll' : 'still'}>
    {stage !== 'done' && <Opening names={names} initials={initials} title={content.title} date={numericDate(page.date)} greeting={greeting}
      hint={String(options.cardLine ?? '')} stage={stage} onOpen={turn} onContinue={finish} />}
    <div className="me-grid" aria-hidden="true" />
    {preview && <p className="me-preview">Preview · This is how your guests will see the invitation</p>}
    <Container className="me-main" ref={root} aria-hidden={!open && stage !== 'leaving'}>
      {order.map(key => <Fragment key={key}><SectionAnchor section={key} />{render[key]()}</Fragment>)}
    </Container>

    {music.available && open && <button type="button" className={'me-music' + (music.blocked ? ' is-pulse' : '')}
      aria-pressed={music.playing} onClick={music.toggle}>
      {music.playing ? Icon.soundOn : Icon.soundOff}<span>{music.playing ? 'Music On' : 'Music Off'}</span>
    </button>}
  </div>
}

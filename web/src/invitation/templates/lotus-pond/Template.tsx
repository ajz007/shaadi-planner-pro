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
import { Dragonfly, LilyPad, Lotus, LotusRule, PondScene, Reeds, Rings, SymbolFlower } from './art'
import './style.css'

const fonts = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;1,9..144,300;1,9..144,400&family=Mulish:wght@400;600;700&family=Noto+Serif+Devanagari:wght@500;600&display=swap'
const lockClass = 't-lotus-pond-locked'

type Stage = 'closed' | 'blooming' | 'bloomed' | 'leaving' | 'done'
type Splash = { id: number; x: number; y: number }

const dayWords = ['Day one', 'Day two', 'Day three', 'Day four', 'Day five', 'Day six', 'Day seven']
// Lily pads resting on the opening's pond: left %, top %, width (vw, capped), notch angle, drift delay.
const openingPads: [number, number, number, number, number][] = [
  [-6, 8, 30, 300, 0], [74, 14, 26, 210, -4], [-10, 44, 24, 30, -8], [82, 50, 22, 130, -2], [-4, 70, 20, 250, -6], [70, 86, 30, 330, -10],
]
// Pads drifting behind the page, kept to the edges so they never sit under text.
const pagePads: [number, number, number, number][] = [[-8, 12, 300, 0], [88, 30, 200, -5], [-10, 62, 40, -9], [86, 84, 120, -3]]

function Opening({ names, title, date, greeting, hint, stage, onOpen, onContinue }: {
  names: [string, string]; title: string; date: string; greeting?: string; hint: string; stage: Stage
  onOpen: () => void; onContinue: () => void
}) {
  const first = useRef<HTMLSpanElement>(null)
  const second = useRef<HTMLSpanElement>(null)
  useFitText(first, names[0])
  useFitText(second, names[1])
  const couple = names.filter(Boolean).join(' and ')
  const bloom = stage !== 'closed'
  return <div className="lp-opening" data-stage={stage} onClick={() => stage === 'bloomed' && onContinue()}>
    <div className="lp-opening-water" aria-hidden="true">
      {openingPads.map(([left, top, size, notch, delay], i) => <LilyPad key={i} className="lp-opening-pad" notch={notch}
        style={{ left: left + '%', top: top + '%', '--s': size, '--dl': delay + 's' } as CSSProperties} />)}
      <Reeds className="lp-opening-reeds is-l" /><Reeds className="lp-opening-reeds is-r" />
    </div>
    <div className="lp-opening-words">
      {greeting && <p className="lp-opening-dear">Dear {greeting},</p>}
      <div className="lp-opening-swap">
        <p className="lp-opening-still" aria-hidden={bloom}>Something lovely is about to open</p>
        <div className="lp-opening-reveal" aria-hidden={!bloom}>
          {title && <p className="lp-opening-title">{title}</p>}
          <p className="lp-opening-names">
            <span ref={first}>{names[0]}</span>
            {names[1] && <><em>&amp;</em><span ref={second}>{names[1]}</span></>}
          </p>
          <p className="lp-opening-date">{date}</p>
        </div>
      </div>
    </div>
    <div className="lp-bloom">
      <Rings className="lp-bloom-rings" count={4} />
      <LilyPad className="lp-bloom-pad" notch={60} />
      <button type="button" className="lp-bud" data-open
        onClick={event => { event.stopPropagation(); if (stage === 'closed') onOpen(); else onContinue() }}
        aria-label={'Let the lotus bloom and open the wedding invitation of ' + couple}>
        <Lotus className="lp-bud-lotus" open={bloom} />
      </button>
      <Dragonfly className="lp-opening-fly" />
    </div>
    <p className="lp-opening-hint" aria-live="polite">
      {stage === 'bloomed' ? 'Tap anywhere to step in'
        : hint || <>Touch the bud to let it bloom for <span className="lp-nowrap">{names[0]}{names[1] && <> &amp; {names[1]}</>}</span></>}
    </p>
  </div>
}

function Head({ kicker, title, id }: { kicker?: string; title: string; id: string }) {
  return <header className="lp-head" data-reveal>
    <Rings className="lp-head-rings" />
    {kicker && <p className="lp-kicker">{kicker}</p>}
    <h2 id={id}>{title}</h2>
    <LotusRule />
  </header>
}

function Countdown({ target }: { target: number }) {
  const time = useCountdown(target)
  if (time.done) return null
  const cells: [number, string][] = [[time.days, 'Days'], [time.hours, 'Hours'], [time.minutes, 'Minutes'], [time.seconds, 'Seconds']]
  return <section className="lp-section lp-countdown" aria-labelledby="lp-count">
    <p className="lp-kicker" id="lp-count" data-reveal>Until the day we bloom together</p>
    <div className="lp-count" data-reveal role="timer" aria-live="off">
      {cells.map(([value, label], i) => <div className="lp-count-cell" key={label}>
        <LilyPad className="lp-count-pad" notch={[300, 220, 20, 140][i]} />
        <strong>{String(value).padStart(2, '0')}</strong>
        <span>{label}</span>
      </div>)}
    </div>
  </section>
}

function Person({ label, person }: { label: string; person: InvitationPerson }) {
  return <article className="lp-card lp-person" data-reveal>
    <Lotus className="lp-person-lotus" />
    <p className="lp-tag">{label}</p>
    {person.honorific && <p className="lp-honorific">{person.honorific}</p>}
    <h3>{person.name}</h3>
    {person.parents && <>
      <p className="lp-label">{person.parentLabel}</p>
      <p className="lp-parents">{person.parents}</p>
    </>}
  </article>
}

function Days({ events, content, zone, sharedPlace }: { events: InvitationEvent[]; content: InvitationContent; zone: string; sharedPlace: string }) {
  const days = new Map<string, InvitationEvent[]>()
  for (const event of events) {
    const key = dayKey(event.startsAt, zone)
    days.set(key, [...(days.get(key) ?? []), event])
  }
  let n = 0
  return <ol className="lp-days">
    {[...days.values()].map((dayEvents, d) => <li key={dayEvents[0].id} className="lp-day">
      <p className="lp-day-label" data-reveal>
        {days.size > 1 && <span className="lp-day-n">{dayWords[d] ?? 'Day ' + (d + 1)}</span>}
        <span className="lp-day-date">{dayLabel(dayEvents[0].startsAt, zone)}</span>
      </p>
      <ol className="lp-events">
        {dayEvents.map(event => {
          const style = content.events[event.id]
          const link = mapLink(event)
          const side = n++ % 2 ? 'is-right' : 'is-left'
          return <li key={event.id} className={'lp-card lp-event ' + side} data-reveal>
            <LilyPad className="lp-event-pad" notch={side === 'is-left' ? 200 : 340} />
            <span className="lp-event-icon"><EventArt icon={iconFor(event, style)} /></span>
            <div className="lp-event-text">
              <h3>{event.name}</h3>
              {style?.subtitle && <p className="lp-event-sub">{style.subtitle}</p>}
              <p className="lp-event-time">{style?.timeLabel || timeLabel(event.startsAt, zone)}</p>
              {!sharedPlace && event.place && <p className="lp-event-place">
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
  return <>{content.families.map((family, i) => <section className="lp-section" key={i} aria-labelledby={'lp-family-' + i}>
    <Head kicker="The roots beneath the bloom" title={family.heading || 'Our Families'} id={'lp-family-' + i} />
    <div className="lp-grid">
      {family.cards.map((card, j) => <article className="lp-card lp-family" key={j} data-reveal>
        {card.title && <h3>{card.title}</h3>}
        {card.lines.map((line, k) => <div className="lp-family-line" key={k}>
          {line.relation && <p className="lp-label">{line.relation}</p>}
          {lines(line.names).map(name => <p className="lp-name" key={name}>{name}</p>)}
        </div>)}
      </article>)}
    </div>
  </section>)}</>
}

export default function LotusPond({ page, invitation, manifest: design, options, greeting, rsvp, loadMusic, preview, embedded }: TemplateProps) {
  useFonts(fonts)
  const { content, events } = invitation
  const palette = String(options.palette ?? 'aqua-blush')
  const names = coupleNames(content, page.design.heading || page.name)
  const [stage, setStage] = useState<Stage>('closed')
  const [splashes, setSplashes] = useState<Splash[]>([])
  const [still] = useState(reducedMotion)
  const root = useRef<HTMLDivElement>(null)
  const firstName = useRef<HTMLSpanElement>(null)
  const secondName = useRef<HTMLSpanElement>(null)
  const closingNames = useRef<HTMLParagraphElement>(null)
  const timers = useRef<number[]>([])
  const splashId = useRef(0)
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
    later(still ? 50 : 1100, music.start)
  }
  const bloom = () => {
    if (still) { finish(); return }
    go('blooming')
    later(2200, () => { if (stageRef.current === 'blooming') go('bloomed') })
    later(7400, () => { if (stageRef.current === 'bloomed') finish() })
  }
  // While the petals are still unfolding a tap lets them finish; once the
  // flower is open (or on the studio's second click) the page continues.
  const proceed = () => { if (stageRef.current === 'bloomed') finish() }

  // The signature touch: touching the water anywhere sends out a ripple.
  const ripple = (event: MouseEvent<HTMLDivElement>) => {
    if (!open || still || options.ripples === false) return
    if ((event.target as HTMLElement).closest('a, button, input, select, textarea, label, summary, img, .invite-panel')) return
    const id = ++splashId.current
    setSplashes(current => [...current.slice(-4), { id, x: event.clientX, y: event.clientY }])
    later(2600, () => setSplashes(current => current.filter(item => item.id !== id)))
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
    blessing: () => hasBlessing && <section className="lp-section lp-blessing">
      {content.symbols.length > 0 && <div className="lp-symbols" data-reveal>
        {content.symbols.map((symbol, i) => <SymbolFlower key={symbol} symbol={symbol} large={content.symbols.length === 3 ? i === 1 : i === 0} />)}
      </div>}
      {content.invocation && <p className="lp-invocation" data-reveal lang="hi">{content.invocation}</p>}
      {content.shloka && <p className="lp-shloka" data-reveal lang="sa">{lines(content.shloka).map(line => <span key={line}>{line}</span>)}</p>}
      {content.deity && <div className="lp-blessed" data-reveal>
        {content.blessingIntro && <p className="lp-soft">{content.blessingIntro}</p>}
        <p className="lp-deity">{content.deity}</p>
      </div>}
      {content.elders && <div className="lp-blessed" data-reveal>
        {content.eldersIntro && <p className="lp-soft">{content.eldersIntro}</p>}
        <p className="lp-elders">{content.elders}</p>
        {content.eldersNote && <p className="lp-note">{content.eldersNote}</p>}
      </div>}
      {page.design.coverPhoto && <figure className="lp-photo" data-reveal>
        <LilyPad className="lp-photo-pad" notch={250} />
        <img src={'data:image/jpeg;base64,' + page.design.coverPhoto} alt={coupleTitle} />
        <Lotus className="lp-photo-lotus" />
      </figure>}
      {content.intro && <p className="lp-intro" data-reveal>{content.intro}</p>}
    </section>,
    hero: () => <section className="lp-section lp-hero" aria-label={coupleTitle}>
      <div className="lp-hero-flower" aria-hidden="true" data-reveal>
        <Rings className="lp-hero-rings" count={4} />
        <Lotus className="lp-hero-lotus" />
      </div>
      {content.title && <p className="lp-hero-title" data-reveal>{content.title}</p>}
      <h1 className="lp-names" data-reveal>
        <span ref={firstName}>{names[0]}</span>
        {names[1] && <><span className="lp-amp">&amp;</span><span ref={secondName}>{names[1]}</span></>}
      </h1>
      <p className="lp-date" data-reveal>{longDate(page.date)}</p>
      <div className="lp-actions" data-reveal>
        {events.length > 0 && <button type="button" className="lp-button" onClick={calendar}>{Icon.calendar}Keep the date</button>}
        {rsvp && <a className="lp-button is-quiet" href="#rsvp" onClick={toRsvp}>Send your reply</a>}
      </div>
      {!still && options.ripples !== false && <p className="lp-touch" data-reveal>Touch the water anywhere and watch it ripple</p>}
    </section>,
    countdown: () => <Countdown target={target} />,
    couple: () => shownPeople.length > 0 && <section className="lp-section lp-couple" aria-labelledby="lp-couple">
      <Head kicker="Two blossoms, one pond" title={shownPeople.length > 1 ? 'The Couple' : shownPeople[0][0]} id="lp-couple" />
      <div className="lp-pair">
        {shownPeople.map(([label, person], i) => <Fragment key={label}>
          {i > 0 && <span className="lp-pair-amp" aria-hidden="true">&amp;</span>}
          <Person label={label} person={person} />
        </Fragment>)}
      </div>
    </section>,
    events: () => events.length > 0 && <section className="lp-section lp-functions" aria-labelledby="lp-events">
      <Head kicker="Gather by the water" title="The Celebrations" id="lp-events" />
      {sharedPlace && <a className="lp-chip" data-reveal href={mapLink(events[0]) || undefined} target="_blank" rel="noreferrer">
        {Icon.pin}<span>Every celebration is at <strong>{sharedPlace}</strong></span>
      </a>}
      <Days events={events} content={content} zone={page.timeZone} sharedPlace={sharedPlace} />
    </section>,
    rsvp: () => rsvp && <section className="lp-section lp-rsvp" id="rsvp" aria-labelledby="lp-rsvp">
      <Head kicker="A small request" title="Will we see you there?" id="lp-rsvp" />
      {content.rsvpBy && <p className="lp-soft lp-center" data-reveal>Please reply by {longDate(content.rsvpBy)}</p>}
      <div className="lp-rsvp-body" data-reveal>{rsvp}</div>
    </section>,
    family: () => <Families content={content} />,
    venue: () => (places.length > 0 || content.dressCode) && <section className="lp-section lp-venue" aria-labelledby="lp-venue">
      <Head kicker="Where we will gather" title={sharedPlace || (places.length === 1 ? places[0].place : 'The Venues')} id="lp-venue" />
      <div className="lp-card lp-shore" data-reveal>
        <PondScene className="lp-venue-scene" />
        {places.map(place => <div className="lp-place" key={place.place}>
          {(!sharedPlace || places.length > 1) && <h3>{place.place}</h3>}
          {place.address && <p className="lp-address">{place.address}</p>}
          {!sharedPlace && mapLink(place) && <a className="lp-link" href={mapLink(place)} target="_blank" rel="noreferrer">{Icon.nav}Get directions</a>}
        </div>)}
        {content.dressCode && <div className="lp-place is-attire">
          <p className="lp-label">What to wear</p>
          <p className="lp-address">{content.dressCode}</p>
        </div>}
        <div className="lp-actions">
          {events.length > 0 && <button type="button" className="lp-button is-quiet" onClick={calendar}>{Icon.calendar}Add to Calendar</button>}
          {sharedPlace && mapLink(events[0]) && <a className="lp-button" href={mapLink(events[0])} target="_blank" rel="noreferrer">{Icon.nav}Get Directions</a>}
        </div>
      </div>
    </section>,
    contacts: () => content.contacts.length > 0 && <section className="lp-section" aria-labelledby="lp-contacts">
      <Head kicker="Should you need us" title="Family to Call" id="lp-contacts" />
      <ul className="lp-contacts">
        {content.contacts.map(contact => <li className="lp-card lp-contact" key={contact.name + contact.phone} data-reveal>
          <div className="lp-contact-who">
            <h3>{contact.name}</h3>
            {contact.role && <p className="lp-label">{contact.role}</p>}
          </div>
          <div className="lp-contact-actions">
            <a className="lp-button is-small" href={'tel:' + contact.phone.replace(/[\s-]/g, '')} aria-label={'Call ' + contact.name}>{Icon.phone}Call</a>
            <a className="lp-button is-small is-quiet" href={'https://wa.me/' + whatsappNumber(contact.phone)} target="_blank" rel="noreferrer"
              aria-label={'WhatsApp ' + contact.name}>{Icon.chat}WhatsApp</a>
          </div>
        </li>)}
      </ul>
    </section>,
    closing: () => <section className="lp-section lp-closing" aria-label="Closing">
      {content.closing && <p className="lp-closing-line" data-reveal>{content.closing}</p>}
      <p className="lp-closing-names" data-reveal ref={closingNames}>{names[0]}{names[1] && <><em>&amp;</em>{names[1]}</>}</p>
      {sharedPlace && <div className="lp-blessed" data-reveal>
        <p className="lp-elders">{sharedPlace}</p>
        {events[0].address && <p className="lp-note">{events[0].address}</p>}
      </div>}
      {content.hosts && <div className="lp-blessed" data-reveal>
        {content.regardsIntro && <p className="lp-soft">{content.regardsIntro}</p>}
        <p className="lp-hosts">{content.hosts}</p>
      </div>}
      <div className="lp-closing-pond" aria-hidden="true" data-reveal>
        <Rings className="lp-closing-rings" count={4} />
        <LilyPad className="lp-closing-pad" notch={70} />
        <Lotus className="lp-closing-lotus" />
      </div>
    </section>,
  }
  const order: SectionKey[] = design.sections.includes('rsvp') ? design.sections : [...design.sections, 'rsvp']

  const Container = embedded ? 'div' : 'main'
  return <div className="t-lotus-pond" data-palette={palette} data-stage={stage} onClick={ripple}>
    {stage !== 'done' && <Opening names={names} title={content.title} date={longDate(page.date)} greeting={greeting} hint={String(options.bloomLine ?? '')}
      stage={stage} onOpen={bloom} onContinue={proceed} />}
    <div className="lp-backdrop" aria-hidden="true">
      {pagePads.map(([left, top, notch, delay], i) => <LilyPad key={i} className="lp-page-pad" notch={notch}
        style={{ left: left + '%', top: top + '%', '--dl': delay + 's' } as CSSProperties} />)}
      {open && options.dragonflies !== false && !still && <>
        <span className="lp-fly is-a"><Dragonfly /></span>
        <span className="lp-fly is-b"><Dragonfly /></span>
      </>}
    </div>
    {preview && <p className="lp-preview">Preview · This is how your guests will see the invitation</p>}
    <Container className="lp-main" ref={root} aria-hidden={!open && stage !== 'leaving'}>
      {greeting && <p className="lp-greeting">Dear {greeting},</p>}
      {order.map(key => <Fragment key={key}><SectionAnchor section={key} />{render[key]()}</Fragment>)}
    </Container>

    <div className="lp-splashes" aria-hidden="true">
      {splashes.map(splash => <span key={splash.id} className="lp-splash" style={{ left: splash.x + 'px', top: splash.y + 'px' }}>
        <i /><i /><i />
      </span>)}
    </div>

    {music.available && open && <button type="button" className={'lp-music' + (music.blocked ? ' is-pulse' : '')}
      aria-pressed={music.playing} onClick={music.toggle}>
      {music.playing ? Icon.soundOn : Icon.soundOff}<span>{music.playing ? 'Music On' : 'Music Off'}</span>
    </button>}
  </div>
}

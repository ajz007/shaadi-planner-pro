import { Fragment, useEffect, useRef, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { EventArt, Icon } from '../../art'
import { downloadCalendar, mapLink, reducedMotion, useCountdown, useFitText, useFonts, useReveal, whatsappNumber } from '../../effects'
import { coupleNames, iconFor } from '../../model'
import { dayKey, dayLabel, lines, longDate, timeLabel } from '../../format'
import { useMusic } from '../../music'
import type { InvitationContent, InvitationEvent, InvitationPerson, SectionKey } from '../../model'
import type { TemplateProps } from '../../types'
import { SectionAnchor } from '../../SectionAnchor'
import { Constellation, Horizon, initialOf, Moon, Sigil, Spark, StarRule } from './art'
import { useSky } from './sky'
import './style.css'

const fonts = 'https://fonts.googleapis.com/css2?family=Italiana&family=Josefin+Sans:wght@400;600&family=Spectral:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400;1,500&family=Tiro+Devanagari+Hindi&display=swap'
const lockClass = 't-celestial-night-locked'
const interactive = 'a, button, input, select, textarea, label, summary, details, .invite-panel'

type Stage = 'closed' | 'joining' | 'lit' | 'leaving' | 'done'

function Opening({ names, title, date, greeting, hint, stage, onOpen, onContinue }: {
  names: [string, string]; title: string; date: string; greeting?: string; hint: string; stage: Stage; onOpen: () => void; onContinue: () => void
}) {
  const first = useRef<HTMLSpanElement>(null)
  const second = useRef<HTMLSpanElement>(null)
  useFitText(first, names[0])
  useFitText(second, names[1])
  const couple = names.filter(Boolean).join(' and ')
  return <div className="cn-opening" data-stage={stage} onClick={() => stage === 'lit' && onContinue()}>
    <Moon lit={.24} glow craters className="cn-op-moon" />
    <div className="cn-op-top">
      {greeting && <p className="cn-op-dear">Dear {greeting},</p>}
      <p className="cn-op-kicker">{title || 'Shubh Vivah'}</p>
    </div>
    <button type="button" className="cn-op-sky" data-open
      onClick={event => { event.stopPropagation(); if (stage === 'closed') onOpen(); else if (stage === 'lit') onContinue() }}
      aria-label={'Join the stars and open the wedding invitation of ' + couple}>
      <Constellation initials={[initialOf(names[0]), initialOf(names[1] || names[0])]} />
      <span className="cn-op-pulse" aria-hidden="true" />
    </button>
    <div className="cn-op-words" aria-hidden={stage === 'closed'}>
      <p className="cn-op-names">
        <span ref={first}>{names[0]}</span>
        {names[1] && <><em>&amp;</em><span ref={second}>{names[1]}</span></>}
      </p>
      <p className="cn-op-date">{date}</p>
    </div>
    <p className="cn-op-hint" aria-live="polite">{stage === 'lit' ? 'Tap anywhere to step into the night' : hint ||
      <>Tap the brightest star to open your invitation to {names[0]}{names[1] && <> &amp; {names[1]}</>}’s wedding</>}</p>
  </div>
}

function Head({ kicker, title, id }: { kicker?: string; title: string; id: string }) {
  return <header className="cn-head" data-reveal>
    {kicker && <p className="cn-kicker">{kicker}</p>}
    <h2 id={id}>{title}</h2>
    <StarRule />
  </header>
}

function Countdown({ target }: { target: number }) {
  const time = useCountdown(target)
  if (time.done) return null
  const cells: [number, number, string][] = [
    [time.days, Math.min(1, time.days / 30), 'Days'], [time.hours, time.hours / 24, 'Hours'],
    [time.minutes, time.minutes / 60, 'Minutes'], [time.seconds, time.seconds / 60, 'Seconds'],
  ]
  return <section className="cn-section cn-countdown" aria-labelledby="cn-count">
    <Head kicker="The moon keeps count" title="Until our night" id="cn-count" />
    <div className="cn-moons" data-reveal role="timer" aria-live="off">
      {cells.map(([value, lit, label]) => <div className="cn-moon-cell" key={label}>
        <Moon lit={Math.max(.04, lit)} className="cn-count-moon" />
        <strong>{String(value).padStart(2, '0')}</strong><span>{label}</span>
      </div>)}
    </div>
  </section>
}

function Person({ label, person }: { label: string; person: InvitationPerson }) {
  return <article className="cn-panel cn-person" data-reveal>
    <Spark className="cn-person-star" />
    <p className="cn-tag">{label}</p>
    {person.honorific && <p className="cn-honorific">{person.honorific}</p>}
    <h3>{person.name}</h3>
    {person.parents && <>
      <span className="cn-dots" aria-hidden="true"><i /><i /><i /></span>
      <p className="cn-label">{person.parentLabel}</p>
      <p className="cn-parents">{person.parents}</p>
    </>}
  </article>
}

// Functions as stars along one moonlit path. Each day's marker is a moon that
// waxes towards the last day.
function Path({ events, content, zone, sharedPlace }: { events: InvitationEvent[]; content: InvitationContent; zone: string; sharedPlace: string }) {
  const days = new Map<string, InvitationEvent[]>()
  for (const event of events) {
    const key = dayKey(event.startsAt, zone)
    days.set(key, [...(days.get(key) ?? []), event])
  }
  const list = [...days.values()]
  let side = 0
  return <ol className="cn-path">
    {list.map((dayEvents, d) => <li key={dayEvents[0].id} className="cn-night">
      <p className="cn-night-mark" data-reveal>
        <Moon lit={list.length === 1 ? 1 : .2 + .8 * d / (list.length - 1)} className="cn-night-moon" />
        <span>{dayLabel(dayEvents[0].startsAt, zone)}</span>
      </p>
      <ol>
        {dayEvents.map(event => {
          const style = content.events[event.id]
          const link = mapLink(event)
          return <li key={event.id} className={'cn-stop' + (side++ % 2 ? ' is-right' : ' is-left')} data-reveal>
            <span className="cn-stop-star" aria-hidden="true"><Spark /></span>
            <article className="cn-panel cn-stop-card">
              <span className="cn-stop-icon"><EventArt icon={iconFor(event, style)} /></span>
              <div className="cn-stop-text">
                <h3>{event.name}</h3>
                {style?.subtitle && <p className="cn-stop-sub">{style.subtitle}</p>}
                <p className="cn-time">{style?.timeLabel || timeLabel(event.startsAt, zone)}</p>
                {!sharedPlace && event.place && <p className="cn-stop-place">
                  {Icon.pin}<span>{event.place}</span>
                  {link && <a href={link} target="_blank" rel="noreferrer">Directions</a>}
                </p>}
              </div>
            </article>
          </li>
        })}
      </ol>
    </li>)}
  </ol>
}

function Families({ content }: { content: InvitationContent }) {
  return <>{content.families.map((family, i) => <section className="cn-section cn-families" key={i} aria-labelledby={'cn-family-' + i}>
    <Head kicker="The stars who guide us" title={family.heading || 'Our Families'} id={'cn-family-' + i} />
    <div className="cn-grid">
      {family.cards.map((card, j) => <article className="cn-panel cn-family" key={j} data-reveal>
        {card.title && <h3>{card.title}</h3>}
        {card.lines.map((line, k) => <div className="cn-family-line" key={k}>
          {line.relation && <p className="cn-label">{line.relation}</p>}
          {lines(line.names).map(name => <p className="cn-name" key={name}>{name}</p>)}
        </div>)}
      </article>)}
    </div>
  </section>)}</>
}

export default function CelestialNight({ page, invitation, manifest: design, options, greeting, rsvp, loadMusic, preview, embedded }: TemplateProps) {
  useFonts(fonts)
  const { content, events } = invitation
  const palette = String(options.palette ?? 'midnight')
  const meteors = options.shootingStars !== false
  const names = coupleNames(content, page.design.heading || page.name)
  const [stage, setStage] = useState<Stage>('closed')
  const [still] = useState(reducedMotion)
  const root = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const firstName = useRef<HTMLSpanElement>(null)
  const secondName = useRef<HTMLSpanElement>(null)
  const closingNames = useRef<HTMLParagraphElement>(null)
  const timers = useRef<number[]>([])
  const music = useMusic(loadMusic, invitation.hasMusic)
  const sky = useSky(canvas, palette)
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
  const join = () => {
    if (still) { finish(); return }
    go('joining')
    later(2250, () => {
      if (stageRef.current !== 'joining') return
      go('lit')
      if (meteors) sky.current.shoot(window.innerWidth * .78, window.innerHeight * .12)
    })
    later(7300, () => { if (stageRef.current === 'lit') finish() })
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
  const tapSky = (event: MouseEvent) => {
    if (!open || !meteors || (event.target as Element).closest(interactive)) return
    sky.current.shoot(event.clientX, event.clientY)
  }
  const wish = () => sky.current.shoot(window.innerWidth * (.3 + Math.random() * .4), window.innerHeight * .15, 5)

  const render: Record<SectionKey, () => ReactNode> = {
    hero: () => <section className="cn-section cn-hero" aria-label={coupleTitle}>
      <Moon lit={.24} glow craters className="cn-hero-moon" />
      <div className="cn-hero-body">
        {greeting && <p className="cn-greeting">Dear {greeting},</p>}
        {content.title && <p className="cn-kicker cn-hero-title">{content.title}</p>}
        <h1 className="cn-names">
          <span ref={firstName}>{names[0]}</span>
          {names[1] && <><span className="cn-amp" aria-hidden="true"><Spark /><em>&amp;</em><Spark /></span><span ref={secondName}>{names[1]}</span></>}
        </h1>
        <StarRule className="is-wide" />
        <p className="cn-date">{longDate(page.date)}</p>
        <div className="cn-actions">
          {events.length > 0 && <button type="button" className="cn-button" onClick={calendar}>{Icon.calendar}Keep the date</button>}
          {rsvp && <a className="cn-button is-quiet" href="#rsvp" onClick={toRsvp}>Reply to us</a>}
        </div>
      </div>
      <p className="cn-scroll" aria-hidden="true"><span>Follow the stars</span><i /></p>
    </section>,
    blessing: () => hasBlessing && <section className="cn-section cn-blessing" aria-label="Blessings">
      <div className="cn-panel cn-blessing-panel" data-reveal>
        {content.symbols.length > 0 && <div className="cn-sigils">
          {content.symbols.map((symbol, i) => <Sigil key={symbol} symbol={symbol} large={content.symbols.length === 3 ? i === 1 : i === 0} />)}
        </div>}
        {content.invocation && <p className="cn-invocation" lang="hi">{content.invocation}</p>}
        {content.shloka && <p className="cn-shloka" lang="sa">{lines(content.shloka).map(line => <span key={line}>{line}</span>)}</p>}
        {(content.deity || content.elders) && <StarRule />}
        {content.deity && <div className="cn-blessed">
          {content.blessingIntro && <p className="cn-soft">{content.blessingIntro}</p>}
          <p className="cn-deity">{content.deity}</p>
        </div>}
        {content.elders && <div className="cn-blessed">
          {content.eldersIntro && <p className="cn-soft">{content.eldersIntro}</p>}
          <p className="cn-elders">{content.elders}</p>
          {content.eldersNote && <p className="cn-note">{content.eldersNote}</p>}
        </div>}
        {page.design.coverPhoto && <figure className="cn-photo">
          <img src={'data:image/jpeg;base64,' + page.design.coverPhoto} alt={coupleTitle} />
        </figure>}
        {content.intro && <p className="cn-intro">{content.intro}</p>}
      </div>
    </section>,
    countdown: () => <Countdown target={target} />,
    couple: () => shownPeople.length > 0 && <section className="cn-section cn-couple" aria-labelledby="cn-couple">
      <Head kicker="Two stars, one sky" title={shownPeople.map(([label]) => label.replace('The ', '')).join(' & ')} id="cn-couple" />
      <div className={'cn-pair' + (shownPeople.length === 1 ? ' is-single' : '')}>
        {shownPeople.map(([label, person], i) => <Fragment key={label}>
          {i > 0 && <span className="cn-pair-link" aria-hidden="true"><em>&amp;</em></span>}
          <Person label={label} person={person} />
        </Fragment>)}
      </div>
    </section>,
    events: () => events.length > 0 && <section className="cn-section cn-events" aria-labelledby="cn-events">
      <Head kicker="Follow the moonlit path" title="Our Wedding Days" id="cn-events" />
      {sharedPlace && <a className="cn-chip" data-reveal href={mapLink(events[0]) || undefined} target="_blank" rel="noreferrer">
        {Icon.pin}<span>Every function at <strong>{sharedPlace}</strong></span>
      </a>}
      <Path events={events} content={content} zone={page.timeZone} sharedPlace={sharedPlace} />
    </section>,
    rsvp: () => rsvp && <section className="cn-section cn-rsvp" id="rsvp" aria-labelledby="cn-rsvp">
      <Head kicker="Send a light back" title="Will you share our night?" id="cn-rsvp" />
      {content.rsvpBy && <p className="cn-soft cn-rsvp-by" data-reveal>Kindly reply by {longDate(content.rsvpBy)}</p>}
      <div className="cn-panel cn-rsvp-panel" data-reveal>{rsvp}</div>
    </section>,
    family: () => <Families content={content} />,
    venue: () => (places.length > 0 || content.dressCode) && <section className="cn-section cn-venue" aria-labelledby="cn-venue">
      <Head kicker="Where the stars gather" title={sharedPlace || (places.length === 1 ? places[0].place : 'The Venues')} id="cn-venue" />
      <div className="cn-panel cn-venue-panel" data-reveal>
        <span className="cn-venue-mark" aria-hidden="true">{Icon.pin}</span>
        {places.map(place => <div className="cn-place" key={place.place}>
          {(!sharedPlace || places.length > 1) && <h3>{place.place}</h3>}
          {place.address && <p className="cn-address">{place.address}</p>}
          {!sharedPlace && mapLink(place) && <a className="cn-link" href={mapLink(place)} target="_blank" rel="noreferrer">{Icon.nav}Get directions</a>}
        </div>)}
        {content.dressCode && <div className="cn-attire">
          <p className="cn-label">What to wear</p>
          <p>{content.dressCode}</p>
        </div>}
        <div className="cn-actions">
          {events.length > 0 && <button type="button" className="cn-button is-quiet" onClick={calendar}>{Icon.calendar}Add to Calendar</button>}
          {sharedPlace && mapLink(events[0]) && <a className="cn-button" href={mapLink(events[0])} target="_blank" rel="noreferrer">{Icon.nav}Get Directions</a>}
        </div>
      </div>
    </section>,
    contacts: () => content.contacts.length > 0 && <section className="cn-section cn-contacts-section" aria-labelledby="cn-contacts">
      <Head kicker="If you lose your way" title="Call on us" id="cn-contacts" />
      <ul className="cn-contacts">
        {content.contacts.map(contact => <li className="cn-panel cn-contact" key={contact.name + contact.phone} data-reveal>
          <div>
            <h3>{contact.name}</h3>
            {contact.role && <p className="cn-label">{contact.role}</p>}
          </div>
          <div className="cn-contact-actions">
            <a className="cn-button is-small" href={'tel:' + contact.phone.replace(/[\s-]/g, '')} aria-label={'Call ' + contact.name}>{Icon.phone}Call</a>
            <a className="cn-button is-small is-quiet" href={'https://wa.me/' + whatsappNumber(contact.phone)} target="_blank" rel="noreferrer"
              aria-label={'WhatsApp ' + contact.name}>{Icon.chat}WhatsApp</a>
          </div>
        </li>)}
      </ul>
    </section>,
    closing: () => <section className="cn-section cn-closing" aria-label="Closing">
      <div className="cn-closing-sky" data-reveal aria-hidden="true">
        <Moon lit={1} glow craters className="cn-closing-moon" />
        <Horizon className="cn-closing-hills" />
      </div>
      {content.closing && <p className="cn-closing-line" data-reveal>{content.closing}</p>}
      <p className="cn-closing-names" data-reveal ref={closingNames}>{names[0]}{names[1] && <><em>&amp;</em>{names[1]}</>}</p>
      {sharedPlace && <div className="cn-blessed" data-reveal>
        <p className="cn-elders">{sharedPlace}</p>
        {events[0].address && <p className="cn-note">{events[0].address}</p>}
      </div>}
      {content.hosts && <div className="cn-blessed" data-reveal>
        {content.regardsIntro && <p className="cn-soft">{content.regardsIntro}</p>}
        <p className="cn-hosts">{content.hosts}</p>
      </div>}
      {meteors && !still && <button type="button" className="cn-button is-quiet cn-wish" data-reveal onClick={wish}><Spark />Make a wish</button>}
    </section>,
  }
  const order: SectionKey[] = design.sections.includes('rsvp') ? design.sections : [...design.sections, 'rsvp']

  const Container = embedded ? 'div' : 'main'
  return <div className="t-celestial-night" data-palette={palette} data-stage={stage} onClick={tapSky}>
    <div className="cn-backdrop" aria-hidden="true">
      <span className="cn-nebula is-a" /><span className="cn-nebula is-b" />
      <canvas ref={canvas} className="cn-stars" />
    </div>
    {stage !== 'done' && <Opening names={names} title={content.title} date={longDate(page.date)} greeting={greeting} hint={String(options.skyLine ?? '')}
      stage={stage} onOpen={join} onContinue={finish} />}
    {preview && <p className="cn-preview">Preview · This is how your guests will see the invitation</p>}
    <Container className="cn-main" ref={root} aria-hidden={!open && stage !== 'leaving'}>
      {order.map(key => <Fragment key={key}><SectionAnchor section={key} />{render[key]()}</Fragment>)}
    </Container>

    {music.available && open && <button type="button" className={'cn-music' + (music.blocked ? ' is-pulse' : '')}
      aria-pressed={music.playing} onClick={music.toggle}>
      {music.playing ? Icon.soundOn : Icon.soundOff}<span>{music.playing ? 'Music On' : 'Music Off'}</span>
    </button>}
  </div>
}


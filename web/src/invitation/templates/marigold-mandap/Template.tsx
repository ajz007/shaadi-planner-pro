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
import { BananaLeaf, Bloom, DiyaBowl, Door, GarlandRule, Ladi, LadiDefs, MangoToran, MedalBloom, SymbolBloom, Wreath } from './art'
import './style.css'

const fonts = 'https://fonts.googleapis.com/css2?family=Rozha+One&family=Lora:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600&family=Poppins:wght@400;500;600&family=Tiro+Devanagari+Hindi&display=swap'

type Stage = 'closed' | 'opening' | 'open' | 'leaving' | 'done'
type Petal = { id: number; x: number; y: number; dx: number; dy: number; spin: number; tone: number; delay: number; size: number; time: number }
type Scatter = (x: number, y: number, count: number, spread: number) => void

const rand = (min: number, max: number) => min + Math.random() * (max - min)
const fromCentre = (element: Element, scatter: Scatter, count: number, lift = 0.5) => {
  const box = element.getBoundingClientRect()
  scatter(box.left + box.width / 2, box.top + box.height * lift, count, box.width * 0.35)
}
// Restarts a CSS shake on the element each time it is tapped.
const shake = (element: HTMLElement) => {
  element.classList.remove('is-shaking')
  void element.offsetWidth
  element.classList.add('is-shaking')
  window.setTimeout(() => element.classList.remove('is-shaking'), 1500)
}

function Opening({ names, title, date, greeting, hint, stage, onOpen, onContinue }: {
  names: [string, string]; title: string; date: string; greeting?: string; hint: string; stage: Stage; onOpen: () => void; onContinue: () => void
}) {
  const first = useRef<HTMLSpanElement>(null)
  const second = useRef<HTMLSpanElement>(null)
  useFitText(first, names[0])
  useFitText(second, names[1])
  return <div className="mm-opening" data-stage={stage} onClick={() => stage === 'open' && onContinue()}>
    <div className="mm-opening-fringe" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <Ladi key={i} />)}</div>
    <MangoToran className="mm-opening-toran" />
    <BananaLeaf className="mm-opening-leaf is-l" /><BananaLeaf className="mm-opening-leaf is-r" />
    <div className="mm-gate">
      <div className="mm-lintel" aria-hidden="true">
        <span className="mm-plaque">{greeting ? <>Dear {greeting},</> : 'Welcome'}</span>
      </div>
      <div className="mm-frame">
        <div className="mm-inside" aria-hidden={stage === 'closed'}>
          <span className="mm-inside-glow" />
          <span className="mm-inside-title">{title || 'Shubh Vivah'}</span>
          <span className="mm-inside-names">
            <span ref={first}>{names[0]}</span>
            {names[1] && <><em>&amp;</em><span ref={second}>{names[1]}</span></>}
          </span>
          <GarlandRule />
          <span className="mm-inside-date">{date}</span>
          <span className="mm-inside-note">invite you to the celebrations</span>
        </div>
        <button type="button" className="mm-doors" data-open onClick={event => { event.stopPropagation(); if (stage === 'closed') onOpen(); else if (stage === 'open') onContinue() }}
          aria-label={'Open the doors to the wedding invitation of ' + names.filter(Boolean).join(' and ')}>
          <span className="mm-door is-left"><Door side="left" /></span>
          <span className="mm-door is-right"><Door side="right" /></span>
        </button>
        <Ladi className="mm-frame-ladi is-l" /><Ladi className="mm-frame-ladi is-r" />
        <svg className="mm-frame-swag" viewBox="0 0 300 70" aria-hidden="true">
          {Array.from({ length: 17 }, (_, i) => {
            const t = i / 16, x = 10 + t * 280, y = 10 + Math.sin(t * Math.PI) * 46
            return <Bloom key={i} x={x} y={y} r={10} alt={i % 2 === 1} />
          })}
        </svg>
      </div>
      <div className="mm-step" aria-hidden="true">
        <span className="mm-step-diya is-l"><i /><DiyaBowl /></span>
        <span className="mm-step-diya is-r"><i /><DiyaBowl /></span>
      </div>
    </div>
    <p className="mm-opening-hint" aria-live="polite">{stage === 'open' ? 'Tap anywhere to step inside' : hint ||
      <>Knock to open the doors to {names[0]}{names[1] && <> &amp; {names[1]}</>}’s wedding</>}</p>
  </div>
}

function Head({ kicker, title, id }: { kicker?: string; title: string; id: string }) {
  return <header className="mm-head" data-reveal>
    {kicker && <p className="mm-kicker">{kicker}</p>}
    <h2 id={id}>{title}</h2>
    <GarlandRule />
  </header>
}

function Countdown({ target }: { target: number }) {
  const time = useCountdown(target)
  if (time.done) return null
  const cells: [number, string][] = [[time.days, 'Days'], [time.hours, 'Hours'], [time.minutes, 'Minutes'], [time.seconds, 'Seconds']]
  return <section className="mm-section mm-countdown" aria-labelledby="mm-count">
    <p className="mm-kicker" id="mm-count" data-reveal>The dhol starts in</p>
    <div className="mm-diyas" data-reveal role="timer" aria-live="off">
      {cells.map(([value, label], i) => <div className="mm-diya" key={label} style={{ '--i': i } as CSSProperties}>
        <span className="mm-flame" aria-hidden="true" />
        <span className="mm-diya-body"><DiyaBowl /><strong>{String(value).padStart(2, '0')}</strong></span>
        <span className="mm-diya-label">{label}</span>
      </div>)}
    </div>
  </section>
}

function Person({ label, person }: { label: string; person: InvitationPerson }) {
  return <article className="mm-card mm-person" data-reveal>
    <MangoToran className="mm-card-toran" tiles={8} />
    <p className="mm-tag">{label}</p>
    <h3>{person.honorific && <span className="mm-honorific">{person.honorific} </span>}{person.name}</h3>
    {person.parents && <>
      <p className="mm-label">{person.parentLabel}</p>
      <p className="mm-parents">{person.parents}</p>
    </>}
  </article>
}

function Garlands({ events, content, zone, sharedPlace, scatter, still }: {
  events: InvitationEvent[]; content: InvitationContent; zone: string; sharedPlace: string; scatter: Scatter; still: boolean
}) {
  const days = new Map<string, InvitationEvent[]>()
  for (const event of events) {
    const key = dayKey(event.startsAt, zone)
    days.set(key, [...(days.get(key) ?? []), event])
  }
  return <ol className="mm-days">
    {[...days.values()].map((dayEvents, d) => <li key={dayEvents[0].id} className="mm-day">
      <p className="mm-rod" data-reveal><span>{Icon.calendar}<span className="mm-rod-n">Day {d + 1}</span>{dayLabel(dayEvents[0].startsAt, zone)}</span></p>
      <ol className="mm-strands" data-count={dayEvents.length}>
        {dayEvents.map(event => {
          const style = content.events[event.id]
          const link = mapLink(event)
          const art = <>
            <Ladi />
            <span className="mm-medal"><MedalBloom /><EventArt icon={iconFor(event, style)} /></span>
          </>
          return <li key={event.id} className="mm-hang" data-reveal>
            {still ? <span className="mm-garland">{art}</span>
              : <button type="button" className="mm-garland" aria-label={'Shake the ' + event.name + ' garland'}
                onClick={(click: MouseEvent<HTMLButtonElement>) => {
                  shake(click.currentTarget)
                  const medal = click.currentTarget.querySelector('.mm-medal')
                  if (medal) fromCentre(medal, scatter, 12, 0.7)
                }}>{art}</button>}
            <div className="mm-card mm-event">
              <h3>{event.name}</h3>
              {style?.subtitle && <p className="mm-event-sub">{style.subtitle}</p>}
              <p className="mm-time">{style?.timeLabel || timeLabel(event.startsAt, zone)}</p>
              {!sharedPlace && event.place && <p className="mm-event-place">
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
  return <>{content.families.map((family, i) => <section className="mm-section" key={i} aria-labelledby={'mm-family-' + i}>
    <Head kicker="Waiting to welcome you" title={family.heading || 'Our Families'} id={'mm-family-' + i} />
    <div className="mm-family-grid">
      {family.cards.map((card, j) => <article className="mm-card mm-family" key={j} data-reveal>
        {card.title && <h3>{card.title}</h3>}
        {card.lines.map((line, k) => <div className="mm-family-line" key={k}>
          {line.relation && <p className="mm-label">{line.relation}</p>}
          {lines(line.names).map(name => <p className="mm-name" key={name}>{name}</p>)}
        </div>)}
      </article>)}
    </div>
  </section>)}</>
}

export default function MarigoldMandap({ page, invitation, manifest: design, options, greeting, rsvp, loadMusic, preview }: TemplateProps) {
  useFonts(fonts)
  const { content, events } = invitation
  const palette = String(options.palette ?? 'saffron')
  const names = coupleNames(content, page.design.heading || page.name)
  const [stage, setStage] = useState<Stage>('closed')
  const [petals, setPetals] = useState<Petal[]>([])
  const [still] = useState(reducedMotion)
  const root = useRef<HTMLElement>(null)
  const firstName = useRef<HTMLSpanElement>(null)
  const secondName = useRef<HTMLSpanElement>(null)
  const canopy = useRef<HTMLButtonElement>(null)
  const timers = useRef<number[]>([])
  const petalId = useRef(0)
  const music = useMusic(loadMusic, invitation.hasMusic)
  const open = stage === 'done'
  useReveal(root, open)
  useFitText(firstName, names[0])
  useFitText(secondName, names[1])

  const coupleTitle = names.filter(Boolean).join(' & ')
  useEffect(() => {
    const title = document.title
    document.title = coupleTitle + ' | Wedding Invitation'
    return () => { document.title = title }
  }, [coupleTitle])
  useEffect(() => {
    document.documentElement.classList.toggle('t-marigold-mandap-locked', !open)
    return () => document.documentElement.classList.remove('t-marigold-mandap-locked')
  }, [open])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // Petals are short-lived spans in one fixed layer; each removes itself when its fall ends.
  const scatter: Scatter = (x, y, count, spread) => {
    if (still) return
    const small = window.innerWidth < 700
    const batch = Array.from({ length: small ? Math.ceil(count * 0.7) : count }, () => ({
      id: ++petalId.current, x: x + rand(-spread, spread), y: y + rand(-12, 12), dx: rand(-80, 80), dy: rand(window.innerHeight * 0.35, window.innerHeight * 0.75),
      spin: rand(-600, 600), tone: Math.floor(rand(0, 3)), delay: rand(0, 0.35), size: rand(0.75, 1.35), time: rand(2.2, 3.6),
    }))
    setPetals(current => [...current.slice(-90), ...batch])
  }
  const shower = () => {
    const width = window.innerWidth
    for (let i = 0; i < 6; i++) scatter(width * (i + 0.5) / 6, -20, 6, width / 12)
  }

  const stageRef = useRef<Stage>('closed')
  const go = (next: Stage) => { stageRef.current = next; setStage(next) }
  const later = (ms: number, work: () => void) => { timers.current.push(window.setTimeout(work, ms)) }
  const finish = () => {
    if (stageRef.current === 'leaving' || stageRef.current === 'done') return
    go('leaving')
    later(still ? 0 : 800, () => { go('done'); window.scrollTo(0, 0) })
    later(still ? 50 : 1000, music.start)
  }
  const openDoors = () => {
    if (still) { finish(); return }
    go('opening')
    later(450, () => {
      const swag = document.querySelector('.t-marigold-mandap .mm-frame-swag')
      if (swag) fromCentre(swag, scatter, 22, 0.4)
    })
    later(2000, () => { if (stageRef.current === 'opening') go('open') })
    later(7000, () => { if (stageRef.current === 'open') finish() })
  }

  const sharedPlace = events.length > 0 && events.every(event => event.place && event.place === events[0].place) ? events[0].place : ''
  const places = [...new Map(events.filter(event => event.place).map(event => [event.place, event])).values()]
  const target = events.length ? Date.parse(events[0].startsAt) : Date.parse(page.date + 'T00:00:00Z')
  const calendar = () => downloadCalendar(names.filter(Boolean).join('-') + '-wedding.ics', coupleTitle + ' Wedding', events,
    content.dressCode ? 'Dress code: ' + content.dressCode : '')
  const people: [string, InvitationPerson][] = content.brideFirst
    ? [['Bride-to-be', content.bride], ['Groom-to-be', content.groom]] : [['Groom-to-be', content.groom], ['Bride-to-be', content.bride]]
  const showCouple = people.some(([, person]) => person.name)
  const hasBlessing = !!(content.symbols.length || content.invocation || content.shloka || content.deity || content.elders || content.intro || greeting || page.design.coverPhoto)
  const toRsvp = (event: MouseEvent) => { event.preventDefault(); document.getElementById('rsvp')?.scrollIntoView({ behavior: still ? 'auto' : 'smooth' }) }

  const render: Record<SectionKey, () => ReactNode> = {
    blessing: () => hasBlessing && <section className="mm-section mm-blessing">
      {content.symbols.length > 0 && <div className="mm-symbols" data-reveal>
        {content.symbols.map((symbol, i) => <SymbolBloom key={symbol} symbol={symbol} large={content.symbols.length === 3 ? i === 1 : i === 0} />)}
      </div>}
      {content.invocation && <p className="mm-invocation" data-reveal lang="hi">{content.invocation}</p>}
      {content.shloka && <p className="mm-shloka" data-reveal lang="sa">{lines(content.shloka).map(line => <span key={line}>{line}</span>)}</p>}
      {content.deity && <div className="mm-blessed" data-reveal>
        {content.blessingIntro && <p className="mm-soft">{content.blessingIntro}</p>}
        <p className="mm-deity">{content.deity}</p>
      </div>}
      {content.elders && <div className="mm-blessed" data-reveal>
        {content.eldersIntro && <p className="mm-soft">{content.eldersIntro}</p>}
        <p className="mm-elders">{content.elders}</p>
        {content.eldersNote && <p className="mm-note">{content.eldersNote}</p>}
      </div>}
      {greeting && <p className="mm-greeting" data-reveal>Dear {greeting},</p>}
      {content.intro && <p className="mm-intro" data-reveal>{content.intro}</p>}
      {page.design.coverPhoto && <figure className="mm-photo" data-reveal>
        <img src={'data:image/jpeg;base64,' + page.design.coverPhoto} alt={coupleTitle} />
        <Wreath />
      </figure>}
    </section>,
    hero: () => <section className="mm-section mm-hero" aria-label={coupleTitle}>
      {content.title && <p className="mm-hero-title" data-reveal><span>{content.title}</span></p>}
      <h1 className="mm-names" data-reveal>
        <span ref={firstName}>{names[0]}</span>
        {names[1] && <><span className="mm-amp"><svg viewBox="-12 -12 24 24" aria-hidden="true"><Bloom r={11} /></svg><em>&amp;</em><svg viewBox="-12 -12 24 24" aria-hidden="true"><Bloom r={11} alt /></svg></span><span ref={secondName}>{names[1]}</span></>}
      </h1>
      <p className="mm-date" data-reveal>{longDate(page.date)}</p>
      <div className="mm-actions" data-reveal>
        {events.length > 0 && <button type="button" className="mm-button" onClick={calendar}>{Icon.calendar}Mark the date</button>}
        {rsvp && <a className="mm-button is-light" href="#rsvp" onClick={toRsvp}>Send your reply</a>}
      </div>
    </section>,
    countdown: () => <Countdown target={target} />,
    couple: () => showCouple && <section className="mm-section" aria-labelledby="mm-couple">
      <Head kicker="Two families, one garland" title="The Couple" id="mm-couple" />
      <div className="mm-pair">{people.map(([label, person]) => person.name && <Person key={label} label={label} person={person} />)}</div>
    </section>,
    events: () => events.length > 0 && <section className="mm-section mm-events" aria-labelledby="mm-events">
      <Head kicker="Come, celebrate with us" title="Days of Celebration" id="mm-events" />
      {sharedPlace && <a className="mm-venue-chip" data-reveal href={mapLink(events[0]) || undefined} target="_blank" rel="noreferrer">
        {Icon.pin}<span>Every function at <strong>{sharedPlace}</strong></span>
      </a>}
      {!still && <p className="mm-tip" data-reveal>Tap a garland to shake loose a few petals</p>}
      <Garlands events={events} content={content} zone={page.timeZone} sharedPlace={sharedPlace} scatter={scatter} still={still} />
    </section>,
    rsvp: () => rsvp && <section className="mm-section mm-rsvp" id="rsvp" aria-labelledby="mm-rsvp">
      <Head kicker="Your reply" title="Tell us you’re coming" id="mm-rsvp" />
      {content.rsvpBy && <p className="mm-soft mm-rsvp-by" data-reveal>Kindly reply by {longDate(content.rsvpBy)}</p>}
      <div className="mm-rsvp-body" data-reveal>{rsvp}</div>
    </section>,
    family: () => <Families content={content} />,
    venue: () => (places.length > 0 || content.dressCode) && <section className="mm-section" aria-labelledby="mm-venue">
      <Head kicker="Find your way" title={sharedPlace || (places.length === 1 ? places[0].place : 'The Venues')} id="mm-venue" />
      <div className="mm-venue-grid">
        {places.map(place => <article className="mm-card mm-place" key={place.place} data-reveal>
          <BananaLeaf className="mm-place-leaf" />
          <span className="mm-place-icon">{Icon.pin}</span>
          <p className="mm-label">Venue</p>
          <h3>{place.place}</h3>
          {place.address && <p className="mm-address">{place.address}</p>}
          {!sharedPlace && mapLink(place) && <a className="mm-link" href={mapLink(place)} target="_blank" rel="noreferrer">Get directions</a>}
        </article>)}
        {content.dressCode && <article className="mm-card mm-place is-dress" data-reveal>
          <span className="mm-place-icon">{Icon.sparkle}</span>
          <p className="mm-label">What to wear</p>
          <p className="mm-address">{content.dressCode}</p>
        </article>}
      </div>
      <div className="mm-actions" data-reveal>
        {events.length > 0 && <button type="button" className="mm-button is-light" onClick={calendar}>{Icon.calendar}Add to Calendar</button>}
        {sharedPlace && mapLink(events[0]) && <a className="mm-button" href={mapLink(events[0])} target="_blank" rel="noreferrer">{Icon.nav}Get Directions</a>}
      </div>
    </section>,
    contacts: () => content.contacts.length > 0 && <section className="mm-section" aria-labelledby="mm-contacts">
      <Head kicker="Any questions?" title="Call the Family" id="mm-contacts" />
      <div className="mm-contacts">
        {content.contacts.map(contact => <article className="mm-card mm-contact" key={contact.name + contact.phone} data-reveal>
          <h3>{contact.name}</h3>
          {contact.role && <p className="mm-label">{contact.role}</p>}
          <div className="mm-contact-actions">
            <a className="mm-button is-small" href={'tel:' + contact.phone.replace(/[\s-]/g, '')} aria-label={'Call ' + contact.name}>{Icon.phone}Call</a>
            <a className="mm-button is-small is-light" href={'https://wa.me/' + whatsappNumber(contact.phone)} target="_blank" rel="noreferrer"
              aria-label={'WhatsApp ' + contact.name}>{Icon.chat}WhatsApp</a>
          </div>
        </article>)}
      </div>
    </section>,
    closing: () => <section className="mm-section mm-closing" aria-label="Closing">
      {content.closing && <p className="mm-closing-line" data-reveal>{content.closing}</p>}
      <p className="mm-closing-names" data-reveal>{coupleTitle}</p>
      {sharedPlace && <div className="mm-blessed" data-reveal>
        <p className="mm-elders">{sharedPlace}</p>
        {events[0].address && <p className="mm-note">{events[0].address}</p>}
      </div>}
      {content.hosts && <div className="mm-blessed" data-reveal>
        {content.regardsIntro && <p className="mm-soft">{content.regardsIntro}</p>}
        <p className="mm-hosts">{content.hosts}</p>
      </div>}
      {options.petalShower !== false && !still && <button type="button" className="mm-button" data-reveal onClick={shower}>
        <svg viewBox="-12 -12 24 24" aria-hidden="true"><Bloom r={11} /></svg>Shower the couple with petals</button>}
      <div className="mm-closing-art" aria-hidden="true">
        <BananaLeaf className="is-l" /><span className="mm-closing-diya"><span className="mm-flame" /><DiyaBowl /></span><BananaLeaf className="is-r" />
      </div>
    </section>,
  }
  const strands = Array.from({ length: 15 }, (_, i) => <Ladi key={i} style={{ '--k': i } as CSSProperties} />)
  const order: SectionKey[] = design.sections.includes('rsvp') ? design.sections : [...design.sections, 'rsvp']

  return <div className="t-marigold-mandap" data-palette={palette} data-stage={stage}>
    {stage !== 'done' && <Opening names={names} title={content.title} date={longDate(page.date)} greeting={greeting} hint={String(options.doorLine ?? '')}
      stage={stage} onOpen={openDoors} onContinue={finish} />}
    <LadiDefs />
    <div className="mm-backdrop" aria-hidden="true">
      <span className="mm-pillar is-l"><Ladi /><Ladi /></span><span className="mm-pillar is-r"><Ladi /><Ladi /></span>
    </div>
    {preview && <p className="mm-preview">Preview · This is how your guests will see the invitation</p>}
    <main className="mm-main" ref={root} aria-hidden={!open && stage !== 'leaving'}>
      <div className="mm-canopy">
        <div className="mm-canopy-cloth" aria-hidden="true" />
        {still ? <div className="mm-canopy-strands" aria-hidden="true">{strands}</div>
          : <button type="button" ref={canopy} className="mm-canopy-strands" aria-label="Shake the canopy garlands" onClick={() => {
            if (!canopy.current) return
            shake(canopy.current)
            canopy.current.querySelectorAll('.mm-ladi:nth-child(3n+2)').forEach(strand => fromCentre(strand, scatter, 3, 1))
          }}>{strands}</button>}
        <MangoToran className="mm-canopy-toran" />
      </div>
      <div className="mm-sheet">
        {order.map(key => <Fragment key={key}><SectionAnchor section={key} />{render[key]()}</Fragment>)}
      </div>
    </main>

    {petals.length > 0 && <div className="mm-petals" aria-hidden="true">{petals.map(petal => <i key={petal.id} data-tone={petal.tone} style={{
      left: petal.x + 'px', top: petal.y + 'px', '--dx': petal.dx + 'px', '--dy': petal.dy + 'px', '--spin': petal.spin + 'deg',
      '--dl': petal.delay + 's', '--s': petal.size, '--t': petal.time + 's',
    } as CSSProperties} onAnimationEnd={() => setPetals(current => current.filter(item => item.id !== petal.id))} />)}</div>}

    {music.available && open && <button type="button" className={'mm-music' + (music.blocked ? ' is-pulse' : '')}
      aria-pressed={music.playing} onClick={music.toggle}>
      {music.playing ? Icon.soundOn : Icon.soundOff}<span>{music.playing ? 'Music On' : 'Music Off'}</span>
    </button>}
  </div>
}

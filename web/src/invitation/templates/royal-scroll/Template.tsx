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
import { BorderStrip, Cartouche, Coin, Corner, ElephantSolo, Finial, Jhalar, JaliField, Rule, SymbolMedal, Tassel, WaxSeal } from './art'
import type { Scene } from './art'
import './style.css'

const fonts = 'https://fonts.googleapis.com/css2?family=Pinyon+Script&family=IM+Fell+English+SC&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Tiro+Devanagari+Sanskrit&display=swap'
const lockClass = 't-royal-scroll-locked'

type Stage = 'closed' | 'unrolling' | 'open' | 'leaving' | 'done'

const ordinals = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh']
function roman(n: number) {
  const table: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let out = ''
  for (const [value, glyph] of table) while (n >= value) { out += glyph; n -= value }
  return out
}

// A turned wooden rod with gold finials (the scroll's top), or the fat roll of
// paper still wound up (its bottom).
function Rod() {
  return <div className="rs-rod" aria-hidden="true"><Finial className="rs-finial is-l" /><span className="rs-rod-bar" /><Finial className="rs-finial is-r" /></div>
}
function Roll({ className }: { className?: string }) {
  return <div className={'rs-roll ' + (className ?? '')} aria-hidden="true">
    <Finial className="rs-finial is-l" />
    <span className="rs-roll-body"><span className="rs-roll-grain" /></span>
    <Finial className="rs-finial is-r" />
  </div>
}

function Opening({ names, title, date, greeting, hint, stage, onOpen, onContinue }: {
  names: [string, string]; title: string; date: string; greeting?: string; hint: string; stage: Stage; onOpen: () => void; onContinue: () => void
}) {
  const first = useRef<HTMLSpanElement>(null)
  const second = useRef<HTMLSpanElement>(null)
  useFitText(first, names[0])
  useFitText(second, names[1])
  const initials: [string, string] = [names[0].charAt(0).toUpperCase(), names[1].charAt(0).toUpperCase()]
  return <div className="rs-opening" data-stage={stage} onClick={() => stage === 'open' && onContinue()}>
    <JaliField className="rs-opening-jali" />
    <div className="rs-valance" aria-hidden="true">{Array.from({ length: 34 }, (_, i) => <Jhalar key={i} className="rs-jhalar" />)}</div>
    <ElephantSolo className="rs-opening-elephant is-l" /><ElephantSolo className="rs-opening-elephant is-r" />
    <div className="rs-unroll">
      <Rod />
      <div className="rs-window">
        <div className="rs-clip">
          <div className="rs-sheet" aria-hidden={stage === 'closed'}>
            <BorderStrip className="rs-strip is-l" /><BorderStrip className="rs-strip is-r" />
            <div className="rs-sheet-body">
              <Cartouche scene="peacocks" className="rs-sheet-art" />
              {greeting && <span className="rs-sheet-dear">Dear {greeting},</span>}
              <span className="rs-sheet-title">{title || 'Shubh Vivah'}</span>
              <span className="rs-sheet-names">
                <span ref={first}>{names[0]}</span>
                {names[1] && <><em>&amp;</em><span ref={second}>{names[1]}</span></>}
              </span>
              <Rule />
              <span className="rs-sheet-date">{date}</span>
              <span className="rs-sheet-note">request the honour of your presence</span>
            </div>
          </div>
        </div>
        <Roll className="is-bottom" />
      </div>
      <button type="button" className="rs-tie" data-open onClick={event => { event.stopPropagation(); if (stage === 'closed') onOpen(); else if (stage === 'open') onContinue() }}
        aria-label={'Break the seal and unroll the wedding invitation of ' + names.filter(Boolean).join(' and ')}>
        <span className="rs-band" />
        <Tassel className="rs-tassel" />
        <span className="rs-seal"><span className="rs-seal-glow" /><WaxSeal initials={initials} className="rs-seal-art" /></span>
        <span className="rs-crumbs">{Array.from({ length: 7 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}</span>
      </button>
    </div>
    <p className="rs-opening-hint" aria-live="polite">{stage === 'open' ? 'Tap anywhere to read on' : hint ||
      <>Break the seal to unroll the invitation to {names[0]}{names[1] && <> &amp; {names[1]}</>}’s wedding</>}</p>
  </div>
}

function Head({ scene, kicker, title, id }: { scene: Scene; kicker?: string; title: string; id: string }) {
  return <header className="rs-head" data-reveal>
    <Cartouche scene={scene} />
    {kicker && <p className="rs-kicker">{kicker}</p>}
    <h2 id={id}>{title}</h2>
  </header>
}

function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <article className={'rs-panel ' + (className ?? '')} data-reveal>
    <Corner className="rs-corner is-tl" /><Corner className="rs-corner is-tr" /><Corner className="rs-corner is-bl" /><Corner className="rs-corner is-br" />
    {children}
  </article>
}

function Countdown({ target }: { target: number }) {
  const time = useCountdown(target)
  if (time.done) return null
  const cells: [number, string][] = [[time.days, 'Days'], [time.hours, 'Hours'], [time.minutes, 'Minutes'], [time.seconds, 'Seconds']]
  return <section className="rs-section rs-countdown" aria-labelledby="rs-count">
    <p className="rs-kicker" id="rs-count" data-reveal>The court assembles in</p>
    <div className="rs-coins" data-reveal role="timer" aria-live="off">
      {cells.map(([value, label]) => <div className="rs-coin" key={label}>
        <span className="rs-coin-face"><Coin /><strong>{String(value).padStart(2, '0')}</strong></span>
        <span className="rs-coin-label">{label}</span>
      </div>)}
    </div>
  </section>
}

function Person({ label, person }: { label: string; person: InvitationPerson }) {
  return <Panel className="rs-person">
    <p className="rs-tag">{label}</p>
    {person.honorific && <p className="rs-honorific">{person.honorific}</p>}
    <h3>{person.name}</h3>
    {person.parents && <>
      <Rule className="rs-rule is-small" />
      <p className="rs-label">{person.parentLabel}</p>
      <p className="rs-parents">{person.parents}</p>
    </>}
  </Panel>
}

function Itinerary({ events, content, zone, sharedPlace }: { events: InvitationEvent[]; content: InvitationContent; zone: string; sharedPlace: string }) {
  const days = new Map<string, InvitationEvent[]>()
  for (const event of events) {
    const key = dayKey(event.startsAt, zone)
    days.set(key, [...(days.get(key) ?? []), event])
  }
  let number = 0
  return <ol className="rs-days">
    {[...days.values()].map((dayEvents, d) => <li key={dayEvents[0].id} className="rs-day">
      <p className="rs-ribbon" data-reveal>
        <span className="rs-ribbon-n">{ordinals[d] ? ordinals[d] + ' day' : 'Day ' + (d + 1)}</span>
        <span className="rs-ribbon-date">{dayLabel(dayEvents[0].startsAt, zone)}</span>
      </p>
      <ol className="rs-entries">
        {dayEvents.map(event => {
          const style = content.events[event.id]
          const link = mapLink(event)
          number++
          return <li key={event.id} className="rs-entry" data-reveal>
            <span className="rs-entry-art">
              <EventArt icon={iconFor(event, style)} />
              <span className="rs-entry-n" aria-hidden="true">{roman(number)}</span>
            </span>
            <div className="rs-entry-text">
              <h3>{event.name}</h3>
              {style?.subtitle && <p className="rs-entry-sub">{style.subtitle}</p>}
              <p className="rs-entry-time">{style?.timeLabel || timeLabel(event.startsAt, zone)}</p>
              {!sharedPlace && event.place && <p className="rs-entry-place">
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
  return <>{content.families.map((family, i) => <section className="rs-section" key={i} aria-labelledby={'rs-family-' + i}>
    <Head scene={i % 2 ? 'horses' : 'lotus'} kicker="Of the households" title={family.heading || 'Our Families'} id={'rs-family-' + i} />
    <div className="rs-grid">
      {family.cards.map((card, j) => <Panel className="rs-family" key={j}>
        {card.title && <h3>{card.title}</h3>}
        {card.lines.map((line, k) => <div className="rs-family-line" key={k}>
          {line.relation && <p className="rs-label">{line.relation}</p>}
          {lines(line.names).map(name => <p className="rs-name" key={name}>{name}</p>)}
        </div>)}
      </Panel>)}
    </div>
  </section>)}</>
}

export default function RoyalScroll({ page, invitation, manifest: design, options, greeting, rsvp, loadMusic, preview }: TemplateProps) {
  useFonts(fonts)
  const { content, events } = invitation
  const palette = String(options.palette ?? 'maroon')
  const names = coupleNames(content, page.design.heading || page.name)
  const [stage, setStage] = useState<Stage>('closed')
  const [still] = useState(reducedMotion)
  const root = useRef<HTMLElement>(null)
  const edge = useRef<HTMLDivElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const firstName = useRef<HTMLSpanElement>(null)
  const secondName = useRef<HTMLSpanElement>(null)
  const closingNames = useRef<HTMLParagraphElement>(null)
  const timers = useRef<number[]>([])
  const music = useMusic(loadMusic, invitation.hasMusic)
  const open = stage === 'done'
  const rolling = options.rollingEdge !== false && !still
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

  // The rolled edge at the foot of the screen thins and turns as the guest
  // reads on, and hands over to the real end of the scroll when it arrives.
  useEffect(() => {
    const element = edge.current
    if (!open || !rolling || !element) return
    let frame = 0
    const update = () => {
      frame = 0
      const room = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
      const progress = Math.min(1, Math.max(0, window.scrollY / room))
      element.style.setProperty('--p', progress.toFixed(3))
      element.style.setProperty('--turn', ((window.scrollY * 0.35) % 14).toFixed(1) + 'px')
      const docked = (end.current?.getBoundingClientRect().top ?? Infinity) < window.innerHeight - 8
      element.classList.toggle('is-docked', docked)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [open, rolling])

  const stageRef = useRef<Stage>('closed')
  const go = (next: Stage) => { stageRef.current = next; setStage(next) }
  const later = (ms: number, work: () => void) => { timers.current.push(window.setTimeout(work, ms)) }
  const finish = () => {
    if (stageRef.current === 'leaving' || stageRef.current === 'done') return
    go('leaving')
    later(still ? 0 : 800, () => { go('done'); window.scrollTo(0, 0) })
    later(still ? 50 : 1000, music.start)
  }
  const unroll = () => {
    if (still) { finish(); return }
    go('unrolling')
    later(2500, () => { if (stageRef.current === 'unrolling') go('open') })
    later(7500, () => { if (stageRef.current === 'open') finish() })
  }

  const sharedPlace = events.length > 0 && events.every(event => event.place && event.place === events[0].place) ? events[0].place : ''
  const places = [...new Map(events.filter(event => event.place).map(event => [event.place, event])).values()]
  const target = events.length ? Date.parse(events[0].startsAt) : Date.parse(page.date + 'T00:00:00Z')
  const calendar = () => downloadCalendar(names.filter(Boolean).join('-') + '-wedding.ics', coupleTitle + ' Wedding', events,
    content.dressCode ? 'Dress code: ' + content.dressCode : '')
  const people: [string, InvitationPerson][] = content.brideFirst
    ? [['The Bride', content.bride], ['The Groom', content.groom]] : [['The Groom', content.groom], ['The Bride', content.bride]]
  const showCouple = people.some(([, person]) => person.name)
  const hasBlessing = !!(content.symbols.length || content.invocation || content.shloka || content.deity || content.elders || content.intro || greeting || page.design.coverPhoto)
  const toRsvp = (event: MouseEvent) => { event.preventDefault(); document.getElementById('rsvp')?.scrollIntoView({ behavior: still ? 'auto' : 'smooth' }) }
  const initials: [string, string] = [names[0].charAt(0).toUpperCase(), names[1].charAt(0).toUpperCase()]

  const render: Record<SectionKey, () => ReactNode> = {
    blessing: () => hasBlessing && <section className="rs-section rs-blessing">
      {content.symbols.length > 0 && <div className="rs-symbols" data-reveal>
        {content.symbols.map((symbol, i) => <SymbolMedal key={symbol} symbol={symbol} large={content.symbols.length === 3 ? i === 1 : i === 0} />)}
      </div>}
      {content.invocation && <p className="rs-invocation" data-reveal lang="hi">{content.invocation}</p>}
      {content.shloka && <p className="rs-shloka" data-reveal lang="sa">{lines(content.shloka).map(line => <span key={line}>{line}</span>)}</p>}
      {(content.deity || content.elders) && <Rule />}
      {content.deity && <div className="rs-blessed" data-reveal>
        {content.blessingIntro && <p className="rs-soft">{content.blessingIntro}</p>}
        <p className="rs-deity">{content.deity}</p>
      </div>}
      {content.elders && <div className="rs-blessed" data-reveal>
        {content.eldersIntro && <p className="rs-soft">{content.eldersIntro}</p>}
        <p className="rs-elders">{content.elders}</p>
        {content.eldersNote && <p className="rs-note">{content.eldersNote}</p>}
      </div>}
      {greeting && <p className="rs-greeting" data-reveal>Dear {greeting},</p>}
      {content.intro && <p className="rs-intro" data-reveal>{content.intro}</p>}
      {page.design.coverPhoto && <figure className="rs-photo" data-reveal>
        <img src={'data:image/jpeg;base64,' + page.design.coverPhoto} alt={coupleTitle} />
      </figure>}
    </section>,
    hero: () => <section className="rs-section rs-hero" aria-label={coupleTitle}>
      {content.title && <p className="rs-hero-title" data-reveal>{content.title}</p>}
      <h1 className="rs-names" data-reveal>
        <span ref={firstName}>{names[0]}</span>
        {names[1] && <><span className="rs-amp">&amp;</span><span ref={secondName}>{names[1]}</span></>}
      </h1>
      <Rule />
      <p className="rs-date" data-reveal>{longDate(page.date)}</p>
      <div className="rs-actions" data-reveal>
        {events.length > 0 && <button type="button" className="rs-button" onClick={calendar}>{Icon.calendar}Mark the day</button>}
        {rsvp && <a className="rs-button is-quiet" href="#rsvp" onClick={toRsvp}>Send word</a>}
      </div>
    </section>,
    countdown: () => <Countdown target={target} />,
    couple: () => showCouple && <section className="rs-section" aria-labelledby="rs-couple">
      <Head scene="peacocks" kicker="Presented to the court" title="The Betrothed" id="rs-couple" />
      <div className="rs-pair">
        {people.filter(([, person]) => person.name).map(([label, person], i) => <Fragment key={label}>
          {i > 0 && <span className="rs-pair-amp" aria-hidden="true">&amp;</span>}
          <Person label={label} person={person} />
        </Fragment>)}
      </div>
    </section>,
    events: () => events.length > 0 && <section className="rs-section" aria-labelledby="rs-events">
      <Head scene="elephants" kicker="The order of festivities" title="Days of Ceremony" id="rs-events" />
      {sharedPlace && <a className="rs-venue-chip" data-reveal href={mapLink(events[0]) || undefined} target="_blank" rel="noreferrer">
        {Icon.pin}<span>Every ceremony at <strong>{sharedPlace}</strong></span>
      </a>}
      <Itinerary events={events} content={content} zone={page.timeZone} sharedPlace={sharedPlace} />
    </section>,
    rsvp: () => rsvp && <section className="rs-section rs-rsvp" id="rsvp" aria-labelledby="rs-rsvp">
      <Head scene="horses" kicker="Kindly send word" title="Will You Grace Us?" id="rs-rsvp" />
      {content.rsvpBy && <p className="rs-soft rs-rsvp-by" data-reveal>A reply by {longDate(content.rsvpBy)} would delight us</p>}
      <div className="rs-rsvp-body" data-reveal>{rsvp}</div>
    </section>,
    family: () => <Families content={content} />,
    venue: () => (places.length > 0 || content.dressCode) && <section className="rs-section" aria-labelledby="rs-venue">
      <Head scene="pavilion" kicker="Where the court gathers" title={sharedPlace || (places.length === 1 ? places[0].place : 'The Venues')} id="rs-venue" />
      <div className="rs-grid">
        {places.map(place => <Panel className="rs-place" key={place.place}>
          <span className="rs-place-icon">{Icon.pin}</span>
          <p className="rs-label">The venue</p>
          <h3>{place.place}</h3>
          {place.address && <p className="rs-address">{place.address}</p>}
          {!sharedPlace && mapLink(place) && <a className="rs-link" href={mapLink(place)} target="_blank" rel="noreferrer">Get directions</a>}
        </Panel>)}
        {content.dressCode && <Panel className="rs-place">
          <span className="rs-place-icon">{Icon.sparkle}</span>
          <p className="rs-label">Attire</p>
          <p className="rs-address">{content.dressCode}</p>
        </Panel>}
      </div>
      <div className="rs-actions" data-reveal>
        {events.length > 0 && <button type="button" className="rs-button is-quiet" onClick={calendar}>{Icon.calendar}Add to Calendar</button>}
        {sharedPlace && mapLink(events[0]) && <a className="rs-button" href={mapLink(events[0])} target="_blank" rel="noreferrer">{Icon.nav}Get Directions</a>}
      </div>
    </section>,
    contacts: () => content.contacts.length > 0 && <section className="rs-section" aria-labelledby="rs-contacts">
      <Head scene="lotus" kicker="Should you need anything" title="Our Messengers" id="rs-contacts" />
      <ul className="rs-contacts">
        {content.contacts.map(contact => <li className="rs-contact" key={contact.name + contact.phone} data-reveal>
          <div>
            <h3>{contact.name}</h3>
            {contact.role && <p className="rs-label">{contact.role}</p>}
          </div>
          <div className="rs-contact-actions">
            <a className="rs-button is-small" href={'tel:' + contact.phone.replace(/[\s-]/g, '')} aria-label={'Call ' + contact.name}>{Icon.phone}Call</a>
            <a className="rs-button is-small is-quiet" href={'https://wa.me/' + whatsappNumber(contact.phone)} target="_blank" rel="noreferrer"
              aria-label={'WhatsApp ' + contact.name}>{Icon.chat}WhatsApp</a>
          </div>
        </li>)}
      </ul>
    </section>,
    closing: () => <section className="rs-section rs-closing" aria-label="Closing">
      <Cartouche scene="elephants" />
      {content.closing && <p className="rs-closing-line" data-reveal>{content.closing}</p>}
      <p className="rs-closing-names" data-reveal ref={closingNames}>{names[0]}{names[1] && <><em>&amp;</em>{names[1]}</>}</p>
      {sharedPlace && <div className="rs-blessed" data-reveal>
        <p className="rs-elders">{sharedPlace}</p>
        {events[0].address && <p className="rs-note">{events[0].address}</p>}
      </div>}
      {content.hosts && <div className="rs-blessed" data-reveal>
        {content.regardsIntro && <p className="rs-soft">{content.regardsIntro}</p>}
        <p className="rs-hosts">{content.hosts}</p>
      </div>}
      <div className="rs-signet" data-reveal><WaxSeal initials={initials} className="rs-signet-art" /><span>Sealed with love</span></div>
    </section>,
  }
  const order: SectionKey[] = design.sections.includes('rsvp') ? design.sections : [...design.sections, 'rsvp']

  return <div className="t-royal-scroll" data-palette={palette} data-stage={stage}>
    {stage !== 'done' && <Opening names={names} title={content.title} date={longDate(page.date)} greeting={greeting} hint={String(options.sealLine ?? '')}
      stage={stage} onOpen={unroll} onContinue={finish} />}
    <div className="rs-backdrop" aria-hidden="true"><JaliField className="rs-backdrop-jali" /></div>
    {preview && <p className="rs-preview">Preview · This is how your guests will see the invitation</p>}
    <main className={'rs-main' + (rolling ? ' has-edge' : '')} ref={root} aria-hidden={!open && stage !== 'leaving'}>
      <div className="rs-head-rod">
        <Rod />
        <Tassel className="rs-hang is-l" /><Tassel className="rs-hang is-r" />
      </div>
      <div className="rs-paper">
        <BorderStrip className="rs-strip is-l" /><BorderStrip className="rs-strip is-r" />
        <div className="rs-paper-body">
          {order.map(key => <Fragment key={key}><SectionAnchor section={key} />{render[key]()}</Fragment>)}
        </div>
      </div>
      <div ref={end}><Roll className="is-end" /></div>
    </main>

    {open && rolling && <div className="rs-edge" ref={edge} aria-hidden="true"><span className="rs-edge-curl" /><Roll /></div>}

    {music.available && open && <button type="button" className={'rs-music' + (music.blocked ? ' is-pulse' : '') + (rolling ? ' is-raised' : '')}
      aria-pressed={music.playing} onClick={music.toggle}>
      {music.playing ? Icon.soundOn : Icon.soundOff}<span>{music.playing ? 'Music On' : 'Music Off'}</span>
    </button>}
  </div>
}

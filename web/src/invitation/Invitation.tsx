import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Divider, EventArt, Icon, Lantern, Mandala, Medallion, Rose, Seal, Sprig, Toran } from './art'
import { downloadCalendar, mapLink, reducedMotion, useCountdown, useFitText, useFlightPath, useInvitationFonts, usePetals, useReveal, whatsappNumber } from './effects'
import { coupleNames, iconFor, optionsFor, templateFor } from './model'
import type { InvitationContent, InvitationEvent, InvitationPerson, PublicInvitation, SectionKey } from './model'
import './invitation.css'

export type InvitationPage = { name: string; date: string; timeZone: string; design: { heading: string; coverPhoto?: string } }

type Props = {
  page: InvitationPage
  invitation: PublicInvitation
  greeting?: string
  rsvp?: ReactNode
  loadMusic?: () => Promise<Blob>
  preview?: boolean
}

type Stage = 'closed' | 'opening' | 'risen' | 'leaving' | 'done'

const dayKey = (iso: string, zone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
const dayLabel = (iso: string, zone: string) => new Intl.DateTimeFormat('en-IN', { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))
const timeLabel = (iso: string, zone: string) => new Intl.DateTimeFormat('en-IN', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso)).toUpperCase()
const longDate = (date: string) => new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(date + 'T00:00:00Z'))
const lines = (text: string) => text.split('\n').map(line => line.trim()).filter(Boolean)

function useMusic(loadMusic: (() => Promise<Blob>) | undefined, enabled: boolean) {
  const audio = useRef<HTMLAudioElement | null>(null)
  const blob = useRef<Promise<Blob> | null>(null)
  const [playing, setPlaying] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const wanted = useRef(true)
  try { if (localStorage.getItem('shaadi-invite-music') === 'off') wanted.current = false } catch { /* storage unavailable */ }

  useEffect(() => {
    if (!enabled || !loadMusic) return
    blob.current = loadMusic()
    blob.current.catch(() => undefined)
    return () => {
      audio.current?.pause()
      if (audio.current?.src) URL.revokeObjectURL(audio.current.src)
    }
  }, [enabled, loadMusic])

  const fadeIn = (element: HTMLAudioElement) => {
    element.volume = 0
    const start = performance.now()
    const step = () => {
      const k = Math.min(1, (performance.now() - start) / 1800)
      element.volume = k * 0.8
      if (k < 1 && !element.paused) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }
  const play = useCallback(async () => {
    if (!blob.current) return
    try {
      if (!audio.current) {
        const element = new Audio(URL.createObjectURL(await blob.current))
        element.loop = true
        audio.current = element
      }
      await audio.current.play()
      fadeIn(audio.current)
      setPlaying(true)
      setBlocked(false)
    } catch { setPlaying(false); setBlocked(true) }
  }, [])
  const start = useCallback(() => { if (wanted.current) void play() }, [play])
  const toggle = useCallback(() => {
    const on = !playing
    wanted.current = on
    try { localStorage.setItem('shaadi-invite-music', on ? 'on' : 'off') } catch { /* storage unavailable */ }
    if (on) void play()
    else { audio.current?.pause(); setPlaying(false); setBlocked(false) }
  }, [playing, play])
  return { available: enabled && !!loadMusic, playing, blocked, start, toggle }
}

function Opening({ names, date, greeting, hint, stage, onOpen, onContinue }: {
  names: [string, string]; date: string; greeting?: string; hint: string; stage: Stage; onOpen: () => void; onContinue: () => void
}) {
  const sparks = useMemo(() => Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * Math.PI * 2 + Math.random() * 0.3, distance = 80 + Math.random() * 120
    return { dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance - 30, size: 6 + Math.random() * 10, delay: Math.random() * 0.25 }
  }), [])
  const initials: [string, string] = [names[0].charAt(0).toUpperCase(), (names[1] || names[0]).charAt(0).toUpperCase()]
  return <div className="inv-opening" data-stage={stage} onClick={() => stage === 'risen' && onContinue()}>
    <Mandala className="inv-opening-mandala is-a" /><Mandala className="inv-opening-mandala is-b" />
    <div className="inv-env-wrap">
      <button type="button" className="inv-env" onClick={event => { event.stopPropagation(); if (stage === 'closed') onOpen(); else if (stage === 'risen') onContinue() }}
        aria-label={'Open the wedding invitation of ' + names.filter(Boolean).join(' and ')}>
        <span className="inv-env-back" />
        <span className="inv-env-card">
          {greeting && <span className="inv-env-dear">Dear {greeting},</span>}
          <span className="inv-env-title">Shubh Vivah</span>
          <span className="inv-env-names">{names[0]}{names[1] && <><em>&amp;</em>{names[1]}</>}</span>
          <span className="inv-env-date">{date}</span>
        </span>
        <span className="inv-env-pocket">
          <svg viewBox="0 0 300 200" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0L150 108L300 0M0 200L128 95M300 200L172 95" /></svg>
        </span>
        <span className="inv-env-flap">
          <svg viewBox="0 0 300 112" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0L150 108L300 0" /></svg>
        </span>
        <span className="inv-seal"><span className="inv-seal-ring" /><Seal initials={initials} /></span>
        <Rose className="inv-env-rose is-tl" /><Rose className="inv-env-rose is-tl2" />
        <Rose className="inv-env-rose is-br" /><Rose className="inv-env-rose is-br2" />
        <span className="inv-burst" aria-hidden="true">{sparks.map((spark, i) => <i key={i} style={{
          '--dx': spark.dx + 'px', '--dy': spark.dy + 'px', '--s': spark.size + 'px', '--dl': spark.delay + 's',
        } as React.CSSProperties} />)}</span>
      </button>
    </div>
    <p className="inv-opening-hint" aria-live="polite">{stage === 'risen' ? 'Tap anywhere to continue' : hint ||
      <>Tap the seal to open your invitation to {names[0]}{names[1] && <> &amp; {names[1]}</>}’s wedding</>}</p>
  </div>
}

function SectionHead({ kicker, title, id }: { kicker?: string; title: string; id?: string }) {
  return <header className="inv-head" data-reveal>
    {kicker && <p className="inv-kicker">{kicker}</p>}
    <h2 id={id}>{title}</h2>
    <Divider />
  </header>
}

function PersonCard({ label, person }: { label: string; person: InvitationPerson }) {
  return <article className="inv-card inv-person" data-reveal>
    <p className="inv-kicker">{label}</p>
    <Divider className="inv-divider is-small" />
    <h3>{person.honorific && <span className="inv-honorific">{person.honorific} </span>}{person.name}</h3>
    {person.parents && <>
      <p className="inv-label">{person.parentLabel}</p>
      <p className="inv-parents">{person.parents}</p>
    </>}
  </article>
}

function Countdown({ target }: { target: number }) {
  const time = useCountdown(target)
  if (time.done) return null
  const cells: [number, string][] = [[time.days, 'Days'], [time.hours, 'Hours'], [time.minutes, 'Minutes'], [time.seconds, 'Seconds']]
  return <section className="inv-section inv-countdown" aria-labelledby="inv-count">
    <p className="inv-kicker" id="inv-count" data-reveal>Until we celebrate</p>
    <Divider />
    <div className="inv-arches" data-reveal role="timer" aria-live="off">
      {cells.map(([value, label]) => <div className="inv-arch" key={label}>
        <strong>{String(value).padStart(2, '0')}</strong><span>{label}</span>
      </div>)}
    </div>
  </section>
}

function Timeline({ events, content, zone, sharedPlace }: { events: InvitationEvent[]; content: InvitationContent; zone: string; sharedPlace: string }) {
  const days = new Map<string, InvitationEvent[]>()
  for (const event of events) {
    const key = dayKey(event.startsAt, zone)
    days.set(key, [...(days.get(key) ?? []), event])
  }
  let number = 0
  return <ol className="inv-timeline">
    {[...days.values()].map(dayEvents => <li key={dayEvents[0].id} className="inv-day">
      <p className="inv-day-chip" data-reveal>{Icon.calendar}{dayLabel(dayEvents[0].startsAt, zone)}</p>
      <ol>
        {dayEvents.map(event => {
          const style = content.events[event.id]
          number++
          const link = mapLink(event)
          return <li key={event.id} className="inv-event" data-reveal>
            <span className="inv-event-node">{number}</span>
            <div className="inv-card inv-event-card">
              <EventArt icon={iconFor(event, style)} />
              <div>
                <h3>{event.name}</h3>
                {style?.subtitle && <p className="inv-event-sub">{style.subtitle}</p>}
                <p className="inv-pill">{style?.timeLabel || timeLabel(event.startsAt, zone)}</p>
                {!sharedPlace && event.place && <p className="inv-event-place">
                  {Icon.pin}<span>{event.place}</span>
                  {link && <a href={link} target="_blank" rel="noreferrer">Directions</a>}
                </p>}
              </div>
            </div>
          </li>
        })}
      </ol>
    </li>)}
  </ol>
}

function Families({ content }: { content: InvitationContent }) {
  return <>{content.families.map((family, i) => <section className="inv-section" key={i} aria-labelledby={'inv-family-' + i}>
    <SectionHead title={family.heading || 'With love from the family'} id={'inv-family-' + i} />
    {family.cards.map((card, j) => <article className="inv-card inv-family" key={j} data-reveal>
      {card.title && <><h3>{card.title}</h3><span className="inv-rule" /></>}
      {card.lines.map((line, k) => <div className="inv-family-line" key={k}>
        {line.relation && <p className="inv-label">{line.relation}</p>}
        {lines(line.names).map(name => <p className="inv-name" key={name}>{name}</p>)}
      </div>)}
    </article>)}
  </section>)}</>
}

export function Invitation({ page, invitation, greeting, rsvp, loadMusic, preview }: Props) {
  useInvitationFonts()
  const { content, events } = invitation
  const design = templateFor(invitation.template?.id)
  const options = optionsFor(design, invitation.template?.options)
  const palette = String(options.palette ?? 'rose-gold')
  const names = coupleNames(content, page.design.heading || page.name)
  const [stage, setStage] = useState<Stage>('closed')
  const [lanterns, setLanterns] = useState<{ id: number; left: number; delay: number; drift: number; time: number }[]>([])
  const root = useRef<HTMLDivElement>(null)
  const petals = useRef<HTMLCanvasElement>(null)
  const flight = useRef<HTMLCanvasElement>(null)
  const firstName = useRef<HTMLSpanElement>(null)
  const secondName = useRef<HTMLSpanElement>(null)
  const timers = useRef<number[]>([])
  const music = useMusic(loadMusic, invitation.hasMusic)
  const open = stage === 'done'
  useReveal(root, open)
  usePetals(petals, open, palette)
  useFlightPath(flight, root, open && options.flightPath !== false)
  useFitText(firstName, names[0])
  useFitText(secondName, names[1])

  const coupleTitle = names.filter(Boolean).join(' & ')
  useEffect(() => {
    const title = document.title
    document.title = coupleTitle + ' | Wedding Invitation'
    return () => { document.title = title }
  }, [coupleTitle])
  useEffect(() => {
    document.documentElement.classList.toggle('inv-locked', !open)
    return () => document.documentElement.classList.remove('inv-locked')
  }, [open])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const stageRef = useRef<Stage>('closed')
  const go = (next: Stage) => { stageRef.current = next; setStage(next) }
  const later = (ms: number, work: () => void) => { timers.current.push(window.setTimeout(work, ms)) }
  const finish = () => {
    if (stageRef.current === 'leaving' || stageRef.current === 'done') return
    go('leaving')
    later(reducedMotion() ? 0 : 750, () => { go('done'); window.scrollTo(0, 0) })
    later(reducedMotion() ? 50 : 1100, music.start)
  }
  const openEnvelope = () => {
    if (reducedMotion()) { finish(); return }
    go('opening')
    later(2300, () => { if (stageRef.current === 'opening') go('risen') })
    later(5600, () => { if (stageRef.current === 'risen') finish() })
  }

  const sharedPlace = events.length > 0 && events.every(event => event.place && event.place === events[0].place) ? events[0].place : ''
  const places = [...new Map(events.filter(event => event.place).map(event => [event.place, event])).values()]
  const target = events.length ? Date.parse(events[0].startsAt) : Date.parse(page.date + 'T00:00:00Z')
  const calendar = () => downloadCalendar(names.filter(Boolean).join('-') + '-wedding.ics', coupleTitle + ' Wedding', events,
    content.dressCode ? 'Dress code: ' + content.dressCode : '')
  const people: [string, InvitationPerson][] = content.brideFirst
    ? [['The Bride', content.bride], ['The Groom', content.groom]] : [['The Groom', content.groom], ['The Bride', content.bride]]
  const showCouple = people.some(([, person]) => person.name)
  const releaseLanterns = () => setLanterns(current => [...current, ...[0, 1, 2].map(i => ({
    id: Date.now() + i, left: 14 + i * 30 + (Math.random() * 12 - 6), delay: i * 0.45, drift: Math.random() * 120 - 60, time: 7 + Math.random() * 2.5,
  }))])

  // Each template lists its sections in order; the RSVP always appears when the
  // guest has one, even if a template forgets it.
  const render: Record<SectionKey, () => ReactNode> = {
    blessing: () => <>
        <section className="inv-section inv-blessing">
          {content.symbols.length > 0 && <div className="inv-symbols" data-reveal>
            {content.symbols.map((symbol, i) => <Medallion key={symbol} symbol={symbol} large={content.symbols.length === 3 ? i === 1 : i === 0} />)}
          </div>}
          {content.invocation && <p className="inv-invocation" data-reveal lang="hi">{content.invocation}</p>}
          {content.shloka && <p className="inv-shloka" data-reveal lang="sa">{lines(content.shloka).map(line => <span key={line}>{line}</span>)}</p>}
          {content.deity && <div data-reveal>
            <p className="inv-script">{content.blessingIntro}</p>
            <p className="inv-caps">{content.deity}</p>
          </div>}
          {content.elders && <div data-reveal>
            <p className="inv-script">{content.eldersIntro}</p>
            <p className="inv-elders">{content.elders}</p>
            {content.eldersNote && <p className="inv-note">{content.eldersNote}</p>}
          </div>}
          <Divider />
          {greeting && <p className="inv-greeting" data-reveal>Dear {greeting},</p>}
          {content.intro && <p className="inv-intro" data-reveal>{content.intro}</p>}
          {page.design.coverPhoto && <figure className="inv-photo" data-reveal>
            <Sprig className="inv-photo-sprig is-l" /><Sprig className="inv-photo-sprig is-r" />
            <img src={'data:image/jpeg;base64,' + page.design.coverPhoto} alt={coupleTitle} />
          </figure>}
        </section>
    </>,
    hero: () => <>
        <section className="inv-section inv-hero" aria-label={coupleTitle}>
          {content.title && <p className="inv-hero-title" data-reveal>{content.title}</p>}
          <Divider />
          <h1 className="inv-names" data-reveal>
            <span ref={firstName}>{names[0]}</span>
            {names[1] && <><span className="inv-amp">&amp;</span><span ref={secondName}>{names[1]}</span></>}
          </h1>
          <Divider />
          <p className="inv-date" data-reveal>{longDate(page.date)}</p>
          <div className="inv-actions" data-reveal>
            {events.length > 0 && <button type="button" className="inv-button" onClick={calendar}>Save the Date</button>}
            {rsvp && <a className="inv-button is-ghost" href="#rsvp" onClick={event => { event.preventDefault(); document.getElementById('rsvp')?.scrollIntoView({ behavior: 'smooth' }) }}>RSVP</a>}
          </div>
          <p className="inv-scroll" aria-hidden="true">{Icon.hand}<span>Scroll down</span></p>
        </section>
    </>,
    countdown: () => <Countdown target={target} />,
    couple: () => <>
        {showCouple && <section className="inv-section" aria-labelledby="inv-couple">
          <SectionHead kicker="Introducing" title={people.map(([label]) => label).join(' & ')} id="inv-couple" />
          <div className="inv-pair">{people.map(([label, person]) => person.name && <PersonCard key={label} label={label} person={person} />)}</div>
        </section>}
    </>,
    events: () => <>
        {events.length > 0 && <section className="inv-section" aria-labelledby="inv-events">
          <SectionHead kicker="Join the celebrations" title="Wedding Functions" id="inv-events" />
          {sharedPlace && <a className="inv-venue-chip" data-reveal href={mapLink(events[0]) || undefined} target="_blank" rel="noreferrer">
            {Icon.pin}<span>All functions at <strong>{sharedPlace}</strong></span>{mapLink(events[0]) && Icon.nav}
          </a>}
          <Timeline events={events} content={content} zone={page.timeZone} sharedPlace={sharedPlace} />
        </section>}
    </>,
    rsvp: () => <>
        {rsvp && <section className="inv-section inv-rsvp" id="rsvp" aria-labelledby="inv-rsvp">
          <SectionHead kicker="RSVP" title="Will you join us?" id="inv-rsvp" />
          {content.rsvpBy && <p className="inv-script inv-center" data-reveal>Please let us know by {longDate(content.rsvpBy)}</p>}
          <div className="inv-rsvp-body" data-reveal>{rsvp}</div>
        </section>}
    </>,
    family: () => <Families content={content} />,
    venue: () => <>
        {(places.length > 0 || content.dressCode) && <section className="inv-section" aria-labelledby="inv-venue">
          <SectionHead kicker="Where we celebrate" title={sharedPlace || (places.length === 1 ? places[0].place : 'The Venues')} id="inv-venue" />
          <div className="inv-info-grid">
            {places.map(place => <article className="inv-card inv-info" key={place.place} data-reveal>
              <span className="inv-info-icon">{Icon.pin}</span>
              <div>
                <p className="inv-label">Venue</p><h3>{place.place}</h3>
                {place.address && <p>{place.address}</p>}
                {!sharedPlace && mapLink(place) && <a href={mapLink(place)} target="_blank" rel="noreferrer">Get directions</a>}
              </div>
            </article>)}
            {content.dressCode && <article className="inv-card inv-info" data-reveal>
              <span className="inv-info-icon">{Icon.sparkle}</span>
              <div><p className="inv-label">Dress code</p><p>{content.dressCode}</p></div>
            </article>}
          </div>
          <div className="inv-actions" data-reveal>
            {events.length > 0 && <button type="button" className="inv-button is-ghost" onClick={calendar}>{Icon.calendar}Add to Calendar</button>}
            {sharedPlace && mapLink(events[0]) && <a className="inv-button" href={mapLink(events[0])} target="_blank" rel="noreferrer">{Icon.nav}Get Directions</a>}
          </div>
        </section>}
    </>,
    contacts: () => <>
        {content.contacts.length > 0 && <section className="inv-section" aria-labelledby="inv-contacts">
          <SectionHead kicker="Questions or help" title="Contact the Family" id="inv-contacts" />
          <div className="inv-contacts">
            {content.contacts.map(contact => <article className="inv-card inv-contact" key={contact.name + contact.phone} data-reveal>
              <h3>{contact.name}</h3>
              {contact.role && <p className="inv-label">{contact.role}</p>}
              <div className="inv-contact-actions">
                <a className="inv-round" href={'tel:' + contact.phone.replace(/[\s-]/g, '')} aria-label={'Call ' + contact.name}>{Icon.phone}</a>
                <a className="inv-round is-ghost" href={'https://wa.me/' + whatsappNumber(contact.phone)} target="_blank" rel="noreferrer"
                  aria-label={'WhatsApp ' + contact.name}>{Icon.chat}</a>
              </div>
            </article>)}
          </div>
        </section>}
    </>,
    closing: () => <>
        <section className="inv-section inv-closing" aria-label="Closing">
          {content.closing && <p className="inv-closing-line" data-reveal>{content.closing}</p>}
          <p className="inv-script" data-reveal>at the wedding of</p>
          <p className="inv-closing-names" data-reveal>{coupleTitle}</p>
          {sharedPlace && <div data-reveal>
            <p className="inv-script">at</p>
            <p className="inv-elders">{sharedPlace}</p>
            {events[0].address && <p className="inv-note">{events[0].address}</p>}
          </div>}
          <Divider />
          {content.hosts && <div data-reveal>
            <p className="inv-script">{content.regardsIntro}</p>
            <p className="inv-hosts">{content.hosts}</p>
          </div>}
          {options.lanterns !== false && <button type="button" className="inv-button is-ghost" data-reveal onClick={releaseLanterns}>{Icon.sparkle}Send a Blessing Lantern</button>}
        </section>
    </>,
  }
  const order: SectionKey[] = design.sections.includes('rsvp') ? design.sections : [...design.sections, 'rsvp']

  return <div className="inv" data-template={design.id} data-palette={palette} data-stage={stage}>
    {stage !== 'done' && <Opening names={names} date={longDate(page.date)} greeting={greeting} hint={String(options.envelopeHint ?? '')}
      stage={stage} onOpen={openEnvelope} onContinue={finish} />}
    <div className="inv-backdrop" aria-hidden="true">
      <Mandala className="inv-corner is-tl" /><Mandala className="inv-corner is-br" />
      <canvas ref={flight} className="inv-flight" /><canvas ref={petals} className="inv-petals" />
    </div>
    {preview && <p className="inv-preview-banner">Preview · This is how your guests will see the invitation</p>}
    <main className="inv-main" ref={root} aria-hidden={!open && stage !== 'leaving'}>
      <Toran className="is-top" />
      {order.map(key => <Fragment key={key}>{render[key]()}</Fragment>)}
      <Toran className="is-bottom" />
    </main>

    {lanterns.map(lantern => <div key={lantern.id} className="inv-lantern" style={{
      left: lantern.left + '%', '--dl': lantern.delay + 's', '--t': lantern.time + 's', '--sx': lantern.drift + 'px',
    } as React.CSSProperties} onAnimationEnd={event => {
      if (event.target === event.currentTarget) setLanterns(current => current.filter(item => item.id !== lantern.id))
    }}><Lantern /></div>)}

    {music.available && open && <button type="button" className={'inv-music' + (music.blocked ? ' is-pulse' : '')}
      aria-pressed={music.playing} onClick={music.toggle}>
      {music.playing ? Icon.soundOn : Icon.soundOff}<span>{music.playing ? 'Music On' : 'Music Off'}</span>
    </button>}
  </div>
}

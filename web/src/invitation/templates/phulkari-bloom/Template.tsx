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
import { Band, Bloom, Buti, ButiField, Dhol, Needle, Seam, SymbolTile } from './art'
import type { Silk } from './art'
import './style.css'

const fonts = 'https://fonts.googleapis.com/css2?family=Rozha+One&family=Mukta:wght@400;500;600;700&display=swap'
const lockClass = 't-phulkari-bloom-locked'

type Stage = 'closed' | 'stitching' | 'stitched' | 'leaving' | 'done'
const dayWords = ['Day one', 'Day two', 'Day three', 'Day four', 'Day five', 'Day six', 'Day seven']
const butiSilks: Silk[] = [1, 3, 2, 5]

function Opening({ names, title, date, greeting, hint, stage, onOpen, onContinue }: {
  names: [string, string]; title: string; date: string; greeting?: string; hint: string; stage: Stage
  onOpen: () => void; onContinue: () => void
}) {
  const first = useRef<HTMLSpanElement>(null)
  const second = useRef<HTMLSpanElement>(null)
  useFitText(first, names[0])
  useFitText(second, names[1])
  const couple = names.filter(Boolean).join(' and ')
  const bloomState = stage === 'closed' ? 'traced' : 'stitch'
  return <div className="pb-opening" data-stage={stage} onClick={() => stage === 'stitched' && onContinue()}>
    <div className="pb-cloth is-top" aria-hidden="true"><ButiField /><Band className="is-edge" /></div>
    <div className="pb-cloth is-bottom" aria-hidden="true"><ButiField /><Band className="is-edge" /></div>
    <Seam />
    <div className="pb-op-layer">
      <div className="pb-op-top">
        {greeting && <p className="pb-op-dear">Dear {greeting},</p>}
        <p className="pb-op-title">{title || 'Shubh Vivah'}</p>
      </div>
      <button type="button" className="pb-op-bloom" data-open
        onClick={event => { event.stopPropagation(); if (stage === 'closed') onOpen(); else if (stage === 'stitched') onContinue() }}
        aria-label={'Stitch the phulkari and open the wedding invitation of ' + couple}>
        <Bloom state={bloomState} />
        <Needle className="pb-op-needle" />
      </button>
      <div className="pb-op-words">
        <p className="pb-op-names">
          <span ref={first}>{names[0]}</span>
          {names[1] && <><em>&amp;</em><span ref={second}>{names[1]}</span></>}
        </p>
        <p className="pb-op-date">{date}</p>
      </div>
      <p className="pb-op-hint" aria-live="polite">{stage === 'stitched' ? 'Tap anywhere and the cloth will part' : stage === 'stitching' ? 'Stitching with love…' : hint ||
        <>Tap the bloom to stitch your invitation to {names[0]}{names[1] && <> &amp; {names[1]}</>}’s wedding</>}</p>
    </div>
  </div>
}

function Head({ kicker, title, id }: { kicker?: string; title: string; id: string }) {
  return <header className="pb-head" data-reveal>
    {kicker && <p className="pb-kicker">{kicker}</p>}
    <h2 id={id}>{title}</h2>
    <span className="pb-stitch-rule" aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <i key={i} style={{ '--k': i } as CSSProperties} />)}</span>
  </header>
}

function Countdown({ target }: { target: number }) {
  const time = useCountdown(target)
  if (time.done) return null
  const cells: [number, string][] = [[time.days, 'Days'], [time.hours, 'Hours'], [time.minutes, 'Minutes'], [time.seconds, 'Seconds']]
  return <section className="pb-section pb-countdown" data-block="saffron" aria-labelledby="pb-count">
    <Band />
    <p className="pb-kicker" id="pb-count" data-reveal>The dhol starts in</p>
    <div className="pb-count" data-reveal role="timer" aria-live="off">
      {cells.map(([value, label]) => <div className="pb-count-cell" key={label}>
        <span className="pb-count-tile"><strong>{String(value).padStart(2, '0')}</strong></span>
        <span className="pb-count-label">{label}</span>
      </div>)}
    </div>
    <Band className="is-flip" />
  </section>
}

function Person({ label, person, tone }: { label: string; person: InvitationPerson; tone: number }) {
  return <article className="pb-patch pb-person" data-tone={tone} data-reveal>
    <Buti className="pb-corner is-tl" silk={1} /><Buti className="pb-corner is-br" silk={3} />
    <p className="pb-tag">{label}</p>
    {person.honorific && <p className="pb-honorific">{person.honorific}</p>}
    <h3>{person.name}</h3>
    {person.parents && <>
      <span className="pb-dash" aria-hidden="true" />
      <p className="pb-label">{person.parentLabel}</p>
      <p className="pb-parents">{person.parents}</p>
    </>}
  </article>
}

function Patches({ events, content, zone, sharedPlace }: { events: InvitationEvent[]; content: InvitationContent; zone: string; sharedPlace: string }) {
  const days = new Map<string, InvitationEvent[]>()
  for (const event of events) {
    const key = dayKey(event.startsAt, zone)
    days.set(key, [...(days.get(key) ?? []), event])
  }
  let count = 0
  return <ol className="pb-days">
    {[...days.values()].map((dayEvents, d) => <li key={dayEvents[0].id} className="pb-day">
      <p className="pb-day-strip" data-reveal>
        <span className="pb-day-word">{dayWords[d] ?? 'Day ' + (d + 1)}</span>
        <span className="pb-day-date">{dayLabel(dayEvents[0].startsAt, zone)}</span>
      </p>
      <ol className={'pb-patches' + (dayEvents.length === 1 ? ' is-single' : '')}>
        {dayEvents.map(event => {
          const style = content.events[event.id]
          const link = mapLink(event)
          const tone = count++ % 4
          return <li key={event.id} className="pb-patch pb-event" data-tone={tone} data-reveal>
            <Buti className="pb-corner is-tl" silk={butiSilks[tone]} /><Buti className="pb-corner is-br" silk={butiSilks[(tone + 2) % 4]} />
            <span className="pb-event-icon"><span><EventArt icon={iconFor(event, style)} /></span></span>
            <h3>{event.name}</h3>
            {style?.subtitle && <p className="pb-event-sub">{style.subtitle}</p>}
            <p className="pb-time">{style?.timeLabel || timeLabel(event.startsAt, zone)}</p>
            {!sharedPlace && event.place && <p className="pb-event-place">
              <span>{event.place}</span>
              {link && <a href={link} target="_blank" rel="noreferrer">{Icon.nav}Directions</a>}
            </p>}
          </li>
        })}
      </ol>
    </li>)}
  </ol>
}

function Families({ content }: { content: InvitationContent }) {
  return <>{content.families.map((family, i) => <section className="pb-section pb-families" data-block="blush" key={i} aria-labelledby={'pb-family-' + i}>
    <Head kicker="The whole clan" title={family.heading || 'Our Families'} id={'pb-family-' + i} />
    <div className="pb-family-grid">
      {family.cards.map((card, j) => <article className="pb-sheet pb-family" key={j} data-reveal>
        {card.title && <h3>{card.title}</h3>}
        {card.lines.map((line, k) => <div className="pb-family-line" key={k}>
          {line.relation && <p className="pb-label">{line.relation}</p>}
          {lines(line.names).map(name => <p className="pb-name" key={name}>{name}</p>)}
        </div>)}
      </article>)}
    </div>
  </section>)}</>
}

type Spark = { id: number; x: number; y: number; dx: number; dy: number; r: number; silk: Silk }

export default function PhulkariBloom({ page, invitation, manifest: design, options, greeting, rsvp, loadMusic, preview, embedded }: TemplateProps) {
  useFonts(fonts)
  const { content, events } = invitation
  const palette = String(options.palette ?? 'magenta')
  const dholOn = options.dhol !== false
  const names = coupleNames(content, page.design.heading || page.name)
  const [stage, setStage] = useState<Stage>('closed')
  const [still] = useState(reducedMotion)
  const [dance, setDance] = useState(0)
  const [sparks, setSparks] = useState<Spark[]>([])
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
    later(still ? 0 : 1050, () => { go('done'); window.scrollTo(0, 0) })
    later(still ? 50 : 700, music.start)
  }
  const stitch = () => {
    if (still) { finish(); return }
    go('stitching')
    later(2200, () => { if (stageRef.current === 'stitching') go('stitched') })
    later(7200, () => { if (stageRef.current === 'stitched') finish() })
  }

  // The dhol: the page hops to the beat and silk diamonds burst from the drum.
  const beat = (event: MouseEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const x = box.left + box.width / 2, y = box.top + box.height / 2
    setDance(value => value + 1)
    later(1500, () => setDance(0))
    if (still) return
    const burst: Spark[] = Array.from({ length: 16 }, (_, i) => {
      const angle = (i / 16) * Math.PI * 2 + Math.random() * 0.4, distance = 70 + Math.random() * 110
      return { id: Date.now() + i, x, y, dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance - 40, r: Math.random() * 360, silk: butiSilks[i % 4] }
    })
    setSparks(current => [...current, ...burst])
    later(1400, () => setSparks(current => current.filter(spark => !burst.includes(spark))))
  }
  const dholButton = (label: string) => dholOn && <button type="button" className="pb-dhol-button" onClick={beat}
    aria-label={label + ': make the page dance'}>
    <Dhol /><span>{dance ? 'Balle balle!' : label}</span>
  </button>

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
    hero: () => <section className="pb-section pb-hero" data-block="cloth" aria-label={coupleTitle}>
      <ButiField className="pb-hero-field" />
      <Band className="is-edge" />
      <div className="pb-hero-body">
        {greeting && <p className="pb-greeting" data-reveal>Dear {greeting},</p>}
        {content.title && <p className="pb-hero-title" data-reveal>{content.title}</p>}
        <div className="pb-hero-bloom" data-reveal><Bloom /></div>
        <h1 className="pb-names" data-reveal>
          <span ref={firstName}>{names[0]}</span>
          {names[1] && <><span className="pb-amp">&amp;</span><span ref={secondName}>{names[1]}</span></>}
        </h1>
        <p className="pb-date" data-reveal><span>{longDate(page.date)}</span></p>
        <div className="pb-actions" data-reveal>
          {events.length > 0 && <button type="button" className="pb-button is-silk" onClick={calendar}>{Icon.calendar}Save our date</button>}
          {rsvp && <a className="pb-button is-line" href="#rsvp" onClick={toRsvp}>Send your reply</a>}
        </div>
        {dholOn && <div className="pb-hero-dhol" data-reveal>{dholButton('Beat the dhol')}</div>}
      </div>
      <Band className="is-edge is-flip" />
    </section>,
    blessing: () => hasBlessing && <section className="pb-section pb-blessing" aria-label="Blessings">
      {content.symbols.length > 0 && <div className="pb-symbols" data-reveal>
        {content.symbols.map((symbol, i) => <SymbolTile key={symbol} symbol={symbol} large={content.symbols.length === 3 ? i === 1 : i === 0} />)}
      </div>}
      {content.invocation && <p className="pb-invocation" data-reveal lang="hi">{content.invocation}</p>}
      {content.shloka && <p className="pb-shloka" data-reveal lang="sa">{lines(content.shloka).map(line => <span key={line}>{line}</span>)}</p>}
      {content.deity && <div className="pb-blessed" data-reveal>
        {content.blessingIntro && <p className="pb-soft">{content.blessingIntro}</p>}
        <p className="pb-deity">{content.deity}</p>
      </div>}
      {content.elders && <div className="pb-blessed" data-reveal>
        {content.eldersIntro && <p className="pb-soft">{content.eldersIntro}</p>}
        <p className="pb-elders">{content.elders}</p>
        {content.eldersNote && <p className="pb-note">{content.eldersNote}</p>}
      </div>}
      {page.design.coverPhoto && <figure className="pb-photo" data-reveal>
        <img src={'data:image/jpeg;base64,' + page.design.coverPhoto} alt={coupleTitle} />
      </figure>}
      {content.intro && <p className="pb-intro" data-reveal>{content.intro}</p>}
    </section>,
    countdown: () => <Countdown target={target} />,
    couple: () => shownPeople.length > 0 && <section className="pb-section pb-couple" aria-labelledby="pb-couple">
      <Head kicker="The two of them" title={shownPeople.map(([label]) => label.replace('The ', '')).join(' & ')} id="pb-couple" />
      <div className={'pb-pair' + (shownPeople.length === 1 ? ' is-single' : '')}>
        {shownPeople.map(([label, person], i) => <Fragment key={label}>
          {i > 0 && <span className="pb-pair-knot" aria-hidden="true"><Buti silk={2} /><span>&amp;</span></span>}
          <Person label={label} person={person} tone={i === 0 ? 0 : 2} />
        </Fragment>)}
      </div>
    </section>,
    events: () => events.length > 0 && <section className="pb-section pb-events" aria-labelledby="pb-events">
      <Head kicker="Every function, every dance" title="Come Celebrate" id="pb-events" />
      {sharedPlace && <a className="pb-chip" data-reveal href={mapLink(events[0]) || undefined} target="_blank" rel="noreferrer">
        {Icon.pin}<span>All of it at <strong>{sharedPlace}</strong></span>
      </a>}
      <Patches events={events} content={content} zone={page.timeZone} sharedPlace={sharedPlace} />
    </section>,
    rsvp: () => rsvp && <section className="pb-section pb-rsvp" id="rsvp" aria-labelledby="pb-rsvp">
      <Head kicker="Your reply" title="Are you coming to dance?" id="pb-rsvp" />
      {content.rsvpBy && <p className="pb-soft pb-center" data-reveal>Please tell us by {longDate(content.rsvpBy)}</p>}
      <div className="pb-sheet pb-rsvp-body" data-reveal>{rsvp}</div>
    </section>,
    family: () => <Families content={content} />,
    venue: () => (places.length > 0 || content.dressCode) && <section className="pb-section pb-venue" aria-labelledby="pb-venue">
      <Head kicker="Find the party" title={sharedPlace || (places.length === 1 ? places[0].place : 'The Venues')} id="pb-venue" />
      <div className="pb-sheet pb-venue-card" data-reveal>
        {places.map(place => <div className="pb-place" key={place.place}>
          <span className="pb-pin" aria-hidden="true">{Icon.pin}</span>
          <div>
            {(!sharedPlace || places.length > 1) && <h3>{place.place}</h3>}
            {place.address && <p className="pb-address">{place.address}</p>}
            {!sharedPlace && mapLink(place) && <a className="pb-link" href={mapLink(place)} target="_blank" rel="noreferrer">{Icon.nav}Get directions</a>}
          </div>
        </div>)}
        {content.dressCode && <div className="pb-attire">
          <p className="pb-label">What to wear</p>
          <p>{content.dressCode}</p>
        </div>}
        <div className="pb-actions">
          {events.length > 0 && <button type="button" className="pb-button is-line" onClick={calendar}>{Icon.calendar}Add to Calendar</button>}
          {sharedPlace && mapLink(events[0]) && <a className="pb-button" href={mapLink(events[0])} target="_blank" rel="noreferrer">{Icon.nav}Get Directions</a>}
        </div>
      </div>
    </section>,
    contacts: () => content.contacts.length > 0 && <section className="pb-section pb-contacts-section" aria-labelledby="pb-contacts">
      <Head kicker="Lost the way? Need a ride?" title="Just Call Us" id="pb-contacts" />
      <ul className="pb-contacts">
        {content.contacts.map((contact, i) => <li className="pb-contact" data-tone={(i * 2 + 1) % 4} key={contact.name + contact.phone} data-reveal>
          <div className="pb-contact-who">
            <h3>{contact.name}</h3>
            {contact.role && <p className="pb-label">{contact.role}</p>}
          </div>
          <div className="pb-contact-actions">
            <a className="pb-button is-small" href={'tel:' + contact.phone.replace(/[\s-]/g, '')} aria-label={'Call ' + contact.name}>{Icon.phone}Call</a>
            <a className="pb-button is-small is-line" href={'https://wa.me/' + whatsappNumber(contact.phone)} target="_blank" rel="noreferrer"
              aria-label={'WhatsApp ' + contact.name}>{Icon.chat}WhatsApp</a>
          </div>
        </li>)}
      </ul>
    </section>,
    closing: () => <section className="pb-section pb-closing" data-block="cloth" aria-label="Closing">
      <ButiField className="pb-hero-field" />
      <Band className="is-edge" />
      <div className="pb-closing-body">
        <div className="pb-closing-bloom" data-reveal><Bloom state="stitch" /></div>
        {content.closing && <p className="pb-closing-line" data-reveal>{content.closing}</p>}
        <p className="pb-soft" data-reveal>Come hungry and ready to dance at the wedding of</p>
        <p className="pb-closing-names" data-reveal ref={closingNames}>{names[0]}{names[1] && <><em>&amp;</em>{names[1]}</>}</p>
        {sharedPlace && <div className="pb-blessed" data-reveal>
          <p className="pb-closing-place">{sharedPlace}</p>
          {events[0].address && <p className="pb-note">{events[0].address}</p>}
        </div>}
        {content.hosts && <div className="pb-blessed" data-reveal>
          {content.regardsIntro && <p className="pb-soft">{content.regardsIntro}</p>}
          <p className="pb-hosts">{content.hosts}</p>
        </div>}
        {dholOn && <div data-reveal>{dholButton('One more beat')}</div>}
      </div>
      <Band className="is-edge is-flip" />
    </section>,
  }
  const order: SectionKey[] = design.sections.includes('rsvp') ? design.sections : [...design.sections, 'rsvp']

  const Container = embedded ? 'div' : 'main'
  return <div className="t-phulkari-bloom" ref={root} data-palette={palette} data-stage={stage} data-dance={dance ? (dance % 2 ? 'a' : 'b') : undefined}>
    {stage !== 'done' && <Opening names={names} title={content.title} date={longDate(page.date)} greeting={greeting} hint={String(options.openingLine ?? '')}
      stage={stage} onOpen={stitch} onContinue={finish} />}
    {preview && <p className="pb-preview">Preview · This is how your guests will see the invitation</p>}
    <Container className="pb-main" aria-hidden={!open && stage !== 'leaving'}>
      {order.map((key, i) => <Fragment key={key}><SectionAnchor section={key} /><div className="pb-hop" style={{ '--k': i } as CSSProperties}>{render[key]()}</div></Fragment>)}
    </Container>

    {sparks.length > 0 && <div className="pb-sparks" aria-hidden="true">{sparks.map(spark => <Buti key={spark.id} silk={spark.silk} className="pb-spark" style={{
      left: spark.x + 'px', top: spark.y + 'px', '--dx': spark.dx + 'px', '--dy': spark.dy + 'px', '--r': spark.r + 'deg',
    } as CSSProperties} />)}</div>}

    {music.available && open && <button type="button" className={'pb-music' + (music.blocked ? ' is-pulse' : '')}
      aria-pressed={music.playing} onClick={music.toggle}>
      {music.playing ? Icon.soundOn : Icon.soundOff}<span>{music.playing ? 'Music On' : 'Music Off'}</span>
    </button>}
  </div>
}

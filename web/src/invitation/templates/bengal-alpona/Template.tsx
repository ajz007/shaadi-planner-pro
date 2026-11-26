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
import { AlponaBand, Bangle, CornerSwirl, DoorAlpona, FishPair, HeroWreath, LotusMarks, Medal, Mukut, SeedLotus, SymbolMark, Topor } from './art'
import './style.css'

const fonts = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,400;1,500&family=Gentium+Book+Plus:ital,wght@0,400;0,700;1,400&family=Tenor+Sans&family=Noto+Serif+Devanagari:wght@500;600&family=Noto+Serif+Bengali:wght@500;600&display=swap'
const lockClass = 't-bengal-alpona-locked'

type Stage = 'closed' | 'flowing' | 'drawn' | 'leaving' | 'done'
const dayWords = ['Day one', 'Day two', 'Day three', 'Day four', 'Day five', 'Day six', 'Day seven']

function DoorArt() {
  return <div className="al-door-art">
    <DoorAlpona className="al-door-alpona" />
    <DoorAlpona className="al-side is-l" heart /><DoorAlpona className="al-side is-r" heart />
    <CornerSwirl className="al-corner is-tl" t={.7} /><CornerSwirl className="al-corner is-tr" t={.8} />
    <CornerSwirl className="al-corner is-bl" t={.9} /><CornerSwirl className="al-corner is-br" t={1} />
  </div>
}

function Opening({ names, title, date, greeting, hint, stage, onOpen, onContinue }: {
  names: [string, string]; title: string; date: string; greeting?: string; hint: string; stage: Stage; onOpen: () => void; onContinue: () => void
}) {
  const first = useRef<HTMLSpanElement>(null)
  const second = useRef<HTMLSpanElement>(null)
  useFitText(first, names[0])
  useFitText(second, names[1])
  const couple = names.filter(Boolean).join(' and ')
  return <div className="al-opening" data-stage={stage} onClick={() => stage === 'drawn' && onContinue()}>
    <div className="al-door is-l" aria-hidden="true"><DoorArt /></div>
    <div className="al-door is-r" aria-hidden="true"><DoorArt /></div>
    <div className="al-opening-words">
      {greeting && <p className="al-opening-dear">Dear {greeting},</p>}
      <p className="al-opening-title">{title || 'Shubho Bibaho'}</p>
      <p className="al-opening-names">
        <span ref={first}>{names[0]}</span>
        {names[1] && <><em>&amp;</em><span ref={second}>{names[1]}</span></>}
      </p>
      <p className="al-opening-date">{date}</p>
    </div>
    <button type="button" className="al-seed" data-open
      onClick={event => { event.stopPropagation(); if (stage === 'closed') onOpen(); else if (stage === 'drawn') onContinue() }}
      aria-label={'Draw the alpona and open the wedding invitation of ' + couple}>
      <SeedLotus />
    </button>
    <p className="al-opening-hint" aria-live="polite">{stage === 'drawn' ? 'Tap anywhere to step inside' : hint ||
      <>Touch the lotus to draw the alpona for {names[0]}{names[1] && <> &amp; {names[1]}</>}’s wedding</>}</p>
  </div>
}

function Head({ kicker, title, id }: { kicker?: string; title: string; id: string }) {
  return <header className="al-head" data-reveal>
    {kicker && <p className="al-kicker">{kicker}</p>}
    <h2 id={id}>{title}</h2>
    <AlponaBand className="al-head-band" />
  </header>
}

function Paar({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return <article className={'al-panel ' + (className ?? '')} {...rest}>{children}</article>
}

function Countdown({ target }: { target: number }) {
  const time = useCountdown(target)
  if (time.done) return null
  const cells: [number, string][] = [[time.days, 'Days'], [time.hours, 'Hours'], [time.minutes, 'Minutes'], [time.seconds, 'Seconds']]
  return <section className="al-section al-countdown" aria-labelledby="al-count">
    <p className="al-kicker" id="al-count" data-reveal>Till the first glance</p>
    <div className="al-bangles" data-reveal role="timer" aria-live="off">
      {cells.map(([value, label], i) => <div className="al-bangle" key={label} style={{ '--i': i } as CSSProperties}>
        <span className="al-bangle-face"><Bangle /><strong>{String(value).padStart(2, '0')}</strong></span>
        <span className="al-bangle-label">{label}</span>
      </div>)}
    </div>
  </section>
}

function Person({ label, person, groom }: { label: string; person: InvitationPerson; groom: boolean }) {
  return <Paar className="al-person" data-reveal>
    <span className="al-person-crown">{groom ? <Topor /> : <Mukut />}</span>
    <p className="al-tag">{label}</p>
    {person.honorific && <p className="al-honorific">{person.honorific}</p>}
    <h3>{person.name}</h3>
    {person.parents && <>
      <span className="al-tiny-lotus" aria-hidden="true"><svg viewBox="-26 -26 52 52"><LotusMarks r={22} /></svg></span>
      <p className="al-label">{person.parentLabel}</p>
      <p className="al-parents">{person.parents}</p>
    </>}
  </Paar>
}

function Procession({ events, content, zone, sharedPlace }: { events: InvitationEvent[]; content: InvitationContent; zone: string; sharedPlace: string }) {
  const days = new Map<string, InvitationEvent[]>()
  for (const event of events) {
    const key = dayKey(event.startsAt, zone)
    days.set(key, [...(days.get(key) ?? []), event])
  }
  let n = 0
  return <ol className="al-days">
    {[...days.values()].map((dayEvents, d) => <li key={dayEvents[0].id} className="al-day">
      <p className="al-pidi" data-reveal>
        <span className="al-pidi-n">{dayWords[d] ?? 'Day ' + (d + 1)}</span>
        <span className="al-pidi-date">{dayLabel(dayEvents[0].startsAt, zone)}</span>
      </p>
      <ol className="al-walk">
        {dayEvents.map(event => {
          const style = content.events[event.id]
          const link = mapLink(event)
          const side = n++ % 2 ? 'is-right' : 'is-left'
          return <li key={event.id} className={'al-stop ' + side} data-reveal>
            <span className="al-stop-node"><Medal /><EventArt icon={iconFor(event, style)} /></span>
            <Paar className="al-stop-card">
              <p className="al-stop-time">{style?.timeLabel || timeLabel(event.startsAt, zone)}</p>
              <h3>{event.name}</h3>
              {style?.subtitle && <p className="al-stop-sub">{style.subtitle}</p>}
              {!sharedPlace && event.place && <p className="al-stop-place">
                {Icon.pin}<span>{event.place}</span>
                {link && <a href={link} target="_blank" rel="noreferrer">Directions</a>}
              </p>}
            </Paar>
          </li>
        })}
      </ol>
    </li>)}
  </ol>
}

function Families({ content }: { content: InvitationContent }) {
  return <>{content.families.map((family, i) => <section className="al-section" key={i} aria-labelledby={'al-family-' + i}>
    <Head kicker="With warmth from" title={family.heading || 'Our Families'} id={'al-family-' + i} />
    <div className="al-grid">
      {family.cards.map((card, j) => <Paar className="al-family" key={j} data-reveal>
        {card.title && <h3>{card.title}</h3>}
        {card.lines.map((line, k) => <div className="al-family-line" key={k}>
          {line.relation && <p className="al-label">{line.relation}</p>}
          {lines(line.names).map(name => <p className="al-name" key={name}>{name}</p>)}
        </div>)}
      </Paar>)}
    </div>
  </section>)}</>
}

export default function BengalAlpona({ page, invitation, manifest: design, options, greeting, rsvp, loadMusic, preview }: TemplateProps) {
  useFonts(fonts)
  const { content, events } = invitation
  const palette = String(options.palette ?? 'laal-paar')
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
    later(still ? 0 : 1000, () => { go('done'); window.scrollTo(0, 0) })
    later(still ? 50 : 1100, music.start)
  }
  const draw = () => {
    if (still) { finish(); return }
    go('flowing')
    later(2250, () => { if (stageRef.current === 'flowing') go('drawn') })
    later(7250, () => { if (stageRef.current === 'drawn') finish() })
  }

  const sharedPlace = events.length > 0 && events.every(event => event.place && event.place === events[0].place) ? events[0].place : ''
  const places = [...new Map(events.filter(event => event.place).map(event => [event.place, event])).values()]
  const target = events.length ? Date.parse(events[0].startsAt) : Date.parse(page.date + 'T00:00:00Z')
  const calendar = () => downloadCalendar(names.filter(Boolean).join('-') + '-wedding.ics', coupleTitle + ' Wedding', events,
    content.dressCode ? 'Dress code: ' + content.dressCode : '')
  const people: [string, InvitationPerson, boolean][] = content.brideFirst
    ? [['The Bride', content.bride, false], ['The Groom', content.groom, true]] : [['The Groom', content.groom, true], ['The Bride', content.bride, false]]
  const shownPeople = people.filter(([, person]) => person.name)
  const hasBlessing = !!(content.symbols.length || content.invocation || content.shloka || content.deity || content.elders || content.intro || page.design.coverPhoto)
  const toRsvp = (event: MouseEvent) => { event.preventDefault(); document.getElementById('rsvp')?.scrollIntoView({ behavior: still ? 'auto' : 'smooth' }) }

  const render: Record<SectionKey, () => ReactNode> = {
    hero: () => <section className="al-section al-hero" aria-label={coupleTitle}>
      <div className="al-anchal" aria-hidden="true" />
      {greeting && <p className="al-greeting" data-reveal>Dear {greeting},</p>}
      <div className="al-hero-ring" data-reveal>
        <HeroWreath className="al-hero-wreath" />
        <div className="al-hero-inner">
          {content.title && <p className="al-hero-title">{content.title}</p>}
          <h1 className="al-names">
            <span ref={firstName}>{names[0]}</span>
            {names[1] && <><span className="al-amp">&amp;</span><span ref={secondName}>{names[1]}</span></>}
          </h1>
        </div>
      </div>
      <p className="al-date" data-reveal>{longDate(page.date)}</p>
      <div className="al-actions" data-reveal>
        {events.length > 0 && <button type="button" className="al-button" onClick={calendar}>{Icon.calendar}Keep the date</button>}
        {rsvp && <a className="al-button is-quiet" href="#rsvp" onClick={toRsvp}>Send your reply</a>}
      </div>
    </section>,
    blessing: () => hasBlessing && <section className="al-section al-blessing">
      <Paar className="al-blessing-panel" data-reveal>
        {content.symbols.length > 0 && <div className="al-symbols">
          {content.symbols.map((symbol, i) => <SymbolMark key={symbol} symbol={symbol} large={content.symbols.length === 3 ? i === 1 : i === 0} />)}
        </div>}
        {content.invocation && <p className="al-invocation" lang="hi">{content.invocation}</p>}
        {content.shloka && <p className="al-shloka" lang="sa">{lines(content.shloka).map(line => <span key={line}>{line}</span>)}</p>}
        {content.deity && <div className="al-blessed">
          {content.blessingIntro && <p className="al-soft">{content.blessingIntro}</p>}
          <p className="al-deity">{content.deity}</p>
        </div>}
        {content.elders && <div className="al-blessed">
          {content.eldersIntro && <p className="al-soft">{content.eldersIntro}</p>}
          <p className="al-elders">{content.elders}</p>
          {content.eldersNote && <p className="al-note">{content.eldersNote}</p>}
        </div>}
        {page.design.coverPhoto && <figure className="al-photo">
          <img src={'data:image/jpeg;base64,' + page.design.coverPhoto} alt={coupleTitle} />
        </figure>}
        {content.intro && <p className="al-intro">{content.intro}</p>}
      </Paar>
    </section>,
    couple: () => shownPeople.length > 0 && <section className="al-section al-couple" aria-labelledby="al-couple">
      <Head kicker="Two homes, one heart" title={shownPeople.map(([label]) => label.replace('The ', '')).join(' & ')} id="al-couple" />
      <div className="al-pair">
        {shownPeople.map(([label, person, groom], i) => <Fragment key={label}>
          {i > 0 && <span className="al-pair-fish" aria-hidden="true"><svg viewBox="-34 -34 68 68"><FishPair r={11} /></svg></span>}
          <Person label={label} person={person} groom={groom} />
        </Fragment>)}
      </div>
    </section>,
    countdown: () => <Countdown target={target} />,
    events: () => events.length > 0 && <section className="al-section al-events" aria-labelledby="al-events">
      <Head kicker="Walk with us" title="The Wedding Days" id="al-events" />
      {sharedPlace && <a className="al-chip" data-reveal href={mapLink(events[0]) || undefined} target="_blank" rel="noreferrer">
        {Icon.pin}<span>Everything happens at <strong>{sharedPlace}</strong></span>
      </a>}
      <Procession events={events} content={content} zone={page.timeZone} sharedPlace={sharedPlace} />
    </section>,
    rsvp: () => rsvp && <section className="al-section al-rsvp" id="rsvp" aria-labelledby="al-rsvp">
      <Head kicker="Your reply" title="Will you walk in with us?" id="al-rsvp" />
      {content.rsvpBy && <p className="al-soft al-rsvp-by" data-reveal>Do tell us by {longDate(content.rsvpBy)}</p>}
      <div className="al-rsvp-body" data-reveal>{rsvp}</div>
    </section>,
    family: () => <Families content={content} />,
    venue: () => (places.length > 0 || content.dressCode) && <section className="al-section al-venue" aria-labelledby="al-venue">
      <Head kicker="Find the wedding house" title={sharedPlace || (places.length === 1 ? places[0].place : 'The Venues')} id="al-venue" />
      <div className="al-grid">
        {places.map(place => <Paar className="al-place" key={place.place} data-reveal>
          <span className="al-place-icon">{Icon.pin}</span>
          {places.length === 1 && sharedPlace && place.address ? <p className="al-label">The address</p> : <h3>{place.place}</h3>}
          {place.address && <p className="al-address">{place.address}</p>}
          {!sharedPlace && mapLink(place) && <a className="al-link" href={mapLink(place)} target="_blank" rel="noreferrer">Get directions</a>}
        </Paar>)}
        {content.dressCode && <Paar className="al-place is-attire" data-reveal>
          <span className="al-place-icon">{Icon.sparkle}</span>
          <p className="al-label">What to wear</p>
          <p className="al-address">{content.dressCode}</p>
        </Paar>}
      </div>
      <div className="al-actions" data-reveal>
        {events.length > 0 && <button type="button" className="al-button is-quiet" onClick={calendar}>{Icon.calendar}Add to Calendar</button>}
        {sharedPlace && mapLink(events[0]) && <a className="al-button" href={mapLink(events[0])} target="_blank" rel="noreferrer">{Icon.nav}Get Directions</a>}
      </div>
    </section>,
    contacts: () => content.contacts.length > 0 && <section className="al-section" aria-labelledby="al-contacts">
      <Head kicker="If you need us" title="Ask for us" id="al-contacts" />
      <ul className="al-contacts">
        {content.contacts.map(contact => <li key={contact.name + contact.phone} data-reveal>
          <Paar className="al-contact">
            <div className="al-contact-who">
              <h3>{contact.name}</h3>
              {contact.role && <p className="al-label">{contact.role}</p>}
            </div>
            <div className="al-contact-actions">
              <a className="al-button is-small" href={'tel:' + contact.phone.replace(/[\s-]/g, '')} aria-label={'Call ' + contact.name}>{Icon.phone}Call</a>
              <a className="al-button is-small is-quiet" href={'https://wa.me/' + whatsappNumber(contact.phone)} target="_blank" rel="noreferrer"
                aria-label={'WhatsApp ' + contact.name}>{Icon.chat}WhatsApp</a>
            </div>
          </Paar>
        </li>)}
      </ul>
    </section>,
    closing: () => <section className="al-section al-closing" aria-label="Closing">
      {content.closing && <p className="al-closing-line" data-reveal>{content.closing}</p>}
      <p className="al-closing-names" data-reveal ref={closingNames}>{names[0]}{names[1] && <><em>&amp;</em>{names[1]}</>}</p>
      {sharedPlace && <div className="al-blessed" data-reveal>
        <p className="al-elders">{sharedPlace}</p>
        {events[0].address && <p className="al-note">{events[0].address}</p>}
      </div>}
      {content.hosts && <div className="al-blessed" data-reveal>
        {content.regardsIntro && <p className="al-soft">{content.regardsIntro}</p>}
        <p className="al-hosts">{content.hosts}</p>
      </div>}
      <div className="al-doorstep" data-reveal aria-hidden="true"><DoorAlpona className="al-doorstep-art" heart /></div>
      <div className="al-anchal is-foot" aria-hidden="true" />
    </section>,
  }
  const order: SectionKey[] = design.sections.includes('rsvp') ? design.sections : [...design.sections, 'rsvp']

  return <div className="t-bengal-alpona" data-palette={palette} data-stage={stage} data-draw={options.drawIn === false ? 'still' : 'draw'}>
    {stage !== 'done' && <Opening names={names} title={content.title} date={longDate(page.date)} greeting={greeting} hint={String(options.lotusLine ?? '')}
      stage={stage} onOpen={draw} onContinue={finish} />}
    <div className="al-backdrop" aria-hidden="true" />
    {preview && <p className="al-preview">Preview · This is how your guests will see the invitation</p>}
    <main className="al-main" ref={root} aria-hidden={!open && stage !== 'leaving'}>
      {order.map(key => <Fragment key={key}><SectionAnchor section={key} />{render[key]()}</Fragment>)}
    </main>

    {music.available && open && <button type="button" className={'al-music' + (music.blocked ? ' is-pulse' : '')}
      aria-pressed={music.playing} onClick={music.toggle}>
      {music.playing ? Icon.soundOn : Icon.soundOff}<span>{music.playing ? 'Music On' : 'Music Off'}</span>
    </button>}
  </div>
}

import { useEffect, useState } from 'react'
import { rupees, weddingPass } from './Shop'
import { SiteNav } from './SiteNav'
import { Mandala, EventArt } from './invitation/art'
import workbook from './workbook-demo.json'
import './online-planner.css'

type Reply = 'pending' | 'attending' | 'declined'
const events = workbook.tables.find(table => table.name === 'Functions & Events')!.rows
  .filter(row => ['Sangeet', 'Wedding Ceremony', 'Reception'].includes(row[1]))
  .map(([id, name, date, time, venue]) => ({
    id, name: name === 'Wedding Ceremony' ? 'Wedding' : name, date, time, venue,
  }))
const when = (date: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  .format(new Date(date + 'T00:00:00Z'))
const at = (time: string) => new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
  .format(new Date('2027-01-01T' + time + ':00Z'))
const guestCount = 4
const baseConfirmed = [124, 186, 208]
const basePending = [32, 40, 48]

function InvitationDemo() {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(0)
  const [replies, setReplies] = useState<Reply[]>(events.map(() => 'pending'))
  const event = events[selected]
  const response = replies[selected]
  const confirmed = baseConfirmed[selected] + (response === 'attending' ? guestCount : 0)
  const pending = basePending[selected] + (response === 'pending' ? guestCount : 0)

  function reply(value: Reply) {
    setReplies(current => current.map((status, index) => index === selected ? value : status))
  }

  return <div className="online-demo" id="invitation-demo">
    <div className="online-demo-stage">
      <span className="online-demo-label">Interactive sample · Sharma family</span>
      <article className={'online-invitation' + (open ? ' is-open' : '')} aria-label="Sample invitation for the Sharma family">
        <Mandala className="online-mandala" />
        {!open ? <div className="online-envelope">
          <p className="online-script">You’re invited</p>
          <h2>Meera <em>&amp;</em> Aarav</h2>
          <p>15 February 2027 · Varanasi</p>
          <button className="online-seal" onClick={() => setOpen(true)} aria-label="Open Meera and Aarav’s sample invitation">M <span>&amp;</span> A</button>
          <p className="online-envelope-hint">Tap the seal to open</p>
        </div> : <div className="online-open-card">
          <p className="online-script">Together with our families</p>
          <h2>Meera <em>&amp;</em> Aarav</h2>
          <p className="online-greeting">Dear Sharma family, celebrate with us.</p>
          <div className="online-event-choices" role="group" aria-label="Choose a sample function">
            {events.map((item, index) => <button key={item.id} aria-pressed={selected === index}
              onClick={() => setSelected(index)}>{item.name}</button>)}
          </div>
          <div className="online-invite-event">
            <EventArt icon={selected === 0 ? 'sangeet' : selected === 1 ? 'pheras' : 'reception'} />
            <h3>{event.name}</h3>
            <p>{when(event.date)} · {at(event.time)}</p><p>{event.venue}</p>
          </div>
          <p className="online-reply-question">Will your family of {guestCount} join us?</p>
          <div className="online-reply-options" role="group" aria-label="Sample household reply">
            <button aria-pressed={response === 'attending'} onClick={() => reply('attending')}>We’ll be there</button>
            <button aria-pressed={response === 'declined'} onClick={() => reply('declined')}>Can’t make it</button>
          </div>
          <p className="online-reply-feedback" role="status">{response === 'attending' ? 'Lovely! All four of you are marked as attending.'
            : response === 'declined' ? 'Thank you. Your family is marked as unable to attend.' : 'Choose a reply to update the sample headcount.'}</p>
        </div>}
      </article>
    </div>
    <section className="online-live-count" aria-label="Sample organizer headcount">
      <div className="online-count-heading"><span className="online-status-dot" aria-hidden="true" /><strong>In the family planner</strong><span>{event.name}</span></div>
      <div className="online-count-numbers" aria-live="polite" aria-atomic="true">
        <div><strong>{confirmed}</strong><span>confirmed guests</span></div>
        <div><strong>{pending}</strong><span>awaiting a reply</span></div>
        <p>{response === 'attending' ? 'Sharma family · 4 attending' : response === 'declined' ? 'Sharma family · Unable to attend' : 'Sharma family · Awaiting reply'}</p>
      </div>
    </section>
    <p className="online-demo-note">Sample figures. Replies here stay on this page.</p>
  </div>
}

const features = [
  { title: 'An invitation with your family’s personality', text: 'Set the names, family details and function schedule. Preview the digital invitation before sharing it.',
    link: '#invitation-demo', action: 'Try the sample invitation' },
  { title: 'One private reply for each household', text: 'Invite a family to the functions meant for them. Guests reply on their phones, with travel and stay details alongside their RSVP.',
    link: '/#demo/guest-list', action: 'Explore the guest list' },
  { title: 'The details that get everyone there', text: 'Bring arrivals, pickups and room allocations into the same plan. Review guest updates before changing the arrangements.',
    link: '/#demo/transportation', action: 'See the pickup plan' },
]

export function OnlinePlanner() {
  const [checkoutAvailable, setCheckoutAvailable] = useState<boolean>()
  useEffect(() => {
    document.title = 'Online Wedding Planner | ShaadiPlannerPro'
    const controller = new AbortController()
    fetch('/api/excel/shop', { signal: controller.signal })
      .then(response => response.json())
      .then(shop => setCheckoutAvailable(shop.familyPassCompleteAvailable === true)).catch(() => {})
    return () => controller.abort()
  }, [])
  return <main className="public-shell online-planner">
    <SiteNav />
    <section className="online-hero" aria-labelledby="online-title">
      <div className="online-hero-copy">
        <p className="online-eyebrow">THE ONLINE WEDDING PLANNER</p>
        <h1 id="online-title">An invitation they’ll love.<br /><em>A plan your family can share.</em></h1>
        <p className="online-lede">From the first “we’ll be there” to the last airport pickup. Bring your invitations, guests and wedding-day details together.</p>
        <div className="online-actions">
          <a className="online-primary" href="/#demo">Try the free planner demo <span aria-hidden="true">↗</span></a>
          <a className="online-secondary" href="#invitation-demo">Open a sample invitation <span aria-hidden="true">↓</span></a>
        </div>
        <p className="online-small">Explore a sample wedding without signing in. <a href="#family-pass">See pricing and what’s included</a>.</p>
      </div>
      <InvitationDemo />
    </section>
    <section className="online-journey" aria-label="From invitation to wedding day">
      <span>A little less chasing.</span><p>Invite <span aria-hidden="true">→</span> Collect replies <span aria-hidden="true">→</span> Plan arrivals <span aria-hidden="true">→</span> Run the day</p>
    </section>
    <section className="online-features" aria-labelledby="online-everyone">
      <div className="online-section-heading"><p className="online-eyebrow">BUILT AROUND YOUR PEOPLE</p><h2 id="online-everyone">The celebration is personal.<br />The coordination can be simple.</h2></div>
      <div className="online-feature-grid">{features.map(feature => <article key={feature.title}>
        <h3>{feature.title}</h3><p>{feature.text}</p><a href={feature.link}>{feature.action} <span aria-hidden="true">↗</span></a>
      </article>)}</div>
    </section>
    <section className="online-logistics" aria-labelledby="online-day">
      <div>
        <p className="online-eyebrow">BEHIND EVERY “SEE YOU THERE”</p>
        <h2 id="online-day">A room ready.<br />A pickup planned.<br /><em>Someone who’s on it.</em></h2>
        <p>Give family members clear responsibilities, keep track of arrivals, and take the wedding timeline with you.</p>
        <a href="/#demo/family-responsibilities">See how the family shares the work <span aria-hidden="true">↗</span></a>
      </div>
      <div className="online-logistics-preview" aria-label="Illustrative arrival and pickup plan">
        <p className="online-preview-label">AARAV &amp; MEERA · SAMPLE PLAN</p>
        <div className="online-arrival-time"><span>14 FEB</span><strong>10:45 <small>AM</small></strong><span>Varanasi Airport</span></div>
        <h3>Sharma family</h3><p>4 guests · Pickup requested</p>
        <dl><div><dt>Pickup</dt><dd>Driver confirmation pending</dd></div><div><dt>Stay</dt><dd>2 rooms to arrange</dd></div><div><dt>Family contact</dt><dd>Cousin Rohan</dd></div></dl>
        <a href="/#demo/transportation">Open the sample transport plan <span aria-hidden="true">→</span></a>
      </div>
    </section>
    <section className="online-excel-bridge" aria-labelledby="online-excel">
      <div><p className="online-eyebrow">ALREADY PLANNING IN EXCEL?</p><h2 id="online-excel">Bring the plan you’ve already started.</h2>
        <p>Import your English v1.3.1 Shaadi Planner Pro workbook and review your functions and guests before creating the wedding. You can also start with a blank wedding.</p></div>
      <a href="/#demo/guest-list">See a sample guest list <span aria-hidden="true">↗</span></a>
    </section>
    <section className="online-pass" id="family-pass" aria-labelledby="online-pass-title">
      <div><p className="online-eyebrow">FAMILY PASS</p><h2 id="online-pass-title">One wedding.<br />One payment.</h2>
        <p>Share invitations and manage RSVPs, rooms, pickups and budgets with your family from one wedding workspace.</p>
        {checkoutAvailable && <p>Includes the English Complete bundle at no extra cost, with the Excel planner, vendor negotiation toolkit, and WhatsApp and RSVP message templates.</p>}</div>
      <div className="online-pass-price"><strong>{rupees(weddingPass.amount)}</strong><span>one-time price per wedding</span>
        {checkoutAvailable && <a className="online-primary" href="/#workspace/setup">Continue to Family Pass setup <span aria-hidden="true">↗</span></a>}
        {checkoutAvailable === false && <span>Family Pass checkout is currently paused.</span>}</div>
    </section>
    <div className="online-faq">
      <details><summary>Can guests reply without an account?</summary><p>Yes. Guests open their private household invitation on their phone and reply to the functions they’re invited to.</p></details>
      <details><summary>Can I share the schedule in a family group?</summary><p>Yes. The reusable schedule link gives the group a read-only schedule. Household RSVP links are shared privately.</p></details>
      <details><summary>Can I try the planner before paying?</summary><p>Explore the sample wedding without signing in. Sign in to preview an invitation with your own wedding details.</p></details>
    </div>
  </main>
}

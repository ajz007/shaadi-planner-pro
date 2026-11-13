import { useEffect } from 'react'
import { sampleOverview } from './WorkspaceDemo'
import { shownDate } from './WorkspaceGuests'
import './public.css'

const sellerName = import.meta.env.VITE_SELLER_NAME?.trim() || 'Ajit Shukla'
const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL?.trim() || 'support@shaadiplannerpro.com'

export const publicPages = {
  '/privacy': 'Privacy Policy',
  '/terms': 'Terms of Service',
  '/contact': 'Contact & Support',
} as const

export function PublicFooter() {
  return <footer className="public-footer">
    <a href="/">Shaadi Planner Pro</a>
    <nav aria-label="Product information">
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="/contact">Contact</a>
    </nav>
  </footer>
}

export function PublicHome() {
  const sangeetTime = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: sampleOverview.timeZone,
  }).format(new Date(sampleOverview.sangeet.startsAt))
  return <main className="public-shell public-home">
    <header className="public-hero">
      <div className="public-hero-copy">
        <p className="public-kicker">SHAADI PLANNER PRO</p>
        <h1>One plan for the whole shaadi.</h1>
        <p className="public-intro">See who’s coming, who needs a room or pickup, and what each person is handling. Start with a blank plan or bring your Shaadi Planner Excel workbook.</p>
        <div className="public-actions">
          <a className="public-primary" href="/#workspace">Start planning</a>
          <a className="public-sample-link" href="/#demo">Explore the wedding demo</a>
        </div>
        <p className="public-sample-note">No sign-in needed for the demo.</p>
      </div>
      <section className="public-preview" aria-labelledby="sample-preview-title">
        <div className="public-preview-heading">
          <div><span className="demo-badge">Demo</span><h2 id="sample-preview-title">{sampleOverview.name}</h2></div>
          <span className="public-marigold" aria-hidden="true">✿</span>
        </div>
        <p className="public-preview-date">{shownDate(sampleOverview.date)}</p>
        <ul>
          <li><a href="/#demo/guest-list?rsvp=awaiting"><span><strong>{sampleOverview.awaitingReplies} {sampleOverview.awaitingReplies === 1 ? 'guest' : 'guests'} awaiting a reply</strong><small>Guest List</small></span><span aria-hidden="true">→</span></a></li>
          <li><a href="/#demo/transportation"><span><strong>{sampleOverview.pickupsToConfirm} {sampleOverview.pickupsToConfirm === 1 ? 'driver' : 'drivers'} to confirm</strong><small>Transportation</small></span><span aria-hidden="true">→</span></a></li>
          <li><a href="/#demo/functions-events"><span><strong>{sampleOverview.sangeet.name}</strong><small>{sangeetTime} · {sampleOverview.sangeet.venue}</small></span><span aria-hidden="true">→</span></a></li>
        </ul>
      </section>
    </header>
    <section aria-labelledby="public-workflows">
      <h2 id="public-workflows">From the guest list to wedding day</h2>
      <div className="public-grid">
        <article><h3>Know who’s coming</h3><p>See who’s confirmed and which families still need a follow-up.</p>
          <a href="/#demo/guest-list?rsvp=awaiting">See the guest list <span aria-hidden="true">→</span></a></article>
        <article><h3>Get everyone there</h3><p>Plan pickups for arriving guests and assign rooms for their stay.</p>
          <a href="/#demo/transportation">See the pickup plan <span aria-hidden="true">→</span></a></article>
        <article><h3>Share the work</h3><p>Give family members clear tasks and see what still needs doing.</p>
          <a href="/#demo/family-responsibilities">See family tasks <span aria-hidden="true">→</span></a></article>
      </div>
    </section>
    <section className="public-workbook" aria-labelledby="public-workbook">
      <div><h2 id="public-workbook">Already planning in Excel?</h2>
        <p>Bring your Shaadi Planner workbook into your wedding and export an updated copy as plans change.</p></div>
      <a href="/#dashboard">Explore the Excel workbook example <span aria-hidden="true">→</span></a>
    </section>
  </main>
}

export function PublicInfoPage({ path }: { path: keyof typeof publicPages }) {
  const title = publicPages[path]
  useEffect(() => {
    document.title = title + ' | Shaadi Planner Pro'
  }, [title])

  return <main className="public-shell public-document">
    <p><a href="/">← Shaadi Planner Pro</a></p>
    <h1>{title}</h1>
    <p className="public-draft">Pre-launch draft. Retention and support procedures are pending verification.</p>
    {path === '/privacy' ? <>
      <h2>Information used by the planner</h2>
      <p>Google sign-in provides basic account information. The planner uses your Google account identifier and display name to create your account and show your name in the workspace. A session cookie keeps you signed in.</p>
      <p>When you upload a workbook or enter wedding details, the planner processes the information you provide. This can include guest names, phone numbers, RSVPs, travel details, room assignments, tasks, and budget records.</p>
      <p>If you use microphone dictation, your browser may send audio to its speech recognition service. The planner receives the resulting text and saves it when you submit the form. You can type instead.</p>
      <h2>Who can see wedding information</h2>
      <p>Access depends on the role an organizer grants within the wedding. Owners and co-organizers can work with guest and logistics records. Family members have limited access to their wedding’s planning tools. Owners can download an Excel snapshot, and organizers can print planning lists. Copies can be shared with people outside the planner.</p>
      <h2>Imports and retention</h2>
      <p>Unconfirmed import previews expire after 30 minutes and are cleared automatically. After confirmation, imported records remain in the wedding’s import history. The planner uses Railway to host its application and database.</p>
      <p>Under the proposed policy, owners can export their wedding plan for 90 days after the wedding date. Wedding records are then removed from the live service. Verified deletion requests can be handled earlier. Backup copies would expire within 30 days of removal from the live service.</p>
      <h2>Corrections and deletion requests</h2>
      <p>Contact the wedding organizer to correct details they entered about you, or use <a href="/contact">Contact & Support</a> for privacy and deletion requests.</p>
    </> : path === '/terms' ? <>
      <h2>Using the planner</h2>
      <p>Shaadi Planner Pro is operated by {sellerName}. It helps organizers manage wedding records, coordinate logistics and share planning tasks with invited members. Sign-in is required to manage a wedding.</p>
      <h2>Wedding records and sharing</h2>
      <p>Upload only information you’re permitted to use for wedding planning. Invite people who should have access, and review guest information before printing, exporting or sharing it. Confirm arrangements such as pickup times, rooms and vendor commitments with the people responsible for them.</p>
      <h2>Access and copies</h2>
      <p>Owners can download an Excel snapshot of the current wedding plan. See the <a href="/privacy">Privacy Policy</a> for the proposed post-wedding access and retention period. Pricing and refund terms will be published before paid sales open.</p>
      <p>For help with an account or a wedding, see <a href="/contact">Contact & Support</a>.</p>
    </> : <>
      <h2>Get help with the planner</h2>
      <p>Shaadi Planner Pro is operated by {sellerName}.</p>
      <p>Email <a href={'mailto:' + supportEmail}>{supportEmail}</a> for support or privacy requests.</p>
      <h2>What to include in a request</h2>
      <ul>
        <li><strong>Workbook import.</strong> Include the workbook version, tab name and row number from the import review.</li>
        <li><strong>Account access.</strong> Describe the step where sign-in or joining a wedding stopped.</li>
        <li><strong>Privacy requests.</strong> Say whether you’re requesting access, correction or deletion and whether you’re an organizer or guest.</li>
      </ul>
      <p>Leave guest lists, phone numbers, passwords and invitation codes out of your initial message.</p>
    </>}
  </main>
}

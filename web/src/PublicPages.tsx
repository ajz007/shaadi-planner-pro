import { useEffect } from 'react'
import { sampleOverview } from './WorkspaceDemo'
import { shownDate } from './WorkspaceGuests'
import './public.css'
import { SiteNav, useAccountLink } from './SiteNav'

const sellerName = import.meta.env.VITE_SELLER_NAME?.trim() || 'Ajit Shukla'
const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL?.trim() || 'support@shaadiplannerpro.com'

export const publicPages = {
  '/privacy': 'Privacy Policy',
  '/terms': 'Terms of Service',
  '/refunds': 'Family Pass Refund Policy',
  '/contact': 'Contact & Support',
} as const

export function PublicFooter() {
  const account = useAccountLink()
  return <footer className="public-footer">
    <a href="/">Shaadi Planner Pro</a>
    <nav aria-label="Product information">
      <a href={account.href}>{account.label}</a>
      <a href="/shop">Shop</a>
      <a href="/shop/purchase">Find a purchase</a>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="/refunds">Family Pass refunds</a>
      <a href="/contact">Contact</a>
    </nav>
  </footer>
}

export function PublicHome() {
  const sangeetTime = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: sampleOverview.timeZone,
  }).format(new Date(sampleOverview.sangeet.startsAt))
  const account = useAccountLink()
  return <main className="public-shell public-home">
    <SiteNav />
    <header className="public-hero">
      <div className="public-hero-copy">
        <p className="public-kicker">SHAADI PLANNER PRO</p>
        <h1>One plan for the whole shaadi.</h1>
        <p className="public-intro">See who’s coming, who needs a room or pickup, and what each person is handling. Start with a blank plan or bring your Shaadi Planner Excel workbook.</p>
        <div className="public-actions">
          <a className="public-primary" href="/shop/essentials">Buy Essentials — ₹699</a>
          <a className="public-sample-link" href="/shop">Browse the shop</a>
          <a className="public-sample-link" href="/#demo">Explore the wedding demo</a>
        </div>
        <p className="public-sample-note">No sign-in needed for the demo.</p>
        {account.signedIn
          ? <p className="public-returning">Welcome back. <a href={account.href}>Open my weddings <span aria-hidden="true">→</span></a></p>
          : <p className="public-returning">Already have an account? <a href={account.href}>Sign in</a></p>}
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
      <div><a href="/#dashboard">Explore the Excel workbook example <span aria-hidden="true">→</span></a><br />
        <a href="/#workspace">Import your workbook into the web planner <span aria-hidden="true">→</span></a></div>
    </section>
  </main>
}

export function PublicInfoPage({ path }: { path: keyof typeof publicPages }) {
  const title = publicPages[path]
  useEffect(() => {
    document.title = title + ' | Shaadi Planner Pro'
  }, [title])

  return <main className="public-shell public-document">
    <SiteNav />
    <h1>{title}</h1>
    {path === '/privacy' ? <>
      <h2>Information used by the planner</h2>
      <p>For shop orders, we store your checkout email, product, order and payment references, amount and payment date. We record checkout openings, dismissals, failed payment attempts and processed refunds to understand checkout issues. We use them to confirm purchases, email receipts and restore downloads. Razorpay processes your payment details and our email provider delivers your receipt.</p>
      <p>If you allow Meta ad measurement, we use Meta’s pixel for visits to the public storefront and demo, product views, and checkout starts. For Family Pass checkout starts and confirmed purchases we share the product, price, currency, an order event identifier, a hashed receipt email and available Meta browser or ad-click identifiers. We use the browser user agent for matching and keep campaign labels with the order. Consented campaign context can carry across tabs for seven days. You can change your choice using Ad measurement settings at the bottom of the storefront.</p>
      <p>Google sign-in provides basic account information. The planner uses your Google account identifier and display name to create your account and show your name in the workspace. We store your verified Google email for private account administration. A session cookie keeps you signed in.</p>
      <p>When you upload a workbook or enter wedding details, the planner processes the information you provide. This can include guest names, phone numbers, RSVPs, travel details, room assignments, tasks, and budget records.</p>
      <p>If you use microphone dictation, your browser may send audio to its speech recognition service. The planner receives the resulting text and saves it when you submit the form. You can type instead.</p>
      <h2>Who can see wedding information</h2>
      <p>Access depends on the role an organizer grants within the wedding. Owners and co-organizers can work with guest and logistics records. Family members have limited access to their wedding’s planning tools. Owners can download an Excel snapshot, and organizers can print planning lists. Copies can be shared with people outside the planner.</p>
      <h2>Imports and retention</h2>
      <p>Unconfirmed import previews expire after 30 minutes and are cleared automatically. After confirmation, imported records remain in the wedding’s import history. The planner uses Railway to host its application and database.</p>
      <p>For a Family Pass wedding, access lasts through the 90th day after the wedding, in the wedding's time zone. The live workspace and the guest records it contains are then scheduled for removal. A fully refunded wedding can be removed sooner as described in the <a href="/refunds">Family Pass Refund Policy</a>.</p>
      <p>Payment and order records are kept separately for receipts, support and accounting. Wedding data in provider backups may remain until those backups rotate out. This schedule applies to weddings created with a Family Pass.</p>
      <h2>Corrections and deletion requests</h2>
      <p>Contact the wedding organizer to correct details they entered about you, or use <a href="/contact">Contact & Support</a> for privacy and deletion requests.</p>
    </> : path === '/terms' ? <>
      <h2>Using the planner</h2>
      <p>Shaadi Planner Pro is operated by {sellerName}. It helps organizers manage wedding records, coordinate logistics and share planning tasks with invited members. Sign-in is required to manage a wedding.</p>
      <h2>Wedding records and sharing</h2>
      <p>Upload only information you’re permitted to use for wedding planning. Invite people who should have access, and review guest information before printing, exporting or sharing it. Confirm arrangements such as pickup times, rooms and vendor commitments with the people responsible for them.</p>
      <h2>Access and copies</h2>
      <p>The Family Pass is a one-time payment for one wedding and its functions. After payment is confirmed, the pass appears in wedding setup for the Google account used to purchase it. You can create a wedding from your private draft or import a supported workbook. Guests can reply through their private links.</p>
      <p>Access lasts through the 90th day after the wedding in its time zone. The owner can export the plan until access ends. Guest links can expire earlier, as shown when you share them. Contact support before the current access deadline if your wedding is postponed.</p>
      <p>See the <a href="/refunds">Family Pass Refund Policy</a> for eligibility and what happens to your workspace after a full refund.</p>
      <p>For help with an account or a wedding, see <a href="/contact">Contact & Support</a>.</p>
    </> : path === '/refunds' ? <>
      <h2>Request a refund</h2>
      <p>Contact <a href={'mailto:' + supportEmail}>{supportEmail}</a> with your receipt reference and the reason for the request. Request a refund within seven days of purchase if your Family Pass is unused. Contact us about duplicate payments, activation problems or service issues even if you have already created a wedding. Approved refunds are returned to the original payment method.</p>
      <h2>After a full refund</h2>
      <p>An unused pass can no longer be activated. For an activated wedding, editing and all guest and collaborator access end. The owner can export the workbook from My weddings for 30 days from the refund, or until the original access deadline if that comes first. The live workspace is then scheduled for removal.</p>
      <p>This policy applies to the Family Pass. Any rights that apply under applicable law continue to apply.</p>
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

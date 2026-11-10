import { useEffect } from 'react'
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
  return <main className="public-shell">
    <header className="public-hero">
      <p className="public-kicker">SHAADI PLANNER PRO</p>
      <h1>Plan the wedding together.</h1>
      <p>Keep guests, arrivals, rooms and family tasks in one private wedding workspace. Start from scratch or bring your existing Shaadi Planner Excel workbook.</p>
      <div className="public-actions">
        <a className="public-primary" href="/#workspace">Open private planner</a>
        <a href="/#dashboard">Explore the filled demo</a>
      </div>
    </header>
    <section aria-labelledby="public-workflows">
      <h2 id="public-workflows">From the guest list to wedding day</h2>
      <div className="public-grid">
        <article><h3>Bring your workbook</h3><p>Review your import, then work in Card or Workbook view. Download a current Excel snapshot whenever you need one.</p></article>
        <article><h3>Share the work</h3><p>Invite family to a private wedding so they can see assignments, claim open tasks and mark work complete.</p></article>
        <article><h3>Coordinate arrivals and stays</h3><p>Filter and print guest lists, assign rooms, plan pickups and track who needs an RSVP follow-up.</p></article>
      </div>
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
      <p>Shaadi Planner Pro is operated by {sellerName}. It helps organizers manage wedding records, coordinate logistics and share planning tasks with invited members. The private planner requires sign-in.</p>
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

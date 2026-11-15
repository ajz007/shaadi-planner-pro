import { useEffect } from 'react'
import catalog from './shop-catalog.json'
import './shop.css'

export type ShopProduct = (typeof catalog)[number]
export const featured = catalog[0]
export const weddingPass = catalog.find(item => item.slug === 'wedding-pass')!
export const shopProduct = (path: string) => catalog.find(item => productURL(item) === path)
export const productByID = (id?: string) => catalog.find(item => item.id === id)
export const productURL = (item: ShopProduct) => '/shop/' + item.slug
export const rupees = (paise: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: paise % 100 === 0 ? 0 : 2,
}).format(paise / 100)

const planner = [
  'Blank and filled wedding workbooks for multiple functions.',
  'Dashboard, budget and vendor payment trackers, and guest and RSVP follow-up.',
  'Rooms, pickups, family responsibilities, wedding timeline, outfits, gifts and emergency contacts.',
  'Quick Start Guide and 14-Day Final Wedding Checklist.',
]
const complete = [
  'Blank and filled wedding planning workbooks, Quick Start and 14-Day Final Wedding Checklist.',
  'Vendor comparison workbook with blank and filled versions, negotiation playbook, editable scripts, and a before-you-book checklist.',
  '38 WhatsApp and RSVP templates for guests, vendors, logistics, payments and last-minute updates.',
]
const core = [
  'Complete two-anchor Hinglish script with editable Word version.',
  '63-page script vault with performance introductions, transitions and funny or emotional lines.',
  'Editable DJ and run-of-show cue sheet, emergency rescue card and quick customisation guide.',
]
const pro = [
  ...core,
  'Solo-anchor script and 12 audience games with host lines.',
  '60-, 90- and 120-minute event structures, contingency planning and a rehearsal checklist.',
]

export const productContents: Record<string, string[]> = {
  essentials: [...planner, 'Start Here guide with a suggested setup order.'],
  'gujarati-planner': ['Gujarati v1.3.1 blank and filled workbooks.', 'Gujarati Quick Start Guide and 14-Day Final Wedding Checklist.', 'Gujarati readme and version changelog.'],
  complete,
  'all-in-one': [...complete, 'Sangeet Host Kit PRO with solo and two-anchor scripts, games, DJ cues, event flow and rehearsal tools.'],
  'message-pack': ['35 ready-to-copy messages in one PDF.', 'RSVPs, hotel rooms, airport and railway pickups, and family task reminders.', 'Vendor quotations, negotiations, service confirmations and payments.', 'Wedding-day updates, emergencies and post-wedding thank-yous.'],
  'sangeet-host-kit': core,
  'sangeet-host-kit-pro': pro,
}

export function ShopNav() {
  return <nav className="shop-nav" aria-label="Shop">
    <a className="shop-brand" href="/">ShaadiPlannerPro</a>
    <div><a href="/shop">Shop</a><a href="/shop/purchase">Find a purchase</a></div>
  </nav>
}

function ProductCard({ item }: { item: ShopProduct }) {
  return <article className="shop-card">
    <p className="shop-format">{item.format}</p>
    <h3><a href={productURL(item)}>{item.name}</a></h3>
    <p>{item.summary}</p>
    <div className="shop-card-end">
      <strong>{rupees(item.amount)}</strong>
      <a href={productURL(item)} aria-label={'View ' + item.name}>View details <span aria-hidden="true">→</span></a>
    </div>
  </article>
}

export function Shop() {
  useEffect(() => { document.title = 'Wedding Shop | ShaadiPlannerPro' }, [])
  return <main className="public-shell wedding-shop">
    <ShopNav />
    <header className="shop-intro">
      <h1>Wedding Shop</h1>
      <p>Planning workbooks, ready-to-send messages and Sangeet scripts for families organising an Indian wedding.</p>
    </header>
    <section className="shop-feature" aria-labelledby="shop-excel">
      <div>
        <p className="shop-format">{featured.format}</p>
        <h2 id="shop-excel">{featured.name}</h2>
        <p>{featured.summary}</p>
        <div className="shop-actions">
          <a className="shop-primary" href={productURL(featured)}>Buy Essentials — {rupees(featured.amount)}</a>
          <a href="/#dashboard">Preview the workbook</a>
        </div>
      </div>
      <aside className="shop-included">
        <h3>Plan every function</h3>
        <ul><li>Guests and RSVP follow-ups</li><li>Budget and vendor payments</li><li>Rooms and pickups</li><li>Family tasks and wedding timeline</li></ul>
      </aside>
    </section>
    {['Planning', 'Messages & hosting'].map(group => <section className="shop-section" key={group} aria-label={group}>
      <h2>{group === 'Planning' ? 'Planning workbooks & bundles' : group}</h2>
      {group === 'Planning' && <p className="shop-comparison">Essentials includes the English workbooks and two guides. Complete adds vendor negotiation tools and 38 messages. All-in-One adds Sangeet Host Kit PRO.</p>}
      <div className="shop-grid">{catalog.filter(item => item.group === group && item !== featured).map(item => <ProductCard item={item} key={item.id} />)}</div>
    </section>)}
    <section className="shop-section" aria-labelledby="shop-online">
      <h2 id="shop-online">Online planner</h2>
      <div className="shop-pass">
        <div><h3>{weddingPass.name}</h3><p>{weddingPass.summary}</p><p><strong>{rupees(weddingPass.amount)}</strong> planned one-time price for one wedding.</p></div>
        <a href={productURL(weddingPass)}>Preview Wedding Pass <span aria-hidden="true">→</span></a>
      </div>
    </section>
  </main>
}

export function WeddingPass() {
  useEffect(() => { document.title = 'Wedding Pass | ShaadiPlannerPro' }, [])
  return <main className="public-shell wedding-shop">
    <ShopNav />
    <header className="shop-intro"><h1>{weddingPass.name}</h1><p>{weddingPass.summary}</p></header>
    <section className="shop-pass">
      <div>
        <h2>{rupees(weddingPass.amount)} planned one-time price</h2>
        <p>Online planning for one wedding. Checkout is coming later.</p>
      </div>
      <a className="shop-primary" href="/#demo">Explore the sample wedding</a>
    </section>
  </main>
}

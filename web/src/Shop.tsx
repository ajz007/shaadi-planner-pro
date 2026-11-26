import { useEffect } from 'react'
import catalog from './shop-catalog.json'
import './shop.css'
import { ProductImage } from './ProductImage'
import { SiteNav } from './SiteNav'

export type ShopProduct = (typeof catalog)[number]
export const featured = catalog[0]
export const weddingPass = catalog.find(item => item.slug === 'wedding-pass')!
export const shopProduct = (path: string) => catalog.find(item => productURL(item) === path)
export const productByID = (id?: string) => catalog.find(item => item.id === id)
export const productURL = (item: ShopProduct) => '/shop/' + item.slug

export function sourceWorkbook() {
  const slug = new URLSearchParams(window.location.search).get('from')
  const item = slug && shopProduct('/shop/' + slug)
  return item && item.group === 'Planning' ? item : undefined
}

export function plannerShowcaseURL(source?: string) {
  return productURL(weddingPass) + (source ? '?from=' + encodeURIComponent(source) : '')
}

export const rupees = (paise: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: paise % 100 === 0 ? 0 : 2,
}).format(paise / 100)

export type WeddingQuote = { listAmount: number; amount: number; discountPercent: number }

export function WeddingPrice({ quote }: { quote: WeddingQuote }) {
  if (quote.amount >= quote.listAmount) return <strong>{rupees(quote.amount)}</strong>
  return <><del aria-label="Regular price">{rupees(quote.listAmount)}</del>{' '}
    <strong>{quote.amount === 0 ? 'Free' : rupees(quote.amount)}</strong>{' '}
    <span>({quote.discountPercent}% off)</span></>
}

function ProductCard({ item }: { item: ShopProduct }) {
  return <article className="shop-card">
    <a className="shop-cover-link" href={productURL(item)} aria-label={'See ' + item.name}><ProductImage slug={item.slug} /></a>
    <div className="shop-card-copy">
      <p className="shop-format">{item.format}</p>
      <h3><a href={productURL(item)}>{item.name}</a></h3>
      <p>{item.summary}</p>
      <div className="shop-card-end">
        <strong>{rupees(item.amount)}</strong>
        <a href={productURL(item)} aria-label={'View ' + item.name}>View details <span aria-hidden="true">→</span></a>
      </div>
    </div>
  </article>
}

export function Shop() {
  useEffect(() => { document.title = 'Wedding Shop | ShaadiPlannerPro' }, [])
  return <main className="public-shell wedding-shop">
    <SiteNav shop />
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
      <a className="shop-feature-image" href={productURL(featured)} aria-label="See Essentials"><ProductImage slug={featured.slug} eager /></a>
    </section>
    {['Planning', 'Messages & hosting'].map(group => <section className="shop-section" key={group} aria-label={group}>
      <h2>{group === 'Planning' ? 'Planning workbooks & bundles' : group}</h2>
      {group === 'Planning' && <p className="shop-comparison">Essentials includes the English workbooks and two guides. Complete adds vendor negotiation tools and 38 messages. All-in-One adds Sangeet Host Kit PRO.</p>}
      <div className="shop-grid">{catalog.filter(item => item.group === group && item !== featured).map(item => <ProductCard item={item} key={item.id} />)}</div>
    </section>)}
    <section className="shop-section" aria-labelledby="shop-online">
      <h2 id="shop-online">Online planner</h2>
      <div className="shop-online-showcase">
        <div><p className="shop-format">INVITATIONS · RSVPS · FAMILY COORDINATION</p><h3>An invitation they’ll love.<br /><em>A plan your family can share.</em></h3>
          <p>{weddingPass.summary}</p><a href={productURL(weddingPass)}>Discover the online planner <span aria-hidden="true">↗</span></a></div>
        <a href={productURL(weddingPass)} className="shop-online-invite" aria-label="Preview the Online Planner invitation">
          <span>You’re invited</span><strong>Meera <em>&amp;</em> Aarav</strong><span>15 February 2027 · Varanasi</span><span className="shop-online-seal">M &amp; A</span>
        </a>
      </div>
    </section>
  </main>
}

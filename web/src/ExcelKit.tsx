import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { productByID, productContents, rupees, ShopNav } from './Shop'
import type { ShopProduct } from './Shop'
import './excel-kit.css'

type Checkout = { key: string; order: string; email: string; amount: number; currency: string }
type Purchase = { state: 'pending' | 'paid'; test: boolean; checkout?: Checkout; payment?: string; product: string }
type ShopStatus = { products: Record<string, boolean>; test: boolean; testAccessRequired?: boolean }
type Confirmation = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
type Razorpay = new (options: {
  key: string; order_id: string; amount: number; currency: string
  name: string; description: string; prefill: { email: string }
  modal: { ondismiss: () => void }; handler: (payment: Confirmation) => void
}) => { open: () => void }

const purchasePath = '/shop/purchase'
const lastPurchase = 'shaadi-excel-purchase'

function rememberedPurchase() {
  try { return localStorage.getItem(lastPurchase) || '' } catch { return '' }
}

async function request<T>(path: string, body?: object): Promise<T> {
  const response = await fetch('/api/excel/' + path, body && {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error)
  return data
}

function errorText(error: unknown) {
  return error instanceof Error && !(error instanceof SyntaxError)
    ? error.message : 'Something went wrong. Please try again.'
}

let checkoutScript: Promise<Razorpay> | undefined
function loadCheckout() {
  const read = () => (window as Window & { Razorpay?: Razorpay }).Razorpay
  checkoutScript ??= new Promise<Razorpay>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    const failed = () => {
      script.remove()
      reject(new Error('Razorpay could not load. Check your connection and try again.'))
    }
    const timeout = window.setTimeout(failed, 10_000)
    script.onload = () => {
      window.clearTimeout(timeout)
      const checkout = read()
      if (checkout) resolve(checkout)
      else failed()
    }
    script.onerror = () => { window.clearTimeout(timeout); failed() }
    document.head.append(script)
  }).catch(error => { checkoutScript = undefined; throw error })
  return checkoutScript
}

export function DownloadProduct({ item }: { item: ShopProduct }) {
  const [shop, setShop] = useState<ShopStatus>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const previous = rememberedPurchase()
  const available = shop?.products[item.id]
  const isPDF = item.slug === 'message-pack'
  const hasWorkbook = item.group === 'Planning'
  const hasWord = item.format.includes('Word')
  useEffect(() => {
    document.title = item.name + ' | ShaadiPlannerPro'
    request<ShopStatus>('shop').then(setShop).catch(() => setShop({ products: {}, test: false }))
  }, [item.name])

  async function order(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = form.get('email')
    const testAccess = form.get('testAccess') || ''
    setBusy(true)
    setError('')
    try {
      const { code } = await request<{ code: string }>('orders', { email, testAccess, product: item.id })
      try { localStorage.setItem(lastPurchase, code) } catch { /* The purchase URL also carries the code. */ }
      window.location.assign(purchasePath + '#' + code)
    } catch (failure) {
      setError(errorText(failure))
      setBusy(false)
    }
  }

  return <main className="public-shell excel-kit">
    <ShopNav />
    <header className="excel-product-heading">
      <p className="excel-edition">{item.format}</p>
      <h1>{item.name}</h1>
      <p className="excel-intro">{item.summary}</p>
      {hasWorkbook && <a href="/#dashboard">Preview the English sample workbook</a>}
    </header>
    <div className="excel-product">
      <section className="excel-card" aria-labelledby="excel-price">
        <h2 id="excel-price">{rupees(item.amount)} <span>one-time payment</span></h2>
        <p>Download the {isPDF ? 'PDF' : 'ZIP'} as soon as Razorpay confirms your payment. Your emailed receipt includes a private link to download it again on another device.</p>
        <p>No planner account is needed for this download.</p>
        {shop?.test && <p className="excel-notice" role="status">Test checkout. No money will be charged.</p>}
        <form onSubmit={order}>
          <label htmlFor="excel-email">Email for your receipt</label>
          <input name="email" id="excel-email" type="email" autoComplete="email" maxLength={254} required disabled={!available || busy} />
          {shop?.testAccessRequired && <>
            <label htmlFor="excel-test-access">Private test checkout code</label>
            <input name="testAccess" id="excel-test-access" type="password" autoComplete="off" required disabled={!available || busy} />
          </>}
          <button disabled={!available || busy}>{busy ? 'Preparing checkout…' : `Buy ${item.name} — ${rupees(item.amount)}`}</button>
        </form>
        {error && <p role="alert" className="error">{error}</p>}
        {shop && !available && <p role="status">Checkout is currently unavailable.</p>}
        {previous && <p><a href={purchasePath + '#' + previous}>Return to your last purchase</a></p>}
      </section>
      <section className="excel-details">
        <h2>What’s included</h2>
        <ul className="excel-contents">
          {productContents[item.slug].map(line => <li key={line}>{line}</li>)}
        </ul>
        <h2>What you’ll need</h2>
        <p>{!isPDF && 'Unzip the download. '}{hasWorkbook && 'Open the .xlsx files in desktop Microsoft Excel with automatic calculation enabled. No macros are required. '}{hasWord && 'Use Word or a compatible editor for the editable scripts. '}Use a PDF reader for {isPDF ? 'the templates' : 'the guides'}.</p>
        {item.slug === 'sangeet-host-kit' && <p>Hosting solo or planning games? <a href="/shop/sangeet-host-kit-pro">See Sangeet Host Kit PRO</a>.</p>}
        {item.slug === 'sangeet-host-kit-pro' && <p>Hosting as a pair? <a href="/shop/sangeet-host-kit">See the two-anchor Core kit</a>.</p>}
      </section>
    </div>
  </main>
}

function Recovery() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  async function recover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = new FormData(event.currentTarget).get('email')
    setBusy(true)
    setError('')
    setSent(false)
    try {
      await request('recover', { email })
      setSent(true)
    } catch (failure) {
      setError(errorText(failure))
    } finally {
      setBusy(false)
    }
  }
  return <section className="excel-card">
    <h2>Find a purchase</h2>
    <p>Enter the email you used at checkout. We’ll resend links for confirmed purchases.</p>
    <form onSubmit={recover}>
      <label htmlFor="recovery-email">Checkout email</label>
      <input name="email" id="recovery-email" type="email" autoComplete="email" maxLength={254} required />
      <button disabled={busy}>{busy ? 'Requesting receipt…' : 'Resend purchase receipt'}</button>
    </form>
    {sent && <p role="status">If there’s a confirmed purchase for this address, check your inbox or spam folder in a few minutes.</p>}
    {error && <p role="alert" className="error">{error}</p>}
  </section>
}

export function ShopPurchase({ code }: { code: string }) {
  const [purchase, setPurchase] = useState<Purchase>()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [canRecover, setCanRecover] = useState(false)
  const item = productByID(purchase?.product)
  useEffect(() => {
    document.title = 'Your purchase | ShaadiPlannerPro'
    let active = true
    request<{ recovery: boolean }>('shop').then(shop => {
      if (active) setCanRecover(shop.recovery)
    }).catch(() => {})
    if (code) {
      setBusy('Checking payment…')
      request<Purchase>('status', { code }).then(result => {
        if (active) setPurchase(result)
      }).catch(failure => {
        if (active) setError(errorText(failure))
      }).finally(() => { if (active) setBusy('') })
    }
    return () => { active = false }
  }, [code])

  async function refresh() {
    setBusy('Checking payment…')
    setError('')
    try {
      setPurchase(await request<Purchase>('status', { code }))
    } catch (failure) {
      setError(errorText(failure))
    } finally {
      setBusy('')
    }
  }

  async function pay() {
    setBusy('Opening Razorpay…')
    setError('')
    setNotice('')
    try {
      // Recheck this order before every retry, including after a tab was closed.
      const latest = await request<Purchase>('status', { code })
      setPurchase(latest)
      const info = latest.checkout
      if (!info) {
        setBusy('')
        return
      }
      const RazorpayCheckout = await loadCheckout()
      new RazorpayCheckout({
        key: info.key, order_id: info.order, amount: info.amount, currency: info.currency,
        name: 'ShaadiPlannerPro', description: productByID(latest.product)?.name ?? 'Digital download', prefill: { email: info.email },
        modal: { ondismiss: () => {
          setNotice('Checkout was closed. Check payment status before trying again if your bank shows a debit.')
          void refresh()
        } },
        handler: async payment => {
          setBusy('Verifying payment…')
          try {
            const result = await request<Purchase>('confirm', {
              code, order: payment.razorpay_order_id, payment: payment.razorpay_payment_id,
              signature: payment.razorpay_signature,
            })
            setPurchase(result)
            if (result.state !== 'paid') setNotice('Razorpay is still confirming the payment. Check payment status in a moment.')
          } catch (failure) {
            setError(errorText(failure))
          } finally {
            setBusy('')
          }
        },
      }).open()
      setBusy('Checkout is open…')
    } catch (failure) {
      setError(errorText(failure))
      setBusy('')
    }
  }

  async function download() {
    setBusy('Preparing download…')
    setError('')
    try {
      const response = await fetch('/api/excel/download', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
      })
      if (!response.ok) throw new Error((await response.json()).error)
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = /filename="?([^";]+)"?/i.exec(response.headers.get('Content-Disposition') || '')?.[1] || 'ShaadiPlannerPro-download'
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } catch (failure) {
      setError(errorText(failure))
    } finally {
      setBusy('')
    }
  }

  return <main className="public-shell excel-kit excel-purchase">
    <ShopNav />
    <h1>{code ? 'Your purchase' : 'Find your purchase'}</h1>
    {code && <section className="excel-card">
      {purchase?.test && <p className="excel-notice">Test purchase. No money was charged.</p>}
      {item && <p><strong>{item.name}</strong></p>}
      {purchase?.state === 'paid' ? <>
        <h2>Payment confirmed</h2>
        <p>Your download is ready. Keep your emailed receipt to download it again.</p>
        <button disabled={Boolean(busy)} onClick={download}>Download your purchase</button>
        <p className="excel-reference">Razorpay reference {purchase.payment}</p>
      </> : <>
        {purchase && <h2>{purchase.checkout ? 'Ready to pay' : 'Payment awaiting confirmation'}</h2>}
        {purchase?.checkout && <button disabled={Boolean(busy)} onClick={pay}>Pay {rupees(purchase.checkout.amount)} with Razorpay</button>}
        {purchase && !purchase.checkout && <p>Access unlocks after Razorpay confirms the payment. If you just paid, check again in a moment.</p>}
        <div className="excel-status-actions">
          <button className="secondary" disabled={Boolean(busy)} onClick={refresh}>Check payment status</button>
        </div>
      </>}
      {(busy || (notice && purchase?.state !== 'paid')) && <p role="status">{busy || notice}</p>}
      {error && <p role="alert" className="error">{error}</p>}
    </section>}
    {!code && rememberedPurchase() && <p><a href={purchasePath + '#' + rememberedPurchase()}>Return to the last purchase on this device</a></p>}
    {canRecover && <Recovery />}
    {!canRecover && !code && <p>Open the private link from your receipt or <a href="/contact">contact support</a> for help.</p>}
  </main>
}

type Pixel = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void
  queue: unknown[][]
  loaded: boolean
  version: string
  push: Pixel
}
declare global { interface Window { fbq?: Pixel; _fbq?: Pixel } }

const choiceKey = 'spp-meta-measurement'
const campaignKey = 'spp-shop-campaign'
const campaignLifetime = 7 * 24 * 60 * 60 * 1000

export function marketingChoice() {
  try { return localStorage.getItem(choiceKey) } catch { return null }
}
export function rememberMarketing(enabled: boolean) {
  try { localStorage.setItem(choiceKey, enabled ? 'yes' : 'no') } catch { /* Current-page choice still applies. */ }
  if (!enabled) {
    try { sessionStorage.removeItem(choiceKey); localStorage.removeItem(campaignKey) } catch { /* Storage may be unavailable. */ }
  }
}

let initialized = ''
export function setPixelConsent(enabled: boolean) {
  window.fbq?.('consent', enabled ? 'grant' : 'revoke')
}

export function trackPage(id: string, demo: boolean) {
  track(id, 'PageView')
  if (demo) track(id, 'PlannerDemoView', {}, true)
}

export function trackProduct(id: string, item: { id: string; amount: number }, event: 'ViewContent' | 'InitiateCheckout') {
  track(id, event, { content_ids: [item.id], content_type: 'product', value: item.amount / 100, currency: 'INR' })
}

function track(id: string, event: string, data: object = {}, custom = false) {
  try {
    if (!/^\d+$/.test(id)) return
    if (!window.fbq) {
      const pixel = function (...args: unknown[]) {
        if (pixel.callMethod) pixel.callMethod(...args)
        else pixel.queue.push(args)
      } as Pixel
      pixel.push = pixel
      pixel.queue = []
      pixel.loaded = true
      pixel.version = '2.0'
      window.fbq = window._fbq = pixel
      const script = document.createElement('script')
      script.async = true
      script.src = 'https://connect.facebook.net/en_US/fbevents.js'
      document.head.append(script)
    }
    if (initialized !== id) {
      window.fbq('set', 'autoConfig', false, id)
      window.fbq('init', id)
      initialized = id
    }
    window.fbq(custom ? 'trackSingleCustom' : 'trackSingle', id, event, data)
  } catch { /* Analytics must never interrupt checkout. */ }
}

export function rememberAttribution() {
  const query = new URLSearchParams(location.search)
  const data: Record<string, string> = {}
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const value = query.get(key)
    if (value && /^[\w.-]{1,120}$/.test(value)) data[key] = value
  }
  const click = query.get('fbclid')
  if (click && /^[\w.-]{1,500}$/.test(click)) {
    data.fbc = 'fb.1.' + Date.now() + '.' + click
  }
  const freshCampaign = Object.keys(data).length > 0
  if (query.get('entry') === 'post_purchase') data.entry = 'post_purchase'
  try {
    const saved = JSON.parse(localStorage.getItem(campaignKey) || 'null')
    const legacy = sessionStorage.getItem(choiceKey)
    if (!freshCampaign) {
      const prior = saved?.expires > Date.now() ? saved.labels : !saved && legacy ? JSON.parse(legacy) : {}
      Object.assign(data, { ...prior, ...data })
    }
    if (freshCampaign || data.entry && query.has('entry') || legacy) {
      localStorage.setItem(campaignKey, JSON.stringify({ labels: data, expires: Date.now() + campaignLifetime }))
    }
    if (legacy) sessionStorage.removeItem(choiceKey)
  } catch { /* Storage may be unavailable. */ }
  return data
}

export function attribution() {
  const data = rememberAttribution()
  try {
    for (const cookie of document.cookie.split('; ')) {
      const [name, value] = cookie.split('=')
      if ((name === '_fbp' || name === '_fbc') && value && !data[name.slice(1)]) data[name.slice(1)] = value
    }
  } catch { /* Cookies may be disabled. */ }
  return data
}

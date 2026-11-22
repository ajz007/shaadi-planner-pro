type Pixel = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void
  queue: unknown[][]
  loaded: boolean
  version: string
  push: Pixel
}
declare global { interface Window { fbq?: Pixel; _fbq?: Pixel } }

const choiceKey = 'spp-meta-measurement'
export function marketingChoice() {
  try { return localStorage.getItem(choiceKey) === 'yes' } catch { return false }
}
export function rememberMarketing(enabled: boolean) {
  try { localStorage.setItem(choiceKey, enabled ? 'yes' : 'no') } catch { /* Current-page choice still applies. */ }
  window.fbq?.('consent', enabled ? 'grant' : 'revoke')
}

let initialized = ''
let viewed = ''
export function trackProduct(id: string, item: { id: string; amount: number }, event: 'ViewContent' | 'InitiateCheckout') {
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
    if (event === 'ViewContent') {
      if (viewed === item.id) return
      viewed = item.id
      window.fbq('trackSingle', id, 'PageView')
    }
    window.fbq('trackSingle', id, event, {
      content_ids: [item.id], content_type: 'product', value: item.amount / 100, currency: 'INR',
    })
  } catch { /* Analytics must never interrupt checkout. */ }
}

export function attribution() {
  const query = new URLSearchParams(location.search)
  const data: Record<string, string> = {}
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const value = query.get(key)
    if (value && /^[\w.-]{1,120}$/.test(value)) data[key] = value
  }
  try {
    for (const cookie of document.cookie.split('; ')) {
      const [name, value] = cookie.split('=')
      if ((name === '_fbp' || name === '_fbc') && value) data[name.slice(1)] = value
    }
  } catch { /* Cookies may be disabled. */ }
  const click = query.get('fbclid')
  if (click && /^[\w.-]{1,500}$/.test(click) && !data.fbc?.endsWith('.' + click)) {
    data.fbc = 'fb.1.' + Date.now() + '.' + click
  }
  return data
}

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

const choiceKey = 'spp-google-analytics'
const campaignKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id']
let initializedID = ''

export function analyticsChoice() {
  try { return localStorage.getItem(choiceKey) } catch { return null }
}

export function rememberAnalytics(allow: boolean) {
  try { localStorage.setItem(choiceKey, allow ? 'yes' : 'no') } catch { /* Use the current-page choice. */ }
}

export function pauseAnalytics() {
  if (initializedID) Reflect.set(window, 'ga-disable-' + initializedID, true)
}

export function trackStorefrontPage(id: string, path: string) {
  const page = new URL(path, window.location.origin)
  const query = new URLSearchParams(window.location.search)
  for (const key of campaignKeys) {
    const value = query.get(key)
    if (value && /^[\w.-]{1,120}$/.test(value)) page.searchParams.set(key, value)
  }
  const referrer = document.referrer ? new URL(document.referrer).origin + '/' : ''
  const location = { page_location: page.href, page_referrer: referrer }
  Reflect.set(window, 'ga-disable-' + id, false)
  window.dataLayer ??= []
  const gtag = window.gtag ??= function () { window.dataLayer?.push(arguments) }
  if (initializedID !== id) {
    initializedID = id
    gtag('js', new Date())
    const script = document.createElement('script')
    script.async = true
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + id
    script.referrerPolicy = 'origin'
    document.head.append(script)
  }
  gtag('config', id, {
    ...location,
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  })
  gtag('event', 'page_view', { ...location, send_to: id })
}

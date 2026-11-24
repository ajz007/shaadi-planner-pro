import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { analyticsChoice, pauseAnalytics, rememberAnalytics, trackStorefrontPage } from './shopAnalytics'
import { marketingChoice, rememberAttribution, rememberMarketing, setPixelConsent, trackPage, trackProduct } from './shopMeta'
import './shop-measurement.css'

const ShopPixel = createContext('')

export function useShopPixel() {
  return useContext(ShopPixel)
}

export function ShopMeasurement({ pageKey, analyticsPath, item, demo, children }: {
  pageKey?: string
  analyticsPath?: string
  item?: { id: string; amount: number }
  demo: boolean
  children: ReactNode
}) {
  const [id, setId] = useState('')
  const [choice, setChoice] = useState(marketingChoice)
  const [analyticsID, setAnalyticsID] = useState('')
  const [googleChoice, setGoogleChoice] = useState(analyticsChoice)
  const [editing, setEditing] = useState<'meta' | 'google'>()
  const lastPage = useRef('')
  const enabled = Boolean(pageKey)
  const pixelID = enabled && choice === 'yes' ? id : ''
  const analyticsEnabled = Boolean(analyticsPath)

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    fetch('/api/excel/shop', { signal: controller.signal })
      .then(response => { if (response.ok) return response.json() })
      .then(data => { if (data?.metaPixelID) setId(data.metaPixelID) })
      .catch(() => {})
    const syncChoice = () => setChoice(marketingChoice())
    window.addEventListener('storage', syncChoice)
    return () => {
      controller.abort()
      window.removeEventListener('storage', syncChoice)
    }
  }, [enabled])

  useEffect(() => {
    if (!analyticsEnabled) return
    const controller = new AbortController()
    fetch('/api/storefront-analytics', { signal: controller.signal })
      .then(response => { if (response.status === 200) return response.json() })
      .then(data => {
        if (typeof data?.measurementID === 'string' && /^G-[A-Z0-9]+$/.test(data.measurementID)) {
          setAnalyticsID(data.measurementID)
        }
      })
      .catch(() => {})
    const syncChoice = () => setGoogleChoice(analyticsChoice())
    window.addEventListener('storage', syncChoice)
    return () => {
      controller.abort()
      window.removeEventListener('storage', syncChoice)
    }
  }, [analyticsEnabled])

  useEffect(() => {
    if (!analyticsPath || !analyticsID || googleChoice !== 'yes') return
    trackStorefrontPage(analyticsID, analyticsPath)
    return pauseAnalytics
  }, [analyticsID, analyticsPath, googleChoice])

  useLayoutEffect(() => {
    setPixelConsent(Boolean(pixelID))
    if (!pixelID) lastPage.current = ''
    return () => setPixelConsent(false)
  }, [pixelID])

  useEffect(() => {
    if (!pixelID || !pageKey || lastPage.current === pageKey) return
    lastPage.current = pageKey
    rememberAttribution()
    trackPage(pixelID, demo)
    if (item) trackProduct(pixelID, item, 'ViewContent')
  }, [pixelID, pageKey, demo, item])

  function select(allow: boolean) {
    rememberMarketing(allow)
    setChoice(allow ? 'yes' : 'no')
    setEditing(undefined)
  }

  function selectAnalytics(allow: boolean) {
    rememberAnalytics(allow)
    setGoogleChoice(allow ? 'yes' : 'no')
    setEditing(undefined)
  }

  const showMeta = enabled && Boolean(id)
  const showGoogle = analyticsEnabled && Boolean(analyticsID)
  const promptMeta = showMeta && (editing === 'meta' || (!editing && choice === null))
  const promptGoogle = showGoogle && (editing === 'google' || (!editing && !promptMeta && googleChoice === null))
  const metaSettings = showMeta && choice !== null
  const googleSettings = showGoogle && googleChoice !== null

  return <ShopPixel.Provider value={pixelID}>
    {children}
    {promptGoogle && <aside className="shop-measurement" aria-label="Store analytics">
      <div><strong>Store analytics</strong>
        <p>Allow Google Analytics to measure store and payment page visits. <a href="/privacy">Privacy details</a></p>
      </div>
      <div className="shop-measurement-actions">
        <button type="button" onClick={() => selectAnalytics(false)}>Decline</button>
        <button type="button" onClick={() => selectAnalytics(true)}>Allow</button>
      </div>
    </aside>}
    {promptMeta && <aside className="shop-measurement" aria-label="Ad measurement">
      <div><strong>Ad measurement</strong>
        <p>Allow Meta to measure store visits, demo views and checkout. Confirmed purchases can be matched using a hashed email. <a href="/privacy">Privacy details</a></p>
      </div>
      <div className="shop-measurement-actions">
        <button type="button" onClick={() => select(false)}>Decline</button>
        <button type="button" onClick={() => select(true)}>Allow</button>
      </div>
    </aside>}
    {(metaSettings || googleSettings) && <div className="shop-measurement-settings">
      {metaSettings && <button type="button" onClick={() => setEditing('meta')}>Ad measurement settings</button>}
      {googleSettings && <button type="button" onClick={() => setEditing('google')}>Store analytics settings</button>}
    </div>}
  </ShopPixel.Provider>
}

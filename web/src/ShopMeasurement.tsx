import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { marketingChoice, rememberAttribution, rememberMarketing, setPixelConsent, trackPage, trackProduct } from './shopMeta'
import './shop-measurement.css'

const ShopPixel = createContext('')

export function useShopPixel() {
  return useContext(ShopPixel)
}

export function ShopMeasurement({ pageKey, item, demo, children }: {
  pageKey?: string
  item?: { id: string; amount: number }
  demo: boolean
  children: ReactNode
}) {
  const [id, setId] = useState('')
  const [choice, setChoice] = useState(marketingChoice)
  const [editing, setEditing] = useState(false)
  const lastPage = useRef('')
  const enabled = Boolean(pageKey)
  const pixelID = enabled && choice === 'yes' ? id : ''

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
    setEditing(false)
  }

  return <ShopPixel.Provider value={pixelID}>
    {children}
    {enabled && id && (choice === null || editing
      ? <aside className="shop-measurement" aria-label="Ad measurement">
          <div><strong>Ad measurement</strong>
            <p>Allow Meta to measure store visits, demo views and checkout. Confirmed purchases can be matched using a hashed email. <a href="/privacy">Privacy details</a></p>
          </div>
          <div className="shop-measurement-actions">
            <button type="button" onClick={() => select(false)}>Decline</button>
            <button type="button" onClick={() => select(true)}>Allow</button>
          </div>
        </aside>
      : <div className="shop-measurement-settings"><button type="button" onClick={() => setEditing(true)}>Ad measurement settings</button></div>)}
  </ShopPixel.Provider>
}

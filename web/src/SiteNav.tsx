import { useEffect, useState } from 'react'
import './public.css'

type Account = { href: string; label: string; signedIn: boolean }

const signIn: Account = { href: '/#workspace', label: 'Sign in', signedIn: false }

// Remember the answer for this page load so every nav on the page agrees.
let known: Promise<Account> | undefined

function account(): Promise<Account> {
  known ??= fetch('/api/workspace/session')
    .then(result => result.ok ? result.json() : {})
    .then((session: { name?: string; workspaceURL?: string }) => session.workspaceURL
      ? { href: session.workspaceURL, label: 'Sign in', signedIn: false }
      : session.name ? { href: '/#workspace', label: 'My weddings', signedIn: true } : signIn)
    .catch(() => signIn)
  return known
}

export function useAccountLink() {
  const [link, setLink] = useState(signIn)
  useEffect(() => {
    let live = true
    void account().then(found => { if (live) setLink(found) })
    return () => { live = false }
  }, [])
  return link
}

export function SiteNav({ shop = false }: { shop?: boolean }) {
  const link = useAccountLink()
  return <nav className="site-nav" aria-label="Site">
    <a className="site-brand" href="/">Shaadi Planner Pro</a>
    <div>
      <a href="/shop">Shop</a>
      {shop ? <a href="/shop/purchase">Find a purchase</a> : <a className="site-nav-optional" href="/#demo">Demo</a>}
      <a className="site-account" href={link.href}>{link.label}</a>
    </div>
  </nav>
}

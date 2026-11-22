import { useSyncExternalStore } from 'react'
import type { ComponentPropsWithoutRef } from 'react'

const wideDesktop = '(min-width: 741px) and (hover: hover) and (pointer: fine)'

function subscribe(onChange: () => void) {
  const media = window.matchMedia(wideDesktop)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

export function PlannerExploreLink({ children, ...props }: ComponentPropsWithoutRef<'a'>) {
  const newTab = useSyncExternalStore(subscribe, () => window.matchMedia(wideDesktop).matches, () => false)
  return <a {...props} target={newTab ? '_blank' : undefined} rel={newTab ? 'noopener' : undefined}>
    {children}{newTab && <small> (opens in new tab)</small>}
  </a>
}


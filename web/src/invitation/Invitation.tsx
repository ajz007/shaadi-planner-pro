import { lazy, Suspense } from 'react'
import type { ComponentType, LazyExoticComponent } from 'react'
import { defaultTemplateId, optionsFor, templateFor } from './model'
import type { TemplateProps } from './types'

export type { InvitationPage } from './types'

// Every folder in ./templates with a Template.tsx is a design. Each one is
// its own code chunk, so a guest downloads only the design they were sent.
const modules = import.meta.glob<{ default: ComponentType<TemplateProps> }>('./templates/*/Template.tsx')
const loaded = new Map<string, LazyExoticComponent<ComponentType<TemplateProps>>>()

function component(id: string) {
  const load = modules['./templates/' + id + '/Template.tsx'] ?? modules['./templates/' + defaultTemplateId + '/Template.tsx']
  if (!loaded.has(id)) loaded.set(id, lazy(load))
  return loaded.get(id)!
}

export function Invitation(props: Omit<TemplateProps, 'manifest' | 'options'>) {
  const manifest = templateFor(props.invitation.template?.id)
  const Template = component(manifest.id)
  return <Suspense fallback={<p className="guest-wedding-page" role="status">Opening your invitation…</p>}>
    <Template {...props} manifest={manifest} options={optionsFor(manifest, props.invitation.template?.options)} />
    {!props.preview && <footer className="inv-brand-footer">
      <a href="/shop/wedding-pass?utm_source=wedding_invitation" referrerPolicy="no-referrer">Made with Shaadi Planner Pro</a>
    </footer>}
  </Suspense>
}

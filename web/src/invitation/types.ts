import type { ReactNode } from 'react'
import type { OptionValues, PublicInvitation, TemplateManifest } from './model'

export type InvitationPage = { name: string; date: string; timeZone: string; design: { heading: string; coverPhoto?: string } }

// What every template component receives. The loader resolves the manifest
// and fills option defaults, so templates read options directly.
export type TemplateProps = {
  page: InvitationPage
  invitation: PublicInvitation
  manifest: TemplateManifest
  options: OptionValues
  greeting?: string
  rsvp?: ReactNode
  loadMusic?: () => Promise<Blob>
  preview?: boolean
}

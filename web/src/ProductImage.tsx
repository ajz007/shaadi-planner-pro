import essentials from './assets/products/essentials.webp'
import complete from './assets/products/complete.webp'
import allInOne from './assets/products/all-in-one.webp'
import messages from './assets/products/message-pack.webp'
import core from './assets/products/sangeet-host-kit.webp'
import pro from './assets/products/sangeet-host-kit-pro.webp'
import dashboard from './assets/products/planner-dashboard.webp'

const images: Record<string, { src: string; alt: string; width: number; height: number }> = {
  essentials: {src: essentials, alt: 'Shaadi Planner Pro Essentials with the wedding dashboard, family responsibilities and guest list.', width:1440, height:810},
  complete: {src: complete, alt: 'Complete bundle with the wedding planner, Vendor Negotiation Kit and WhatsApp and RSVP Message Pack.', width:1440, height:810},
  'all-in-one': {src: allInOne, alt: 'All-in-One bundle with the planner, vendor tools, message pack and Sangeet Host Kit PRO.', width:1440, height:810},
  'message-pack': {src: messages, alt: '35 wedding message templates for RSVP, payments, pickups, vendors and family tasks.', width:1440, height:810},
  'sangeet-host-kit': {src: core, alt: 'Two Sangeet anchors holding microphones, with script, rescue lines and DJ cues in the ₹499 kit.', width:1122, height:1402},
  'sangeet-host-kit-pro': {src: pro, alt: 'Sangeet Host Kit PRO with solo anchor script, 12 games, event flow builder and rehearsal checklist for ₹899.', width:1122, height:1402},
  'gujarati-planner': {src: dashboard, alt: 'English planner dashboard shown as an example of the workbook layout.', width:1440, height:1080},
}

export function ProductImage({ slug, eager = false }: { slug: string; eager?: boolean }) {
  const image = images[slug]
  return <figure className={'product-image product-image-' + slug}>
    <img src={image.src} alt={image.alt} width={image.width} height={image.height}
      loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : undefined} decoding="async" />
    {slug === 'gujarati-planner' && <figcaption>English layout shown. This package contains the Gujarati edition.</figcaption>}
  </figure>
}

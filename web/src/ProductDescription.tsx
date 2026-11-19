import type { ShopProduct } from './Shop'

type Section = { title: string; paragraphs?: string[]; bullets?: string[] }
type Description = { lead: string; intro: string[]; sections: Section[]; steps: string[]; audience: string[]; notes: string[]; closing?: string }

const plannerFeatures = [
  'Wedding dashboard and priorities', 'Budget versus actual spending', 'Vendor details and pending payments',
  'Guests and RSVP follow-ups', 'Hotel rooms and accommodation', 'Airport and station pickups',
  'Family responsibilities and deadlines', 'Wedding-week timeline and run sheet', 'Outfits, jewellery and gifts', 'Emergency contacts',
]
const planner: Section = {
  title: 'Shaadi Planner Pro',
  paragraphs: [
    'A ready-to-use wedding planning workbook designed around how Indian families actually coordinate weddings.',
    'You receive a clean workbook and a pre-filled demo, along with a Quick Start Guide and 14-Day Final Wedding Checklist.',
  ],
  bullets: plannerFeatures,
}
const vendor: Section = {
  title: 'Wedding Vendor Negotiation Kit',
  paragraphs: [
    'Compare quotes clearly, identify hidden costs and negotiate before paying an advance.',
    'Use it for venues, caterers, decorators, photographers, makeup artists, hotels, transport providers and other wedding vendors.',
  ],
  bullets: ['Vendor comparison workbook', 'Blank and pre-filled demo versions', 'Wedding Vendor Negotiation Playbook',
    'Ready-to-use negotiation messages and scripts', 'Editable scripts', 'Before You Book a Vendor checklist'],
}
const messages: Section = {
  title: 'WhatsApp & RSVP Message Pack',
  paragraphs: ['Get 38 ready-to-copy messages for common wedding conversations. Replace the placeholders with your details, copy the message and send.'],
  bullets: ['RSVP requests and follow-ups', 'Hotel and room information', 'Airport and station pickup coordination',
    'Vendor confirmations and reminders', 'Payment follow-ups', 'Function and event updates', 'Family responsibilities', 'Last-minute changes'],
}
const coreFeatures = [
  'Complete Two-Anchor Hinglish Sangeet Script', 'Editable Word version', '63-page Sangeet Script Vault',
  'Performance introduction options', 'Funny & emotional lines', 'Transition and rescue lines', 'Emergency Rescue Card',
  'Editable DJ / Run-of-Show Cue Sheet', 'Quick Customization Guide',
]
const proFeatures = [
  'Complete Solo Anchor Sangeet Script', 'Games & Audience Interaction Pack', '12 ready-to-run Sangeet games',
  'Exact host lines and game prompts', 'Build-Your-Own Sangeet Flow Guide', 'Ready-made 60 / 90 / 120-minute event structures',
  'Performance-order planning system', 'Delay and contingency planning', 'Host Rehearsal & Event-Night Checklist',
]
const pro: Section = {
  title: 'Sangeet Host Kit PRO',
  paragraphs: [
    'A complete hosting toolkit for siblings, cousins, friends and family members who want to host a memorable Sangeet.',
    'Replace the names, choose the sections that fit your function and follow the prepared flow.',
  ],
  bullets: [...coreFeatures, ...proFeatures, 'Opening lines and performance introductions', 'Emotional family moments',
    'Rescue lines for delays and unexpected moments', 'Closing lines for ending the event confidently'],
}
const planningSteps = [
  'Download the bundle after purchase.',
  'Open the files in Microsoft Excel or upload them to Google Sheets.',
  'Replace the demo information with your wedding details.',
  'Share responsibilities and start tracking everything in one place.',
]
const familyAudience = [
  'Couples planning their own wedding', 'Parents coordinating budgets and vendors',
  'Siblings and cousins managing guests and logistics', 'Family members responsible for keeping everyone organised',
]
const planningNotes = ['One-time purchase', 'Instant digital download', 'Editable files', 'Works with Microsoft Excel and Google Sheets',
  'Includes blank and pre-filled examples', 'No subscription required', 'You control, edit and update the downloadable files yourself.']
const hostingIntro = [
  'Ready-made Hinglish anchoring scripts, performance introductions, funny and emotional lines, emergency fillers, DJ cues, and editable templates.',
  'Just replace the names, match the performance order, and you’re ready to host.',
  'Hosting the Sangeet yourself? A family Sangeet sounds easy until someone hands you the mic.',
  'The Sangeet Host Kit gives you a complete ready-to-use framework so you don’t have to write everything from scratch.',
]
const hostingChallenges: Section = {
  title: 'When someone hands you the mic',
  bullets: ['How to open the evening', 'What to say before every performance', 'How to introduce the bride and groom',
    'How to keep the audience engaged', 'What to say during awkward delays', 'How to handle emotional moments',
    'How to coordinate with the DJ', 'How to close the event without it feeling abrupt'],
}
const hostingSituations: Section = {
  title: 'What kind of lines are included?',
  bullets: [
    'Opening the Sangeet — welcoming both families and setting the tone.',
    'Introducing performances — parents, siblings, cousins, friends, bride-side, groom-side and couple performances.',
    'Fun transitions — keeping energy alive between performances.',
    'Emotional moments — parents, siblings, bride/groom and family tribute sections.',
    'Unexpected delays — performers not ready, DJ setup delays, costume changes and stage resets.',
    'Audience engagement — applause prompts and couple interactions, with games in PRO.',
    'Closing — ending the hosted segment naturally and moving into dinner, dance floor or the next ceremony.',
  ],
}
const hostingSteps = [
  'Download the kit. You receive the files immediately after purchase.',
  'Replace the placeholders. Change bride, groom, family and performer names in the editable Word file.',
  'Match your performance order. Keep the sections you need and remove the ones you don’t.',
  'Share the cue sheet. Give the final order to your DJ/coordinator.',
  'Host with confidence. Keep your final script, Rescue Card and Run-of-Show handy during the Sangeet.',
]
const hostingAudience = [
  'You’re anchoring your sibling’s Sangeet', 'You and a cousin or friend are hosting together',
  'The family wants to host the Sangeet themselves', 'You’ve never anchored before',
  'You’re comfortable speaking but don’t know what to say', 'You want a prepared script and flow to personalise',
]
const hostingNotes = [
  'One-time purchase', 'Instant digital download', 'Editable Word templates and print-ready PDFs',
  'No professional anchoring experience required',
  'You personalise the names, sequence and performances yourself. You arrange your own hosts and any personal script-writing support.',
]

const descriptions: Record<string, Description> = {
  essentials: {
    lead: 'Planning an Indian wedding means managing much more than a guest list.',
    intro: [
      'Shaadi Planner Pro brings your budget, guests, vendors, hotel rooms, transport, family responsibilities, outfits, gifts and wedding-week timeline together in one simple planning system.',
      'Instead of juggling WhatsApp groups, notebooks and different spreadsheets, you get one organised place to run the wedding.',
    ],
    sections: [{...planner, title: 'What you get'}, {
      title: 'Built specifically for Indian weddings',
      paragraphs: ['Responsibilities are shared across the family. Every important task can have one owner, one deadline and one status.'],
    }],
    steps: planningSteps, audience: familyAudience, notes: planningNotes,
  },
  complete: {
    lead: 'Planning an Indian wedding means managing much more than a guest list.',
    intro: [
      'There are budgets, vendor quotes, pending payments, RSVPs, hotel rooms, pickups, family responsibilities and hundreds of messages—all moving at the same time.',
      'Shaadi Planner Pro Complete brings the planning, vendor decisions and everyday communication together in one organised bundle.',
    ],
    sections: [planner, vendor, messages], steps: planningSteps, audience: familyAudience, notes: planningNotes,
    closing: 'Plan with clarity. Compare vendors confidently. Coordinate your family without the usual confusion.',
  },
  'all-in-one': {
    lead: 'Plan the wedding. Coordinate the family. Negotiate with vendors. Host the Sangeet with confidence.',
    intro: [
      'Shaadi Planner Pro All-in-One is the complete wedding planning and Sangeet hosting bundle for Indian families managing the celebration themselves.',
      'It combines the full Shaadi Planner Pro planning system, Vendor Negotiation Kit, WhatsApp and RSVP Message Pack, and Sangeet Host Kit Pro in one organised package.',
    ],
    sections: [planner, vendor, messages, pro, {
      title: 'Why choose All-in-One?',
      bullets: ['The complete wedding planning system', 'Better control over vendor quotes and payments',
        'Ready-to-send wedding communication templates', 'A complete Sangeet hosting toolkit', 'One organised bundle for planning through celebration'],
    }],
    steps: [...planningSteps, 'Customise the Sangeet scripts with your family names and performance order.',
      'Use the scripts, cue sheets and rescue tools during the event.'],
    audience: [...familyAudience, 'Families hosting the Sangeet themselves', 'First-time anchors who want a ready structure'],
    notes: [...planningNotes, 'No professional anchoring experience required'],
    closing: 'Plan with clarity. Negotiate confidently. Coordinate your family. Host a Sangeet everyone remembers.',
  },
  'message-pack': {
    lead: 'Less typing. More time for what matters.',
    intro: [
      'Planning a wedding means sending the same kinds of messages again and again — RSVP reminders, hotel confirmations, pickup details, vendor negotiations, payment confirmations and family task reminders.',
      'Shaadi WhatsApp & Vendor Message Pack gives you 35 ready-to-copy templates so you can communicate faster and more clearly.',
    ],
    sections: [{
      title: 'Inside the message pack',
      bullets: ['RSVP & guest follow-ups', 'Hotel & room confirmations', 'Airport & railway pickups', 'Family responsibility reminders',
        'Vendor quotation requests', 'Vendor negotiation messages', 'Advance & final payment confirmations',
        'Caterer, decorator, photographer and makeup confirmations', 'Wedding-day coordination', 'Emergency updates', 'Post-wedding thank-you messages'],
    }],
    steps: ['Download the PDF.', 'Copy the message you need.', 'Replace the placeholders with your details and send.'],
    audience: familyAudience, notes: ['One-time purchase', 'Instant PDF download', 'Copy, personalise and send the messages yourself'],
  },
  'sangeet-host-kit': {
    lead: 'Host your Sangeet like you’ve done it before.',
    intro: hostingIntro, sections: [hostingChallenges, {title: 'What you get', paragraphs: ['Best for families using two anchors.'], bullets: coreFeatures}, hostingSituations],
    steps: hostingSteps, audience: [...hostingAudience, 'Brother-sister hosts, cousin pairs, friends and bride/groom-side anchor combinations'],
    notes: hostingNotes,
  },
  'sangeet-host-kit-pro': {
    lead: 'Your complete Sangeet hosting system.',
    intro: [...hostingIntro, 'Choose PRO if there’s any chance you’ll host solo, include games, or plan the full Sangeet flow yourself.'],
    sections: [hostingChallenges, {title: 'Everything in the Core Kit', bullets: coreFeatures},
      {title: 'Plus the PRO tools', bullets: proFeatures}, hostingSituations],
    steps: hostingSteps, audience: [...hostingAudience, 'One person hosting the entire event', 'Families planning the full Sangeet flow themselves'],
    notes: hostingNotes,
  },
  'gujarati-planner': {
    lead: 'સંપૂર્ણ ભારતીય લગ્ન આયોજન સિસ્ટમ',
    intro: ['The Gujarati edition brings wedding planning workbooks and Gujarati guides together for your family.'],
    sections: [{title: 'What you get', bullets: ['Gujarati v1.3.1 blank and pre-filled demo workbooks', 'Gujarati Quick Start Guide',
      'Gujarati 14-Day Final Wedding Checklist', 'Readme and version changelog']},
    {title: 'Keep the family plan together', bullets: plannerFeatures}],
    steps: ['Download and unzip the package.', 'Read the Gujarati Quick Start Guide and explore the demo.',
      'Make a copy of the blank workbook and enter your wedding details.'],
    audience: familyAudience, notes: ['One-time purchase', 'Instant digital download', 'Open the workbooks in Microsoft Excel', 'Includes blank and pre-filled examples'],
  },
}

export const productDescription = (slug: string) => descriptions[slug]

const comparison = [
  ['Complete Two-Anchor Script', true], ['Editable Script', true], ['Script Vault', true],
  ['DJ / Run-of-Show Sheet', true], ['Emergency Rescue Card', true], ['Solo Anchor Script', false],
  ['Games & Audience Pack', false], ['60/90/120-Min Flow Planner', false], ['Rehearsal Checklist', false],
] as const

export function ProductDescription({ item }: { item: ShopProduct }) {
  const description = productDescription(item.slug)
  return <div className="product-description">
    {description.sections.map(section => <section key={section.title}>
      <h2>{section.title}</h2>
      {section.paragraphs?.map(text => <p key={text}>{text}</p>)}
      {section.bullets && <ul>{section.bullets.map(text => <li key={text}>{text}</li>)}</ul>}
    </section>)}
    {item.slug.startsWith('sangeet-host-kit') && <section>
      <h2>Core vs PRO</h2>
      <table className="hosting-comparison">
        <caption>Choose your Sangeet Host Kit</caption>
        <thead><tr><th scope="col">Feature</th><th scope="col"><a href="/shop/sangeet-host-kit">Core ₹499</a></th><th scope="col"><a href="/shop/sangeet-host-kit-pro">PRO ₹899</a></th></tr></thead>
        <tbody>{comparison.map(([name, inCore]) => <tr key={name}><th scope="row">{name}</th><td>{inCore ? 'Included' : '—'}</td><td>Included</td></tr>)}</tbody>
      </table>
    </section>}
    <section><h2>How it works</h2><ol>{description.steps.map(text => <li key={text}>{text}</li>)}</ol></section>
    <section><h2>Who is this for?</h2><ul>{description.audience.map(text => <li key={text}>{text}</li>)}</ul></section>
    <section><h2>Good to know</h2><ul>{description.notes.map(text => <li key={text}>{text}</li>)}</ul></section>
    {description.closing && <p className="product-closing">{description.closing}</p>}
    <a className="product-return" href="#purchase">Get {item.name} <span aria-hidden="true">↑</span></a>
  </div>
}

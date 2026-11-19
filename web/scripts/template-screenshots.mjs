// Screenshots an invitation template with fictional sample data, at phone and
// desktop sizes, through every stage: opening, then the page in sections.
//
//   npm run build && npx vite preview --port 4173 &
//   node scripts/template-screenshots.mjs <template-id> [palette-or-choice=value ...]
//
// Writes PNGs to web/screenshots/<template-id>/ (ignored by git). Set
// CHROME_PATH to use a specific Chromium; otherwise Playwright's own browser
// is used (install it with: npx playwright-core install chromium).
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const [id, ...pairs] = process.argv.slice(2)
if (!id) { console.error('usage: template-screenshots.mjs <template-id> [option=value ...]'); process.exit(2) }
const base = process.env.PREVIEW_URL ?? 'http://localhost:4173'
const options = Object.fromEntries(pairs.map(pair => pair.split('=')).map(([key, value]) =>
  [key, value === 'true' ? true : value === 'false' ? false : value]))
const out = new URL('../screenshots/' + id + '/', import.meta.url).pathname
mkdirSync(out, { recursive: true })

const ids = Array.from({ length: 6 }, (_, i) => `00000000-0000-4000-8000-00000000000${i + 1}`)
const event = (i, name, startsAt) => ({ id: ids[i], name, startsAt, durationMinutes: 150, place: 'Rosewood Gardens',
  address: '12 Lakeview Road, Udaipur, Rajasthan', mapUrl: 'https://www.google.com/maps/search/?api=1&query=Udaipur' })
const sample = {
  page: { name: 'Aarav & Meera', date: '2027-02-14', timeZone: 'Asia/Kolkata', design: { heading: '' } },
  musicPath: '/none',
  invitation: {
    template: { id, version: 1, options }, hasMusic: false,
    events: [event(0, 'Haldi', '2027-02-13T04:30:00Z'), event(1, 'Mehendi', '2027-02-13T10:30:00Z'), event(2, 'Sangeet', '2027-02-13T14:30:00Z'),
      event(3, 'Baraat', '2027-02-14T12:30:00Z'), event(4, 'Pheras', '2027-02-14T16:00:00Z'), event(5, 'Reception', '2027-02-15T14:00:00Z')],
    content: {
      brideFirst: false, symbols: ['shri', 'om', 'kalash'], invocation: '॥ श्री गणेशाय नमः ॥',
      shloka: 'वक्रतुण्ड महाकाय सूर्यकोटि समप्रभ।\nनिर्विघ्नं कुरु मे देव सर्वकार्येषु सर्वदा॥',
      blessingIntro: 'By the grace of our Kuldevi', deity: 'Amba Mata', eldersIntro: 'and with the blessings of',
      elders: 'Shri Mohan Sharma & Smt. Kamla Sharma', eldersNote: '(Dadaji and Dadiji)',
      intro: 'We request the pleasure of your company at the wedding of', title: 'Shubh Vivah',
      groom: { honorific: 'Chi.', name: 'Aarav Sharma', shortName: 'Aarav', parentLabel: 'Son of', parents: 'Shri Rajesh Sharma & Smt. Sunita Sharma' },
      bride: { honorific: 'Chi. Sau. Ka.', name: 'Meera Iyer', shortName: 'Meera', parentLabel: 'Daughter of', parents: 'Shri Venkat Iyer & Smt. Lakshmi Iyer' },
      events: { [ids[4]]: { icon: '', subtitle: 'followed by dinner', timeLabel: 'Shubh muhurat, 9:30 PM' }, [ids[5]]: { icon: '', subtitle: 'Dinner and dancing', timeLabel: '' } },
      families: [{ heading: 'The Groom’s Family', cards: [
        { title: 'In loving memory', lines: [{ relation: 'Nanaji and Naniji', names: 'Late Shri Prakash Joshi & Late Smt. Usha Joshi' }] },
        { title: 'Eager to welcome you', lines: [{ relation: 'Mamaji and Mamiji', names: 'Shri Arun Verma & Smt. Neha Verma' },
          { relation: 'Chachaji and Chachiji', names: 'Shri Vikram Sharma & Smt. Pooja Sharma\nShri Nikhil Sharma & Smt. Ritu Sharma' }] }] }],
      dressCode: 'Festive Indian wear. Pastels for the Haldi.', rsvpBy: '2027-01-10',
      contacts: [{ name: 'Rohan Sharma', role: 'Brother of the groom', phone: '+91 00000 00011' }, { name: 'Priya Iyer', role: 'Sister of the bride', phone: '+91 00000 00022' }],
      closing: 'Your presence will be our blessing', regardsIntro: 'With love and regards', hosts: 'Shri Rajesh & Smt. Sunita Sharma',
    },
  },
}

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
const problems = []
for (const [label, width, height] of [['phone', 390, 844], ['desktop', 1440, 900]]) {
  const page = await browser.newPage({ viewport: { width, height } })
  page.on('pageerror', error => problems.push(label + ': ' + error.message))
  page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) problems.push(label + ': ' + message.text()) })
  page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) problems.push(`${label}: ${response.status()} ${response.url()}`) })
  await page.addInitScript(data => localStorage.setItem('shaadi-invitation-preview', data), JSON.stringify(sample))
  await page.goto(base + '/invitation-preview', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${out}${label}-0-opening.png` })
  // Templates mark the element guests tap with data-open; the page continues on any later tap.
  const opener = page.locator('[data-open]').first()
  if (await opener.count()) {
    await opener.click({ force: true })
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${out}${label}-1-opening-midway.png` })
    await page.waitForTimeout(2000)
    await page.screenshot({ path: `${out}${label}-2-opened.png` })
    await page.mouse.click(8, 8)
    await page.waitForTimeout(1600)
  } else problems.push(label + ': no element with data-open, so the opening could not be tested')
  const total = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < total; y += 300) { await page.evaluate(v => window.scrollTo(0, v), y); await page.waitForTimeout(90) }
  await page.waitForTimeout(900)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (overflow > 1) problems.push(`${label}: page scrolls sideways by ${overflow}px`)
  for (let y = 0, k = 0; y < total; y += height - 80, k++) {
    await page.evaluate(v => window.scrollTo(0, v), y)
    await page.waitForTimeout(350)
    await page.screenshot({ path: `${out}${label}-page-${String(k).padStart(2, '0')}.png` })
  }
  await page.close()
}
await browser.close()
console.log('Screenshots in', out)
if (problems.length) { console.log('Problems:\n- ' + problems.join('\n- ')); process.exitCode = 1 }

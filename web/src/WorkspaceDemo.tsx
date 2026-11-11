import { WeddingWorkspace } from './Workspace'
import type { Plan, WeddingLayout } from './Workspace'
import { WorkspacePreview } from './WorkspaceData'
import type { Guest } from './WorkspaceGuests'
import type { ImportTotals } from './WorkspaceImport'
import type { Planning } from './WorkspacePlanning'
import workbook from './workbook-demo.json'

const weddingId = 'sample-wedding'
const prefix = '/api/workspace/weddings/' + weddingId + '/'
const sections = workbook.tables.map(table => ({
  name: table.name,
  columns: table.columns,
  rows: table.rows.map((row, index) => ({
    number: index + 2,
    values: row.map((value, column) => /phone|mobile number|vehicle no\./i.test(table.columns[column] ?? '') ? '' : value),
  })),
}))
const rows = (name: string) => sections.find(section => section.name === name)!.rows.map(row => row.values)
const settings = Object.fromEntries(rows('Settings'))
const taskRows = rows('Family Responsibilities')
const functionRows = rows('Functions & Events')
const people = [...new Set(['Sample organizer', ...taskRows.map(row => row[2]), ...functionRows.map(row => row[7])].filter(Boolean))]
  .map((name, index) => ({ name, id: 'person-' + index }))
const personId = (name: string) => people.find(person => person.name === name)?.id ?? ''
const paise = (value: string) => Math.round(Number(value || 0) * 100)

const places = [...new Set(functionRows.map(row => row[4]).filter(Boolean))].map((name, index) =>
  ({ id: 'place-' + index, name, address: '', mapUrl: '', instructions: 'Sample venue in Varanasi', revision: 1 }))
const planning: Planning = {
  places,
  functions: functionRows.map(([id, name, date, time, venue]) => ({
    id, name, startsAt: date + 'T' + time + ':00+05:30', venue: '',
    placeId: places.find(place => place.name === venue)?.id ?? '',
    duration: null, people: null, items: [], revision: 1,
  })),
}

const plan: Plan = {
  wedding: { id: weddingId, name: settings['Wedding Name'], date: settings['Wedding Date'],
    timeZone: 'Asia/Kolkata', role: 'owner', personId: people[0].id },
  people,
  functions: planning.functions.map(event => ({ ...event, venue: places.find(place => place.id === event.placeId)?.name ?? '' })),
  tasks: taskRows.map(([title, , owner, , due, status], index) => ({
    id: 'task-' + index, title, assignee: personId(owner) || null, due: due || null,
    function: null, claimable: false, done: status === 'Done', revision: 1,
  })),
}

const guests: Guest[] = rows('Guest List').map(row => ({
  id: row[0], workbookId: row[0], name: row[1], household: row[2], side: row[3], rsvp: row[7],
  stayRequired: row[9], transportRequired: row[10], arrivalDate: row[11], arrivalTime: row[12], arrivalMode: row[13],
  revision: 1, links: [],
}))

const guestFor = (selector = '') => guests.find(guest => selector.startsWith(guest.workbookId + ' | '))
const roomRows = rows('Accommodation')
const followUpRows = rows('RSVP Follow-up')
const logisticsRows = (values: string[][], guestColumns: number[]) => values.map((row, index) => ({
  id: 'logistics-' + index, revision: 1, values: row, placeId: '',
  guestLinks: Object.fromEntries(guestColumns.flatMap(column => {
    const guest = guestFor(row[column])
    return guest ? [[column, guest.workbookId]] : []
  })),
}))
const pickups = rows('Transportation').map((row, index) => ({
  id: 'pickup-' + index, revision: 1, date: row[0], time: row[1], pickupPoint: row[2], dropPoint: row[3],
  vehicle: row[11], vehicleNumber: '', driver: row[13], ownerId: personId(row[14]), owner: row[14],
  status: row[15], driverConfirmed: row[16], notes: row[17], needsReview: false,
  pickupPlaceId: '', dropPlaceId: '', pickupDetail: '', dropDetail: '',
  passengers: row.slice(4, 8).flatMap(selector => {
    const guest = guestFor(selector)
    if (!guest) return []
    const arrival = { date: guest.arrivalDate, time: guest.arrivalTime, mode: guest.arrivalMode, transport: guest.transportRequired }
    return [{ id: guest.id, name: guest.name, arrival, reviewed: arrival }]
  }),
}))
for (const guest of guests) {
  guest.links = [
    ...roomRows.filter(row => row.slice(3, 7).some(value => guestFor(value) === guest))
      .map(row => ({ section: 'Accommodation', label: row[0] + ' · Room ' + row[1], detail: row[10] + ' – ' + row[11] })),
    ...followUpRows.filter(row => guestFor(row[0]) === guest)
      .map(row => ({ section: 'RSVP Follow-up', label: row[7], detail: row[4] })),
    ...pickups.filter(pickup => pickup.passengers.some(passenger => passenger.id === guest.id))
      .map(pickup => ({ section: 'Transportation', label: pickup.pickupPoint + ' → ' + pickup.dropPoint, detail: pickup.date + ' · ' + pickup.time })),
  ]
}

const vendors = rows('Vendor Comparison').map((values, index) => ({ id: 'vendor-' + index, revision: 1, values }))
const contracts = rows('Vendor Payments').map((values, index) => ({
  id: 'contract-' + index, revision: 1, values,
  vendorId: vendors.find(vendor => vendor.values[0] === values[0] && vendor.values[1] === values[1])?.id ?? '',
  value: paise(values[3]), openingPaid: paise(values[4]), paid: paise(values[4]), payments: [],
}))
const totals: ImportTotals = {
  guests: guests.length, confirmed: guests.filter(guest => guest.rsvp === 'Confirmed').length, rooms: roomRows.length,
  plannedPaise: rows('Budget vs Actual').reduce((sum, row) => sum + paise(row[1]), 0),
  paidPaise: rows('Budget vs Actual').reduce((sum, row) => sum + paise(row[2]), 0),
  vendorDuePaise: contracts.reduce((sum, contract) => sum + contract.value - contract.paid, 0),
}
const records = new Map<string, unknown>([
  ['guests', guests], ['planning', planning], ['transportation', pickups],
  ['logistics/accommodation', logisticsRows(roomRows, [3, 4, 5, 6])],
  ['logistics/rsvp-follow-up', logisticsRows(followUpRows, [0])],
  ['imported-sections', { sections, totals }], ['finance', { vendors, contracts }],
])

async function sampleFetch(url: string, options?: RequestInit) {
  options?.signal?.throwIfAborted()
  if (options?.method && options.method !== 'GET') {
    return Response.json({ error: 'Open your own wedding to save changes.' }, { status: 403 })
  }
  const data = url.startsWith(prefix) ? records.get(url.slice(prefix.length)) : undefined
  return data === undefined ? Response.json({ error: 'This record is unavailable in the sample wedding.' }, { status: 404 })
    : Response.json(data)
}

export function WorkspaceDemo({ section, layout, guestSearch, awaitingReply }: {
  section?: string; layout?: WeddingLayout; guestSearch: string; awaitingReply: boolean
}) {
  return <WorkspacePreview.Provider value={sampleFetch}>
    <WeddingWorkspace plan={plan} refresh={async () => undefined} section={section} layout={layout}
      guestSearch={guestSearch} awaitingReply={awaitingReply} />
  </WorkspacePreview.Provider>
}

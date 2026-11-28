// Compositions the render worker uses for real weddings: they take the
// planner's snapshot and map it to video props.
import { InviteVideo } from './InviteVideo'
import { SaveTheDate } from './SaveTheDate'
import { fromSnapshot } from './snapshot'
import type { PlannerSnapshot } from './snapshot'

export const PlannerSaveTheDate = (snapshot: PlannerSnapshot) => <SaveTheDate {...fromSnapshot(snapshot)} />
export const PlannerInvite = (snapshot: PlannerSnapshot) => <InviteVideo {...fromSnapshot(snapshot)} />

// A fictional wedding so the planner compositions preview in the studio.
export const sampleSnapshot: PlannerSnapshot = {
  weddingName: 'Aarav & Meera', weddingDate: '2027-02-14', timeZone: 'Asia/Kolkata',
  templateId: 'blush-envelope', templateOptions: { palette: 'rose-gold' }, language: 'english',
  content: {
    groom: { honorific: 'Chi.', name: 'Aarav Sharma', shortName: '', parentLabel: '', parents: '' },
    bride: { honorific: 'Sau. Ka.', name: 'Meera Iyer', shortName: '', parentLabel: '', parents: '' },
    brideFirst: false, symbols: ['shri'], invocation: '|| Shri Ganeshaya Namah ||', shloka: '', blessingIntro: '', deity: '',
    eldersIntro: '', elders: '', eldersNote: '', intro: 'With the blessings of our elders, we invite you to celebrate the wedding of',
    title: '', events: {}, families: [], dressCode: '', rsvpBy: '2027-02-01', contacts: [], closing: '', regardsIntro: '',
    hosts: 'Rajesh & Sunita Sharma',
  },
  events: [
    { id: 'a', name: 'Haldi', startsAt: '2027-02-12T04:30:00Z', place: 'Lake Pichola Lawns', address: '', mapUrl: '' },
    { id: 'b', name: 'Sangeet', startsAt: '2027-02-13T13:30:00Z', place: 'The Courtyard, Leela Palace', address: '', mapUrl: '' },
    { id: 'c', name: 'Wedding Pheras', startsAt: '2027-02-14T15:00:00Z', place: 'Jag Mandir, Udaipur', address: '', mapUrl: '' },
  ],
}

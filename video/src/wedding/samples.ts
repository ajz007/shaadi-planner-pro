// Fictional sample weddings, one per script we must render correctly.
import { labels } from './labels'
import type { WeddingVideoProps } from './types'

const english: WeddingVideoProps = {
  bride: 'Meera', groom: 'Aarav', brideFirst: false, date: '2027-02-14', city: 'Udaipur',
  symbol: 'shri', invocation: '|| Shri Ganeshaya Namah ||',
  intro: 'With the blessings of our elders, we invite you to celebrate the wedding of',
  events: [
    { name: 'Haldi', icon: 'haldi', when: 'Fri, 12 Feb · 10:00 AM', venue: 'Lake Pichola Lawns' },
    { name: 'Sangeet', icon: 'sangeet', when: 'Sat, 13 Feb · 7:00 PM', venue: 'The Courtyard, Leela Palace' },
    { name: 'Pheras', icon: 'pheras', when: 'Sun, 14 Feb · 8:30 PM', venue: 'Jag Mandir Island' },
  ],
  hosts: 'Rajesh & Sunita Sharma', rsvpUrl: 'https://shaadiplannerpro.com/rsvp#sample', rsvpBy: '1 February',
  palette: 'rose-gold', locale: 'en-IN', labels: labels.english, watermark: true,
}

export const samples: Record<string, WeddingVideoProps> = {
  english,
  hindi: {
    ...english, bride: 'मीरा', groom: 'आरव', city: 'उदयपुर', invocation: '॥ श्री गणेशाय नमः ॥',
    intro: 'बड़ों के आशीर्वाद से, आप सादर आमंत्रित हैं',
    events: [
      { name: 'हल्दी', icon: 'haldi', when: 'शुक्र, 12 फ़र॰ · सुबह 10:00', venue: 'पिछोला झील लॉन' },
      { name: 'संगीत', icon: 'sangeet', when: 'शनि, 13 फ़र॰ · शाम 7:00', venue: 'लीला पैलेस आँगन' },
      { name: 'फेरे', icon: 'pheras', when: 'रवि, 14 फ़र॰ · रात 8:30', venue: 'जग मंदिर द्वीप' },
    ],
    hosts: 'राजेश एवं सुनीता शर्मा', rsvpBy: '1 फ़रवरी', palette: 'marigold', locale: 'hi-IN', labels: labels.hindi,
  },
  tamil: {
    ...english, bride: 'மீரா', groom: 'ஆரவ்', city: 'மதுரை', symbol: 'om', invocation: 'ஸ்ரீ கணேசாய நமஹ',
    intro: 'பெரியோர்களின் ஆசியுடன் உங்களை அன்புடன் அழைக்கிறோம்',
    events: [
      { name: 'நிச்சயதார்த்தம்', icon: 'rings', when: 'சனி, 13 பிப் · மாலை 6:00', venue: 'மீனாட்சி மண்டபம்' },
      { name: 'முகூர்த்தம்', icon: 'kalash', when: 'ஞாயிறு, 14 பிப் · காலை 9:00', venue: 'கோவில் மண்டபம்' },
    ],
    hosts: 'ராஜேஷ் & சுனிதா', rsvpBy: '1 பிப்ரவரி', palette: 'royal', locale: 'ta-IN', labels: labels.tamil,
  },
  telugu: {
    ...english, bride: 'మీరా', groom: 'ఆరవ్', city: 'హైదరాబాద్', symbol: 'kalash', invocation: 'శ్రీ గణేశాయ నమః',
    intro: 'పెద్దల ఆశీస్సులతో మిమ్మల్ని సాదరంగా ఆహ్వానిస్తున్నాము',
    events: [
      { name: 'పెళ్లికూతురు', icon: 'haldi', when: 'శని, 13 ఫిబ్ · ఉదయం 10:00', venue: 'గోల్కొండ గార్డెన్స్' },
      { name: 'కళ్యాణం', icon: 'pheras', when: 'ఆది, 14 ఫిబ్ · రాత్రి 8:30', venue: 'తాజ్ ఫలక్‌నుమా' },
    ],
    hosts: 'రాజేష్ & సునీత', rsvpBy: '1 ఫిబ్రవరి', palette: 'rose-gold', locale: 'te-IN', labels: labels.telugu,
  },
}

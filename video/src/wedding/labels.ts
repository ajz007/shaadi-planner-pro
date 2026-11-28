import type { VideoLabels } from './types'

// Translations are first drafts and need a native speaker's review before
// families see them.
export const labels: Record<'english' | 'hindi' | 'tamil' | 'telugu', VideoLabels> = {
  english: {
    saveTheDate: ['Save', 'the Date'], toFollow: 'Invitation to follow', celebrations: 'Celebrations',
    blessings: 'With love and blessings', request: 'request the pleasure of your company', rsvpTitle: 'Kindly RSVP',
    scan: 'Scan, or open the link we sent you', replyBy: 'Please reply by',
    replyNote: 'Please reply using the link we sent you',
  },
  hindi: {
    saveTheDate: ['तारीख़', 'याद रखें'], toFollow: 'निमंत्रण शीघ्र', celebrations: 'मांगलिक कार्यक्रम',
    blessings: 'स्नेह एवं आशीर्वाद सहित', request: 'आपकी गरिमामयी उपस्थिति प्रार्थनीय है', rsvpTitle: 'कृपया पुष्टि करें',
    scan: 'स्कैन करें या भेजा गया लिंक खोलें', replyBy: 'उत्तर की अंतिम तिथि:',
    replyNote: 'कृपया हमारे भेजे गए लिंक से उत्तर दें',
  },
  tamil: {
    saveTheDate: ['தேதியை', 'நினைவில் கொள்க'], toFollow: 'அழைப்பிதழ் விரைவில்', celebrations: 'நிகழ்ச்சிகள்',
    blessings: 'அன்புடனும் ஆசியுடனும்', request: 'தங்கள் வருகையை அன்புடன் எதிர்பார்க்கிறோம்', rsvpTitle: 'வருகையை உறுதிசெய்க',
    scan: 'ஸ்கேன் செய்யவும் அல்லது அனுப்பிய இணைப்பைத் திறக்கவும்', replyBy: 'பதில் அளிக்க கடைசி நாள்:',
    replyNote: 'நாங்கள் அனுப்பிய இணைப்பின் மூலம் பதில் அளிக்கவும்',
  },
  telugu: {
    saveTheDate: ['తేదీని', 'గుర్తుంచుకోండి'], toFollow: 'ఆహ్వాన పత్రిక త్వరలో', celebrations: 'వేడుకలు',
    blessings: 'ప్రేమ మరియు ఆశీస్సులతో', request: 'మీ రాకను సాదరంగా ఆహ్వానిస్తున్నాము', rsvpTitle: 'దయచేసి తెలియజేయండి',
    scan: 'స్కాన్ చేయండి లేదా పంపిన లింక్ తెరవండి', replyBy: 'ప్రత్యుత్తరం గడువు:',
    replyNote: 'మేము పంపిన లింక్ ద్వారా స్పందించండి',
  },
}

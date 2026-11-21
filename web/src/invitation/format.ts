// Date, time and text helpers shared by every invitation template. Times are
// always shown in the wedding's time zone, never the guest's.
export const dayKey = (iso: string, zone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
export const dayLabel = (iso: string, zone: string) => new Intl.DateTimeFormat('en-IN', { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))
export const timeLabel = (iso: string, zone: string) => new Intl.DateTimeFormat('en-IN', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso)).toUpperCase()
export const longDate = (date: string) => new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(date + 'T00:00:00Z'))
export const lines = (text: string) => text.split('\n').map(line => line.trim()).filter(Boolean)


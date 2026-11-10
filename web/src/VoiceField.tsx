import { useEffect, useRef, useState } from 'react'

type SpeechSession = {
  lang: string
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

const speech = window as Window & {
  SpeechRecognition?: new () => SpeechSession
  webkitSpeechRecognition?: new () => SpeechSession
}
const SpeechRecognition = speech.SpeechRecognition ?? speech.webkitSpeechRecognition
let activeSpeech: SpeechSession | undefined

export function VoiceField({ label, name, defaultValue = '', value, onValueChange, maxLength = 500, required, multiline, search, list }: {
  label: string; name?: string; defaultValue?: string; value?: string; onValueChange?: (value: string) => void
  maxLength?: number; required?: boolean; multiline?: boolean; search?: boolean; list?: string
}) {
  const field = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const active = useRef<SpeechSession | undefined>(undefined)
  const [listening, setListening] = useState(false)
  const [feedback, setFeedback] = useState('')
  useEffect(() => () => {
    const session = active.current
    if (!session) return
    if (activeSpeech === session) activeSpeech = undefined
    session.onresult = session.onerror = session.onend = null
    session.abort()
  }, [])

  function dictate() {
    if (active.current) {
      active.current.stop()
      return
    }
    if (!SpeechRecognition) return
    activeSpeech?.abort()
    const session = new SpeechRecognition()
    activeSpeech = session
    active.current = session
    session.lang = 'en-IN'
    session.onresult = event => {
      const input = field.current
      const text = event.results[0]?.[0]?.transcript.trim()
      if (!input || !text) return
      const updated = [input.value.trimEnd(), text].filter(Boolean).join(' ').slice(0, maxLength)
      if (onValueChange) onValueChange(updated)
      else input.value = updated
      setFeedback('Dictation added. Review the text before saving.')
    }
    session.onerror = () => setFeedback('The microphone couldn’t transcribe. You can type or use device dictation.')
    session.onend = () => {
      if (activeSpeech === session) activeSpeech = undefined
      active.current = undefined
      setListening(false)
    }
    try {
      session.start()
      setListening(true)
      setFeedback('Listening…')
    } catch {
      if (activeSpeech === session) activeSpeech = undefined
      active.current = undefined
      setFeedback('The microphone couldn’t start. You can type or use device dictation.')
    }
  }

  const inputProps = { name, maxLength, required, ...(value === undefined ? { defaultValue } : {
    value, onChange: (event: { target: { value: string } }) => onValueChange?.(event.target.value),
  }) }
  return <div className="voice-field">
    <label className="focus-field">{label}
      {multiline ? <textarea {...inputProps} ref={element => { field.current = element }} rows={2} />
        : <input {...inputProps} type={search ? 'search' : 'text'} list={list} ref={element => { field.current = element }} />}
    </label>
    {SpeechRecognition && <button type="button" className="focus-secondary" aria-label={(listening ? 'Stop dictating ' : 'Dictate ') + label}
      title="Your browser may use an online service to transcribe microphone input."
      onClick={dictate}>{listening ? 'Stop' : 'Mic'}</button>}
    {feedback && <small role="status">{feedback}</small>}
  </div>
}

export function VoiceNotice() {
  return SpeechRecognition ? <p className="focus-note">Your browser may use an online service to transcribe microphone input. You can type instead.</p> : null
}

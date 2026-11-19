import { useCallback, useEffect, useRef, useState } from 'react'

// Background music shared by every template. Music is fetched as soon as the
// page loads, starts only after the guest has tapped (browsers block sound
// before a tap), fades in, and remembers when a guest turns it off.
export function useMusic(loadMusic: (() => Promise<Blob>) | undefined, enabled: boolean) {
  const audio = useRef<HTMLAudioElement | null>(null)
  const blob = useRef<Promise<Blob> | null>(null)
  const [playing, setPlaying] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const wanted = useRef(true)
  try { if (localStorage.getItem('shaadi-invite-music') === 'off') wanted.current = false } catch { /* storage unavailable */ }

  useEffect(() => {
    if (!enabled || !loadMusic) return
    blob.current = loadMusic()
    blob.current.catch(() => undefined)
    return () => {
      audio.current?.pause()
      if (audio.current?.src) URL.revokeObjectURL(audio.current.src)
    }
  }, [enabled, loadMusic])

  const fadeIn = (element: HTMLAudioElement) => {
    element.volume = 0
    const start = performance.now()
    const step = () => {
      const k = Math.min(1, (performance.now() - start) / 1800)
      element.volume = k * 0.8
      if (k < 1 && !element.paused) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }
  const play = useCallback(async () => {
    if (!blob.current) return
    try {
      if (!audio.current) {
        const element = new Audio(URL.createObjectURL(await blob.current))
        element.loop = true
        audio.current = element
      }
      await audio.current.play()
      fadeIn(audio.current)
      setPlaying(true)
      setBlocked(false)
    } catch { setPlaying(false); setBlocked(true) }
  }, [])
  const start = useCallback(() => { if (wanted.current) void play() }, [play])
  const toggle = useCallback(() => {
    const on = !playing
    wanted.current = on
    try { localStorage.setItem('shaadi-invite-music', on ? 'on' : 'off') } catch { /* storage unavailable */ }
    if (on) void play()
    else { audio.current?.pause(); setPlaying(false); setBlocked(false) }
  }, [playing, play])
  return { available: enabled && !!loadMusic, playing, blocked, start, toggle }
}


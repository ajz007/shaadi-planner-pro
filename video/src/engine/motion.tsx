// Generic, frame-driven building blocks. Nothing here knows about weddings,
// so the same pieces can drive other products (for example ad reels).
// Every value is a pure function of the frame number: renders are
// deterministic and any frame can be rendered on its own.
import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, Easing, Img, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

// 0 → 1 with a gentle spring, starting at `delay` frames.
export function useEnter(delay = 0, damping = 18) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return spring({ frame: frame - delay, fps, config: { damping, mass: 0.8 } })
}

// 1 → 0 over the last `length` frames of the enclosing sequence.
export function useExit(length = 12) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  return interpolate(frame, [durationInFrames - length, durationInFrames], [1, 0], clamp)
}

// Fades and lifts its children in. Optionally fades them out at the end of
// the enclosing sequence.
export function Rise({ delay = 0, distance = 40, exit = 0, style, children }: {
  delay?: number; distance?: number; exit?: number; style?: CSSProperties; children: ReactNode
}) {
  const enter = useEnter(delay)
  const leave = useExit(exit || 1)
  const opacity = Math.min(enter, exit ? leave : 1)
  return <div style={{ ...style, opacity, transform: `translateY(${(1 - enter) * distance}px)` }}>{children}</div>
}

// Reveals text letter by letter, spaced over `stagger` frames per letter.
// Splits by grapheme so Indic conjuncts are never broken apart.
export function LetterReveal({ text, delay = 0, stagger = 2, style }: { text: string; delay?: number; stagger?: number; style?: CSSProperties }) {
  const frame = useCurrentFrame()
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(part => part.segment)
  return <span style={style} aria-label={text}>{graphemes.map((letter, i) => {
    const t = interpolate(frame - delay - i * stagger, [0, 14], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) })
    return <span key={i} style={{ display: 'inline-block', whiteSpace: 'pre', opacity: t, transform: `translateY(${(1 - t) * 0.35}em)` }}>{letter}</span>
  })}</span>
}

// A still photo with slow zoom and drift across the whole sequence.
export function KenBurns({ src, zoom = [1.04, 1.16], drift = [0, -3], style }: {
  src: string; zoom?: [number, number]; drift?: [number, number]; style?: CSSProperties
}) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const t = interpolate(frame, [0, durationInFrames], [0, 1], { ...clamp, easing: Easing.inOut(Easing.sin) })
  const scale = zoom[0] + (zoom[1] - zoom[0]) * t
  return <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover', ...style,
    transform: `scale(${scale}) translate(${drift[0] * t}%, ${drift[1] * t}%)` }} />
}

// Falling petals or confetti. Seeded, so every render is identical.
export function Petals({ count = 28, seed = 'petals', colors, speed = 1, size = [18, 34] }: {
  count?: number; seed?: string; colors: string[]; speed?: number; size?: [number, number]
}) {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()
  return <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
    {Array.from({ length: count }, (_, i) => {
      const r = (key: string) => random(`${seed}-${i}-${key}`)
      const s = size[0] + (size[1] - size[0]) * r('size')
      const fall = (2.2 + r('speed') * 2.6) * speed
      const travel = height + s * 4
      const y = ((r('start') * travel + frame * fall) % travel) - s * 2
      const x = r('x') * width + Math.sin((frame + r('phase') * 200) / (28 + r('sway') * 30)) * (30 + r('amp') * 50)
      const spin = r('spin') * 360 + frame * (r('dir') > 0.5 ? 1.4 : -1.4)
      return <svg key={i} viewBox="-10 -14 20 28" width={s} height={s * 1.4} style={{ position: 'absolute', left: x, top: y,
        transform: `rotate(${spin}deg)`, opacity: 0.55 + r('alpha') * 0.4 }}>
        <path d="M0 -13C8 -6 8 6 0 13C-8 6 -8 -6 0 -13Z" fill={colors[i % colors.length]} />
      </svg>
    })}
  </AbsoluteFill>
}

// A soft diagonal band of light that sweeps across once.
export function LightSweep({ delay = 0, duration = 40, color = 'rgba(255,240,200,.55)' }: { delay?: number; duration?: number; color?: string }) {
  const frame = useCurrentFrame()
  const x = interpolate(frame - delay, [0, duration], [-60, 160], clamp)
  if (frame < delay || frame > delay + duration) return null
  return <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'screen',
    background: `linear-gradient(115deg, transparent ${x - 20}%, ${color} ${x}%, transparent ${x + 20}%)` }} />
}

// Cross-fades a whole scene in and out at its edges.
export function Scene({ fadeIn = 10, fadeOut = 10, children, style }: { fadeIn?: number; fadeOut?: number; children: ReactNode; style?: CSSProperties }) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const opacity = Math.min(
    fadeIn ? interpolate(frame, [0, fadeIn], [0, 1], clamp) : 1,
    fadeOut ? interpolate(frame, [durationInFrames - fadeOut, durationInFrames], [1, 0], clamp) : 1)
  return <AbsoluteFill style={{ ...style, opacity }}>{children}</AbsoluteFill>
}

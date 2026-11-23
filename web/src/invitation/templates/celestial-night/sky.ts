// The night sky behind Celestial Night: a slow-drifting starfield with depth
// (near stars move more as the guest scrolls) and shooting stars on demand.
// Fewer stars on phones, paused while the tab is hidden, and drawn once,
// still, under reduced motion.
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

const still = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const phone = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 700px), (pointer: coarse)').matches
const rand = (min: number, max: number) => min + Math.random() * (max - min)

type Meteor = { x: number; y: number; vx: number; vy: number; age: number; life: number; delay: number }
export type Sky = { shoot: (x: number, y: number, count?: number) => void }

export function useSky(canvas: RefObject<HTMLCanvasElement | null>, palette: string) {
  const sky = useRef<Sky>({ shoot: () => undefined })
  useEffect(() => {
    const element = canvas.current
    const context = element?.getContext('2d')
    if (!element || !context) return
    const style = getComputedStyle(element)
    const tint = style.getPropertyValue('--cn-star-tint').trim() || '#cfd9ff'
    const white = style.getPropertyValue('--cn-star').trim() || '#ffffff'
    const reduced = still(), small = phone()
    let width = 0, height = 0, frame = 0, last = 0, clock = 0
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      element.width = Math.round(width * ratio)
      element.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    resize()
    const count = Math.round((small ? 120 : 230) * Math.min(1.4, Math.max(.7, width * height / (1280 * 800))))
    const stars = Array.from({ length: count }, () => {
      const depth = Math.pow(Math.random(), 1.8)
      return { x: Math.random(), y: Math.random(), depth, r: .35 + depth * 1.25, alpha: .35 + depth * .6,
        phase: rand(0, Math.PI * 2), speed: rand(.6, 2.2), tinted: Math.random() < .35 }
    })
    let meteors: Meteor[] = []

    const draw = () => {
      context.clearRect(0, 0, width, height)
      const scroll = window.scrollY
      for (const star of stars) {
        const x = ((star.x * width + clock * 3 * star.depth) % width + width) % width
        const y = ((star.y * height * 1.6 - scroll * star.depth * .08) % height + height) % height
        const twinkle = reduced ? 1 : .62 + .38 * Math.sin(clock * star.speed + star.phase)
        context.globalAlpha = star.alpha * twinkle
        context.fillStyle = star.tinted ? tint : white
        context.beginPath()
        context.arc(x, y, star.r, 0, Math.PI * 2)
        context.fill()
        if (star.depth > .86) {
          context.globalAlpha = star.alpha * twinkle * .5
          context.fillRect(x - star.r * 4, y - .3, star.r * 8, .6)
          context.fillRect(x - .3, y - star.r * 4, .6, star.r * 8)
        }
      }
      for (const meteor of meteors) {
        if (meteor.age < meteor.delay) continue
        const t = (meteor.age - meteor.delay) / meteor.life
        const x = meteor.x + meteor.vx * (meteor.age - meteor.delay), y = meteor.y + meteor.vy * (meteor.age - meteor.delay)
        const tail = .16, fade = t < .15 ? t / .15 : 1 - (t - .15) / .85
        const gradient = context.createLinearGradient(x, y, x - meteor.vx * tail, y - meteor.vy * tail)
        gradient.addColorStop(0, white)
        gradient.addColorStop(1, 'rgba(255,255,255,0)')
        context.globalAlpha = Math.max(0, fade)
        context.strokeStyle = gradient
        context.lineWidth = 1.6
        context.lineCap = 'round'
        context.beginPath()
        context.moveTo(x, y)
        context.lineTo(x - meteor.vx * tail, y - meteor.vy * tail)
        context.stroke()
        context.fillStyle = white
        context.beginPath()
        context.arc(x, y, 1.6, 0, Math.PI * 2)
        context.fill()
      }
      context.globalAlpha = 1
    }
    const tick = (time: number) => {
      const step = Math.min(.05, (time - (last || time)) / 1000)
      last = time
      clock += step
      for (const meteor of meteors) meteor.age += step
      meteors = meteors.filter(meteor => meteor.age < meteor.delay + meteor.life)
      draw()
      frame = requestAnimationFrame(tick)
    }
    const visibility = () => {
      cancelAnimationFrame(frame)
      last = 0
      if (!document.hidden) frame = requestAnimationFrame(tick)
    }
    const onResize = () => { resize(); if (reduced) draw() }
    if (reduced) draw()
    else {
      frame = requestAnimationFrame(tick)
      document.addEventListener('visibilitychange', visibility)
      sky.current.shoot = (x, y, n = 1) => {
        for (let i = 0; i < n; i++) {
          const angle = rand(.42, .72), dir = x > width / 2 ? -1 : 1
          const speed = rand(520, 760)
          meteors.push({ x: x + (i ? rand(-width * .3, width * .3) : 0), y: y + (i ? rand(-height * .25, height * .1) : 0),
            vx: Math.cos(angle) * speed * dir, vy: Math.sin(angle) * speed, age: 0, life: rand(.7, 1.05), delay: i * rand(.18, .4) })
        }
        if (meteors.length > 14) meteors = meteors.slice(-14)
      }
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(frame)
      sky.current.shoot = () => undefined
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [canvas, palette])
  return sky
}

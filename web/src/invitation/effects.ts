// Motion and utilities for the invitation. Every effect respects
// prefers-reduced-motion, uses fewer particles on phones, and pauses when the
// tab is hidden, so the page stays light on mid-range Android phones.
import { useEffect, useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'
import type { InvitationEvent } from './model'

export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const isPhone = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 700px), (pointer: coarse)').matches
const rand = (min: number, max: number) => min + Math.random() * (max - min)

export function useReveal(root: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const element = root.current
    if (!element || !active) return
    const targets = [...element.querySelectorAll<HTMLElement>('[data-reveal]')]
    if (reducedMotion() || typeof IntersectionObserver === 'undefined') {
      targets.forEach(target => target.classList.add('is-in'))
      return
    }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in')
          observer.unobserve(entry.target)
        }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 })
    targets.forEach(target => observer.observe(target))
    return () => observer.disconnect()
  }, [root, active])
}

function cssColors(element: Element, names: string[]) {
  const style = getComputedStyle(element)
  return names.map(name => style.getPropertyValue(name).trim()).filter(Boolean)
}

// Falling petals on a single fixed canvas.
export function usePetals(canvas: RefObject<HTMLCanvasElement | null>, active: boolean, palette: string) {
  useEffect(() => {
    const element = canvas.current
    const context = element?.getContext('2d')
    if (!element || !context || !active || reducedMotion()) return
    const colors = cssColors(element, ['--inv-petal-1', '--inv-petal-2', '--inv-petal-3'])
    let width = 0, height = 0, frame = 0, last = 0
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      element.width = Math.round(width * ratio)
      element.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    resize()
    const petals = Array.from({ length: isPhone() ? 14 : 26 }, () => ({
      x: rand(0, width), y: rand(-height, height), size: rand(5, 11), speed: rand(14, 34), sway: rand(14, 40),
      phase: rand(0, Math.PI * 2), spin: rand(-1.2, 1.2), angle: rand(0, Math.PI * 2), color: colors[Math.floor(rand(0, colors.length))] || '#efb9b0',
    }))
    const draw = (time: number) => {
      const step = Math.min(0.05, (time - (last || time)) / 1000)
      last = time
      context.clearRect(0, 0, width, height)
      for (const petal of petals) {
        petal.y += petal.speed * step
        petal.angle += petal.spin * step
        if (petal.y > height + 20) { petal.y = -20; petal.x = rand(0, width) }
        const x = petal.x + Math.sin(time / 1700 + petal.phase) * petal.sway
        context.save()
        context.translate(x, petal.y)
        context.rotate(petal.angle)
        context.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(time / 900 + petal.phase)))
        context.globalAlpha = 0.72
        context.fillStyle = petal.color
        context.beginPath()
        context.ellipse(0, 0, petal.size, petal.size * 0.58, 0, 0, Math.PI * 2)
        context.fill()
        context.restore()
      }
      frame = requestAnimationFrame(draw)
    }
    const visibility = () => {
      cancelAnimationFrame(frame)
      last = 0
      if (!document.hidden) frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [canvas, active, palette])
}

// A dotted S-curve down the whole page with a paper plane that flies along it
// as the guest scrolls. Only the part of the path on screen is drawn.
export function useFlightPath(canvas: RefObject<HTMLCanvasElement | null>, content: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const element = canvas.current
    const context = element?.getContext('2d')
    if (!element || !context || !active || reducedMotion()) return
    const [lineColor] = cssColors(element, ['--inv-gold'])
    let width = 0, height = 0, pageHeight = 0, frame = 0
    let xs = new Float32Array(0), ys = new Float32Array(0)
    const build = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      element.width = Math.round(width * ratio)
      element.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      pageHeight = Math.max(content.current?.scrollHeight ?? 0, document.documentElement.scrollHeight, height)
      const turns = Math.max(3, Math.round(pageHeight / 900))
      const perTurn = 60, edge = width < 700 ? [0.94, 0.06] : [0.88, 0.12]
      const span = pageHeight / turns
      xs = new Float32Array(turns * perTurn + 1)
      ys = new Float32Array(turns * perTurn + 1)
      xs[0] = width * edge[0]
      for (let turn = 0; turn < turns; turn++) {
        const x0 = width * edge[turn % 2], x1 = width * edge[(turn + 1) % 2], y0 = turn * span, y1 = y0 + span
        for (let i = 1; i <= perTurn; i++) {
          const t = i / perTurn, u = 1 - t
          // Cubic Bézier with vertical tangents at both ends, so y always increases.
          const c0y = y0 + span * 0.5, c1y = y1 - span * 0.5
          xs[turn * perTurn + i] = u * u * u * x0 + 3 * u * u * t * x0 + 3 * u * t * t * x1 + t * t * t * x1
          ys[turn * perTurn + i] = u * u * u * y0 + 3 * u * u * t * c0y + 3 * u * t * t * c1y + t * t * t * y1
        }
      }
      draw()
    }
    const draw = () => {
      frame = 0
      const top = window.scrollY, plane = top + height * 0.42
      context.clearRect(0, 0, width, height)
      let at = ys.findIndex(y => y >= plane)
      if (at < 1) at = ys.length - 1
      context.strokeStyle = lineColor || '#c9a14a'
      context.lineWidth = 1.3
      context.lineCap = 'round'
      const stroke = (from: number, to: number, dash: number[], alpha: number) => {
        context.beginPath()
        context.setLineDash(dash)
        context.globalAlpha = alpha
        let started = false
        for (let i = from; i <= to; i++) {
          const y = ys[i] - top
          if (y < -40 || y > height + 40) { if (started) break; continue }
          if (!started) { context.moveTo(xs[i], y); started = true } else context.lineTo(xs[i], y)
        }
        context.stroke()
      }
      stroke(0, at, [9, 8], 0.55)
      stroke(at, ys.length - 1, [1.5, 9], 0.45)
      context.setLineDash([])
      context.globalAlpha = 0.85
      const angle = Math.atan2(ys[at] - ys[at - 1], xs[at] - xs[at - 1])
      context.save()
      context.translate(xs[at], ys[at] - top)
      context.rotate(angle)
      context.fillStyle = '#fffaf2'
      context.beginPath()
      context.moveTo(16, 0); context.lineTo(-12, -11); context.lineTo(-6, 0); context.lineTo(-12, 11); context.closePath()
      context.fill(); context.stroke()
      context.beginPath(); context.moveTo(16, 0); context.lineTo(-6, 0); context.stroke()
      context.restore()
      context.globalAlpha = 1
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw) }
    let resizeTimer = 0
    const resize = () => { clearTimeout(resizeTimer); resizeTimer = window.setTimeout(build, 150) }
    build()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize)
    if (content.current) observer?.observe(content.current)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(resizeTimer)
      observer?.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', resize)
    }
  }, [canvas, content, active])
}

export function useCountdown(target: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const left = Math.max(0, target - now)
  return {
    done: left === 0,
    days: Math.floor(left / 86_400_000),
    hours: Math.floor(left / 3_600_000) % 24,
    minutes: Math.floor(left / 60_000) % 60,
    seconds: Math.floor(left / 1000) % 60,
  }
}

// Shrinks a single-line heading just enough to fit its container.
export function useFitText(ref: RefObject<HTMLElement | null>, text: string) {
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const fit = () => {
      element.style.fontSize = ''
      const available = element.parentElement?.clientWidth ?? element.clientWidth
      if (element.scrollWidth > available && available > 0) {
        const size = parseFloat(getComputedStyle(element).fontSize)
        element.style.fontSize = Math.max(16, Math.floor(size * (available / element.scrollWidth) * 0.97)) + 'px'
      }
    }
    fit()
    document.fonts?.ready.then(fit).catch(() => undefined)
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [ref, text])
}

const icsDate = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const icsText = (value: string) => value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
function icsFold(line: string) {
  const parts: string[] = []
  let rest = line
  while (rest.length > 74) { parts.push(rest.slice(0, 74)); rest = ' ' + rest.slice(74) }
  parts.push(rest)
  return parts.join('\r\n')
}

export function calendarFile(title: string, events: InvitationEvent[], details: string) {
  const stamp = icsDate(new Date())
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Shaadi Planner Pro//Wedding Invitation//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    icsFold('X-WR-CALNAME:' + icsText(title))]
  for (const event of events) {
    const start = new Date(event.startsAt)
    const end = new Date(start.getTime() + (event.durationMinutes ?? 120) * 60_000)
    const location = [event.place, event.address].filter(Boolean).join(', ')
    lines.push('BEGIN:VEVENT', 'UID:' + event.id + '@shaadiplannerpro.com', 'DTSTAMP:' + stamp, 'DTSTART:' + icsDate(start), 'DTEND:' + icsDate(end),
      icsFold('SUMMARY:' + icsText(event.name + ' · ' + title)))
    if (location) lines.push(icsFold('LOCATION:' + icsText(location)))
    const description = [details, event.mapUrl && 'Directions: ' + event.mapUrl].filter(Boolean).join('\n')
    if (description) lines.push(icsFold('DESCRIPTION:' + icsText(description)))
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

export function downloadCalendar(filename: string, title: string, events: InvitationEvent[], details: string) {
  const url = URL.createObjectURL(new Blob([calendarFile(title, events, details)], { type: 'text/calendar;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export const mapLink = (event: Pick<InvitationEvent, 'mapUrl' | 'address' | 'place'>) => event.mapUrl ||
  (event.address || event.place ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([event.place, event.address].filter(Boolean).join(', ')) : '')

export function whatsappNumber(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 10 ? '91' + digits : digits.replace(/^0+/, '')
}

const fontsHref = 'https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700&family=Inter:wght@400;500;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=Noto+Serif+Devanagari:wght@500;600&display=swap'

export function useInvitationFonts() {
  useEffect(() => {
    if (document.querySelector('link[data-invitation-fonts]')) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = fontsHref
    link.dataset.invitationFonts = ''
    document.head.appendChild(link)
  }, [])
}

import { useEffect, useRef, useState } from 'react'
import type { GuestPage } from './GuestWeddingPage'
import { whatsappShare } from './WorkspaceGuestPage'

const cardSize = 1080
const palettes = {
  marigold: { paper: '#fff8eb', petal: '#efcf9d', border: '#a9682b', ink: '#4d3125' },
  rose: { paper: '#fff6fa', petal: '#efcada', border: '#9c5373', ink: '#492a3b' },
}

function headingLines(ctx: CanvasRenderingContext2D, heading: string, maxWidth: number) {
  const lines = []
  let line = ''
  for (const word of heading.trim().split(/\s+/)) {
    const combined = line ? line + ' ' + word : word
    if (line && ctx.measureText(combined).width > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = combined
    }
  }
  return [...lines, line]
}

async function invitationCard(page: GuestPage) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = cardSize
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('The invitation image is unavailable on this device.')
  const colors = palettes[page.design.theme]
  const center = cardSize / 2
  ctx.fillStyle = colors.paper
  ctx.fillRect(0, 0, cardSize, cardSize)
  if (page.design.coverPhoto) {
    const photo = new Image()
    photo.src = 'data:image/jpeg;base64,' + page.design.coverPhoto
    await photo.decode()
    const scale = Math.max(cardSize / photo.naturalWidth, cardSize / photo.naturalHeight)
    const width = photo.naturalWidth * scale
    const height = photo.naturalHeight * scale
    ctx.drawImage(photo, (cardSize - width) / 2, (cardSize - height) / 2, width, height)
    ctx.fillStyle = colors.paper
    ctx.fillRect(92, 240, cardSize - 184, 600)
  } else {
    for (const [x, y] of [[90, 90], [990, 990]]) {
      const wash = ctx.createRadialGradient(x, y, 0, x, y, 430)
      wash.addColorStop(0, colors.petal)
      wash.addColorStop(1, colors.petal + '00')
      ctx.fillStyle = wash
      ctx.fillRect(0, 0, cardSize, cardSize)
    }
  }
  const inset = page.design.coverPhoto ? 110 : 38
  const top = page.design.coverPhoto ? 258 : 38
  const bottom = page.design.coverPhoto ? 822 : cardSize - 38
  ctx.strokeStyle = colors.border
  ctx.lineWidth = 2
  ctx.strokeRect(inset, top, cardSize - inset * 2, bottom - top)
  ctx.strokeRect(inset + 8, top + 8, cardSize - (inset + 8) * 2, bottom - top - 16)

  ctx.fillStyle = colors.border
  for (const y of [322, 758]) {
    for (let petal = 0; petal < 8; petal++) {
      ctx.save()
      ctx.translate(center, y)
      ctx.rotate(petal * Math.PI / 4)
      ctx.beginPath()
      ctx.ellipse(0, 13, 4, 10, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = colors.ink
  ctx.font = '600 26px system-ui, sans-serif'
  ctx.fillText('Y O U ’ R E   I N V I T E D', center, 397)
  let size = 88
  ctx.font = size + 'px Georgia, serif'
  let lines = headingLines(ctx, page.design.heading || page.name, 760)
  while (lines.length * size > 204 && size > 32) {
    size -= 4
    ctx.font = size + 'px Georgia, serif'
    lines = headingLines(ctx, page.design.heading || page.name, 760)
  }
  lines.forEach((line, index) => ctx.fillText(line, center, center + (index - (lines.length - 1) / 2) * size, 760))
  ctx.font = '500 30px system-ui, sans-serif'
  ctx.fillText(new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeZone: 'UTC' })
    .format(new Date(page.date + 'T00:00:00Z')), center, 687, 760)
  return new Promise<File>((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(new File([blob], 'wedding-invitation.png', { type: 'image/png' }))
    else reject(new Error('Could not create the invitation image.'))
  }, 'image/png'))
}

export function RSVPShare({ page, household, address }: { page: GuestPage; household: string; address: string }) {
  const [open, setOpen] = useState(false)
  return <details className="rsvp-share" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Share wedding invitation</summary>
    {open && <InviteComposer page={page} household={household} address={address} />}
  </details>
}

function InviteComposer({ page, household, address }: { page: GuestPage; household: string; address: string }) {
  const [message, setMessage] = useState(
    `You’re invited!\n\nDear ${household},\nWe’d love for you to celebrate with us at ${page.design.heading || page.name}. Please use your invitation link to see your events, RSVP and share your arrival plans.`,
  )
  const [card, setCard] = useState<{ file: File; url: string }>()
  const [feedback, setFeedback] = useState('')
  const [cardError, setCardError] = useState('')
  const copyField = useRef<HTMLTextAreaElement>(null)
  const fullMessage = message.trim() + '\n\n' + address
  const canShareImage = !!card && !!navigator.share && navigator.canShare?.({ files: [card.file] })

  useEffect(() => {
    let disposed = false
    let imageURL: string | undefined
    void invitationCard(page).then(file => {
      if (disposed) return
      imageURL = URL.createObjectURL(file)
      setCard({ file, url: imageURL })
    }).catch(() => { if (!disposed) setCardError('The card could not be created. You can still share the message and link.') })
    return () => {
      disposed = true
      if (imageURL) URL.revokeObjectURL(imageURL)
    }
  }, [page])

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(fullMessage)
      setFeedback('Message and RSVP link copied.')
    } catch {
      copyField.current?.focus()
      copyField.current?.select()
      setFeedback('Copy the selected message and RSVP link.')
    }
  }

  async function shareCard() {
    if (!card || !canShareImage) return
    setFeedback('')
    try {
      await navigator.share({ files: [card.file], text: fullMessage })
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setFeedback('Use Download card and Copy message and link to share them manually.')
      }
    }
  }

  return <div className="rsvp-share-content">
    <div>
      <label className="focus-field">WhatsApp message
        <textarea rows={5} maxLength={600} value={message} onChange={event => setMessage(event.target.value)} />
      </label>
      <label className="focus-field">Message with RSVP link
        <textarea ref={copyField} rows={3} readOnly value={fullMessage} onFocus={event => event.target.select()} />
      </label>
      <div className="focus-actions">
        {canShareImage && <button type="button" onClick={() => void shareCard()}>Share card and message</button>}
        <a href={whatsappShare(message.trim(), address)} target="_blank" rel="noreferrer">Open message in WhatsApp</a>
        <button type="button" className="focus-secondary" onClick={() => void copyMessage()}>Copy message and link</button>
      </div>
      <p className="focus-note">{canShareImage ? 'Choose WhatsApp in the share menu. Check that the RSVP link appears before sending.'
        : 'Download the card and attach it in WhatsApp, then paste the message as its caption.'}</p>
      {feedback && <p role="status">{feedback}</p>}
    </div>
    <div>
      {card && <><img src={card.url} alt={'Wedding invitation for ' + (page.design.heading || page.name)} />
        <a className="focus-secondary" href={card.url} download={card.file.name}>Download card</a></>}
      {!card && !cardError && <p role="status">Preparing invitation card…</p>}
      {cardError && <p role="alert">{cardError}</p>}
    </div>
  </div>
}

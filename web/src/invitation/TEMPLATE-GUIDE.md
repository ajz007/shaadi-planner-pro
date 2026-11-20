# Invitation template guide

How to add one invitation design. Read this whole file and [TEMPLATE-BACKLOG.md](TEMPLATE-BACKLOG.md) before starting. The product background is in [INVITATIONS-PLAN.md](../../../INVITATIONS-PLAN.md).

Quality over quantity: one design that a family would happily send to 300 guests is worth more than three average ones.

## How templates work

Every wedding has one set of invitation content (couple, blessings, functions, family, contacts, closing), entered once in the planner. A template is a design that renders that content. Families can switch designs without retyping anything.

A template is one folder, discovered automatically by the frontend and the Go server:

```
web/src/invitation/templates/<id>/
  manifest.json    id, version, order, name, description, sections, options
  Template.tsx     default export: the design, as a React component
  style.css        all styles, scoped to this template
  art.tsx          optional: this design's own SVG artwork
  preview.png      phone screenshot of the opened invitation, under 400 KB
```

Adding a template must not require changes anywhere else. Do not edit other templates, the Go code, the database, the editor, or the shared modules' existing behaviour. If a shared module truly needs a new helper, add a new export without changing existing ones, and explain it in the PR.

`templates/blush-envelope/` is the reference implementation. Read it fully before writing a new design. Reuse its logic patterns (opening stages, section rendering, RSVP, music, lanterns), not its look.

## manifest.json

```json
{
  "id": "marigold-mandap",
  "version": 1,
  "order": 2,
  "name": "Marigold Mandap",
  "description": "One sentence a family reads in the design picker.",
  "premium": false,
  "tags": { "mood": ["festive", "playful"], "region": ["north", "west"], "time": "day" },
  "sections": ["blessing", "hero", "countdown", "couple", "events", "rsvp", "family", "venue", "contacts", "closing"],
  "options": [
    { "key": "palette", "label": "Palette", "type": "choice", "default": "saffron",
      "choices": [
        { "value": "saffron", "label": "Saffron", "swatch": ["#fde9c2", "#b23c06", "#5c1d08"] },
        { "value": "rani", "label": "Rani Pink", "swatch": ["#fde0e6", "#ad1457", "#640d33"] }
      ] },
    { "key": "petals", "label": "Falling petals", "type": "boolean", "default": true }
  ]
}
```

- `id` is lowercase with hyphens and matches the folder name. `order` is the brief number from the backlog. `version` starts at 1. `premium` stays `false`.
- `sections` are the shared sections this design shows, in display order. Allowed keys: `blessing`, `hero`, `countdown`, `couple`, `events`, `rsvp`, `family`, `venue`, `contacts`, `closing`. Include all ten unless the brief says otherwise; drop or reorder only when the design calls for it. `rsvp` must be included.
- `tags` feed the design gallery's filters. `mood`: one to three of `festive`, `royal`, `minimal`, `romantic`, `serene`, `playful`, `glamorous`, `heritage`. `region`: one to three of `all-india`, `north`, `south`, `east`, `west`. `time`: `day`, `night` or `any`. Pick honestly; families filter by these.
- `options`: always a `palette` choice with two or three palettes. Every palette choice has a `swatch` of exactly three `#rrggbb` colours taken from your CSS: the background, the main accent, and the deepest ink. The gallery shows them as colour dots. Add at most three more options (boolean, choice, or text with `max`). Keys are camelCase. Every option needs a `default` of the right type.
- The Go test `TestInvitationTemplates` validates every manifest. Run it.

## Template.tsx

`export default function Name(props: TemplateProps)` from `../../types`. Props:

| Prop | Meaning |
|---|---|
| `page` | Wedding name, date (YYYY-MM-DD), time zone, cover photo (base64 JPEG, optional), heading |
| `invitation.content` | The shared content (see `InvitationContent` in `../../model`) |
| `invitation.events` | Functions on this guest's link: name, start, duration, place, address, map link |
| `invitation.hasMusic` | Whether background music exists |
| `manifest`, `options` | This template's manifest and resolved option values (defaults already filled) |
| `greeting` | Optional: "Anil & Sunita". Show it as "Dear …," near the top and on the opening card |
| `rsvp` | Optional: the RSVP panel. Render it inside a section with `id="rsvp"` |
| `loadMusic` | Optional: returns the MP3. Use `useMusic` from `../../music` |
| `preview` | Show a slim banner: "Preview · This is how your guests will see the invitation" |

Requirements:

1. **Opening moment.** Every design opens with a full-screen moment the guest taps (an envelope, doors, a scroll, a curtain, a lamp). The tap target is a `<button>` with an `aria-label` and the attribute `data-open`. After the reveal, the page continues on any tap or by itself after about 5 seconds. Lock page scroll during the opening (add a class on `<html>` and remove it on unmount). Start music right after the opening.
2. **Every manifest section is rendered from content**, in manifest order, and hidden when its content is empty (no couple names, no events, no family, no contacts). Use `order` like blush-envelope does so `rsvp` always appears when present.
3. **Functions**: group by day in the wedding's time zone (`dayKey`, `dayLabel`, `timeLabel` from `../../format`). Show each function's icon (`iconFor` and `EventArt` from `../../art`, or this design's own icons), name, subtitle and time label from `content.events[id]`. When all functions share one place, show the venue once; otherwise show the place per function with a directions link (`mapLink`).
4. **Couple**: honorific, full name, parent label and parents. Respect `content.brideFirst`. Use `coupleNames` from `../../model` for the short names. Names must never overflow; use `useFitText` from `../../effects`.
5. **Blessing**: symbols (`Medallion` from `../../art` or this design's own versions), invocation, shloka (Devanagari, one line per line), deity, elders, intro line, and the cover photo when present.
6. **Venue and contacts**: Add to Calendar (`downloadCalendar`), Get Directions (`mapLink`), call (`tel:`) and WhatsApp (`https://wa.me/` + `whatsappNumber`) buttons.
7. **Countdown** to the first function with `useCountdown`; hide it once the time has passed.
8. **Music**: when `invitation.hasMusic`, a large labelled Music On/Off button fixed in a corner, visible after the opening.
9. Set `document.title` to "<Names> | Wedding Invitation" and restore it on unmount.
10. Load fonts with `useFonts(href)` from `../../effects`, using Google Fonts with `display=swap`.
11. **Section anchors.** Render `<SectionAnchor section={key} />` (from `../../SectionAnchor`) immediately before each section, as blush-envelope does: `order.map(key => <Fragment key={key}><SectionAnchor section={key} />{render[key]()}</Fragment>)`. The studio's live preview scrolls to these while the family edits a section.
12. **Studio preview.** The studio opens the invitation by clicking the `data-open` element, then clicks near the top-left corner of the page about 2.6 seconds later to continue. Make sure that sequence lands on the page, and that a draft update (new props) changes the content in place without restarting the opening.

## style.css

- `blush-envelope` predates this rule and uses unscoped `.inv` classes. Don't copy that; new templates must be scoped.
- Scope every rule under this template's root: give the outer element `className="t-<id>"` and start every selector with `.t-<id>`. The only exception is the scroll-lock class on `<html>`, which must also include the id (`html.t-<id>-locked`).
- Define colours as custom properties on the root, one block per palette: `.t-<id>[data-palette="saffron"] { --c-paper: …; }`.
- The RSVP panel uses the existing `.invite-panel` markup. Restyle it inside your scope (see the end of blush-envelope's `style.css`) so it matches your design.
- Section anchors sit between sections, so never style sections with the adjacent-sibling selector (`.x-section + .x-section`); use the general sibling selector (`.x-section ~ .x-section`) instead.
- Animate only `opacity` and `transform`. Under `@media (prefers-reduced-motion: reduce)` switch every animation and transition off and show everything.
- No horizontal scroll from 320 px to 1920 px. Use a 16 px side gutter on phones.

## Art and content rules

- All artwork is original and drawn in code: inline SVG, CSS, or canvas. No image files, no external image URLs, no icon fonts, no new npm packages.
- Do not copy or imitate any real card, brand, logo, product, artist's specific artwork, or website. Traditional styles (Madhubani, Kalamkari, Pichwai, phulkari) may inspire motifs, drawn freshly.
- Do not hardcode religious text or symbols. They come from content (`symbols`, `invocation`, `shloka`), so families of any community can use the design. Decorative motifs (lotus, paisley, lamps, garlands, geometric patterns) are fine.
- Fixed wording in the design (section labels, buttons) is short, warm, original English. Do not reuse the labels from blush-envelope; give each design its own voice that fits its brief.
- No real people's names and no real phone numbers anywhere, including comments and tests. Sample data is the fictional Aarav & Meera with `+91 00000 000xx` numbers.

## Performance and accessibility

- Budget per template, from the `npm run build` output: Template JS at most 25 KB gzipped, CSS at most 10 KB gzipped.
- Canvas effects use fewer particles on phones, pause when the tab is hidden, and never run under reduced motion. Prefer the shared `useReveal` for scroll reveals.
- Text contrast at least 4.5:1 for body text. Visible focus styles. Every button has a text label or `aria-label`. No text inside images.
- Devanagari must render correctly (include a Devanagari font such as Noto Serif Devanagari or Tiro Devanagari Hindi).

## Self-review: required before opening a PR

1. `cd web && npm ci && npx tsc --noEmit && npm run build`. Note the Template chunk sizes.
2. `go test ./internal/workspace -run 'TestInvitation'` from the repo root (validates the manifest; no database needed). If Go isn't installed, download Go 1.24 for linux-amd64 from go.dev into `/tmp` and use it from there.
3. Screenshots: `cd web && (npx vite preview --port 4173 --strictPort &) && npm run shots -- <id>`, then again for each other palette (`npm run shots -- <id> palette=<value>`). If no browser is available, run `npx playwright-core install --with-deps chromium` (or without `--with-deps`) first.
4. **Look at every screenshot** in `web/screenshots/<id>/`, phone and desktop. Check: the opening looks designed, not like a placeholder; nothing overlaps or is cut off; names fit; the timeline reads clearly; palettes all look good; the page feels as polished as blush-envelope. Fix and re-shoot until it does. Do at least two rounds of fixes.
5. The script must report no problems (no console errors, no sideways scroll, an element with `data-open` found).
6. Copy `web/screenshots/<id>/phone-2-opened.png` or the best phone page shot to `templates/<id>/preview.png`, under 400 KB.

## Pull request

- Branch `template/<id>` from the latest `main`. One template per PR.
- Title: `Add <Name> invitation template`.
- Body: the brief in one paragraph, what makes this design distinct, the palettes and options, chunk sizes, how you verified it, and anything you weren't happy with.
- Commit only files inside `web/src/invitation/templates/<id>/`, plus any small additive shared helper explained in the body.

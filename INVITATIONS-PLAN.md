# Digital invitations plan

Reference for turning Shaadi Planner Pro's guest page into a full digital invitation product. Written 19 November 2026 from a review of custom web invites shared on WhatsApp, a build-versus-buy review, and a review of the Ad Studio repository (`ajz007/fal-ad-studio-v1`).

## Decision log

| Date | Decision |
|---|---|
| 2026-11-19 | Invitation content lives in the planner's own data model, never inside a template. Every renderer (our web themes, Ad Studio, any outside API) reads that content. |
| 2026-11-19 | Start with an **interactive static web invitation** in the planner. No video, no AI generation, no paid rendering API until families ask for them. Running cost per wedding should stay close to zero. |
| 2026-11-19 | Quality bar: equal to or better than the custom web invites families commission today, on opening, motion, typography, layout and phone performance. Illustrations are a separate art workstream. |
| 2026-11-19 | Later, Ad Studio becomes the creative engine for rendered media (video, image card, PDF, AI art). The interactive web invite and all guest and RSVP data stay in the planner. |
| 2026-11-19 | Phase 0 and the first version of Phase 1 built on branch `feature/digital-invitation`. See [Status](#status). |
| 2026-11-19 | One content model and one form for every template. Templates differ in look, section order and a few declared options. See [Templates](#templates-one-content-model-many-designs). |

## Status

### Built (branch `feature/digital-invitation`)

- **Data:** migration `018_wedding_invitation.sql` adds `wedding_invitations` (on/off switch, JSON content, template ID, version and options, optional MP3, revision).
- **Templates:** manifest-driven sections and options from `web/src/invitation/templates.json`, validated by the server. One template so far (`blush-envelope`), with palette, envelope line, paper-plane trail and lantern options. Function names, times and venues still come from `wedding_functions` and `wedding_places`; the invitation only adds an icon, subtitle and time label per function.
- **Organizer API:** `GET/POST /api/workspace/weddings/{id}/guest-rsvp/invitation`, `GET/POST …/invitation/music` (raw MP3 body, 5 MB limit, revision checked).
- **Guest API:** `/api/guest-rsvp` and `/api/guest-schedule` include `invitation` when it is switched on, limited to the functions on that link. `/api/guest-invitation-music` serves the music for an active link, with the token in the POST body.
- **Editor:** "Design the digital invitation" on the Guest RSVP screen (`web/src/WorkspaceInvitation.tsx`): palette, couple, blessings and symbols, per-function icon/subtitle/time label, family sections, dress code, reply-by date, contacts, closing, music, and a preview at `/invitation-preview`.
- **Guest page** (`web/src/invitation/`): envelope with monogram seal and card reveal, sparkle burst, toran, sacred-symbol medallions, Devanagari shloka, personal greeting, couple photo in an arch, gold names, Save the Date, countdown, couple cards, festivities timeline with drawn ritual icons, RSVP inside the invitation, family cards, venue and dress code, Add to Calendar, directions, call and WhatsApp contacts, closing, blessing lanterns, music with On/Off.
- **Palettes:** Blush & Gold, Marigold, Royal Maroon (dark).
- **Weight:** about 12 KB JS + 6 KB CSS gzipped, loaded only on guest pages, against several megabytes for a typical custom invite.
- **Tests:** content validation, organizer and guest endpoints, link scoping, draft versus live, music upload and access, against PostgreSQL.

### Known gaps, in suggested order

1. **WhatsApp link preview.** Guest tokens live in the URL fragment, which the server never sees, so the preview card is the generic site card. Option: a short public `/i/{slug}` share page per wedding with server-rendered `og:` tags that hands off to the personal link.
2. **Music library.** Families upload their own MP3. Add two or three licensed shehnai or instrumental tracks to choose from.
3. **Illustrations.** Art is vector-drawn (medallions, ritual icons, roses, mandalas, toran). A couple caricature, a city skyline and a footer procession need commissioned or licensed artwork.
4. **Sample wedding.** The demo at `/#demo` has no invitation yet; a sample invitation would sell the feature.
5. **Languages.** English labels only. Hindi and Gujarati label sets next.
6. **Opened tracking.** Record first open per link so organizers see who hasn't opened the invitation.

## Templates: one content model, many designs

Indian wedding cards share a structure: invocation, blessings, hosts, the couple with parents, the functions, family, contacts and RSVP, and a closing. Communities change the wording and symbols (Bismillah instead of a Ganesh shloka, Anand Karaj instead of pheras), not the shape. Roughly 85–90% of any card fits the same sections, so families type their details once and every template renders them.

```
 Content (per wedding)        wedding_invitations.content      one form, template-independent
      │ same JSON for every design
 Template manifest            web/src/invitation/templates.json   id, version, sections in order, options
      │
 Renderer                     web/src/invitation/Invitation.tsx   web today; Ad Studio video, image, PDF later
```

### Storage

`wedding_invitations` keeps:

- **`content`:** the shared wedding details, validated strictly in Go.
- **`template_id`, `template_version`:** the chosen design. Saving from the editor moves the wedding to the template's current version. Until then a live invitation keeps the version it was saved with, so a design change never surprises a family days before the wedding.
- **`template_options`:** the values for the options that template declares (palette, envelope line, effects on or off).

Switching templates never loses content. Sections the new template doesn't show stay saved.

### The manifest

`web/src/invitation/templates.json` is read by the editor and embedded in the Go server (`web.InvitationTemplates`):

- **`sections`:** which shared sections the design shows, in order. Allowed keys: `blessing`, `hero`, `countdown`, `couple`, `events`, `rsvp`, `family`, `venue`, `contacts`, `closing`. The RSVP always renders when the guest has one, even if a manifest leaves it out.
- **`options`:** typed fields (`choice`, `text` with `max`, `boolean`), each with a default. The editor generates the "Design options" form from them. The server rejects unknown keys and wrong values, and fills in defaults for missing ones.
- **`premium`:** for a future Shop unlock, checked by the server before it saves a premium template.

The server checks every manifest at startup and in tests: unknown or repeated sections, defaults that don't match their type, text without a `max`, or a missing default template all fail.

### Editor behaviour

- One form for the shared content, whatever template is chosen.
- A design picker, and a "Design options" group built from the manifest.
- A section the chosen design doesn't show is dimmed with "Not shown in this design". Its content is kept.

### Adding a template

1. Add its manifest to `templates.json`.
2. Add its renderer (a component that takes the same `content`, `events` and `options`), or reuse the current one with different sections and options.
3. No migration and no new form.

### When content doesn't fit

- Needed by two or more templates: add an optional section to the shared model ("Our story", photo gallery, live-stream link).
- Truly specific to one design: add it as a template option (monogram style, a decorative caption).
- If neither fits, it is probably a new template rather than a new field.

### Still to do for full flexibility

1. **Community presets for the invocation.** Symbols are a fixed Hindu list today (`om`, `shri`, `swastik`, `kalash`). Presets for Hindu, Jain, Sikh, Muslim and Christian weddings should fill the same `blessing` section.
2. **Label sets per language.** Section labels ("The Festivities", "Meet the couple") are English strings in the renderer. They should come from a label set so Hindi and Gujarati don't need new templates.
3. **Version branches.** When a template change would alter live invitations, the renderer branches on `template.version` instead of changing old behaviour.
4. **Premium unlock** through the Shop, checked on save.

## 1. What custom web invites typically include

Families increasingly share a link to a one-off animated web invitation on WhatsApp instead of a PDF or image. These are usually commissioned from independent designers and share a common pattern.

### How they are usually built

A single self-contained HTML page of several megabytes on free static hosting, with no framework and no build step. The music and illustrations are often inlined as base64, which is why the file is so heavy.

| Part | Typical size | Notes |
|---|---|---|
| Background song | 2–3 MB | MP3 inlined as base64 and unpacked into an `Audio` blob |
| Illustrations | 1–2 MB | Couple caricature, ritual icons, a local landmark, decorative borders |
| Code, text and icons | 100–200 KB | Markup, CSS, JS, an inline SVG sprite |
| Fonts | Google Fonts | A decorative display face for names, a serif for text, a Devanagari face for shlokas |

Many are now produced with AI coding assistants and AI-generated illustrations.

### Typical sections

1. An opening moment (envelope, curtain or door) that the guest taps.
2. Invocation and blessings: sacred symbols, a shloka, kuldevi, elders.
3. The invitation line and the couple's names, date and a Save the Date button.
4. A countdown.
5. The couple with honorifics and parents.
6. The functions as a timeline grouped by day, with icons and time labels.
7. Family members grouped by relation.
8. Venue, dress code, Add to Calendar and directions.
9. Contacts with call and WhatsApp buttons.
10. A closing line from the hosts, often with a small interactive touch.
11. A music On/Off button throughout.

### Techniques worth keeping

- **Opening sequence.** CSS 3D flap, class steps (`is-opening`, `is-risen`, `is-flash`, `is-done`), a sparkle burst. The tap also satisfies the browser's autoplay rule so music can start.
- **Music.** Starts only after the invitation has opened, fades in over 1.8 s, remembers "off" in `localStorage`, large labelled button for older guests. iPhones ignore `audio.volume`, so the track itself needs a soft start.
- **Paper-plane path.** S-curve built from cubic Béziers, sampled into arrays, drawn on one viewport-sized canvas for only the visible part, with the plane moved along it on scroll in a single `requestAnimationFrame`.
- **Petals, glitter, tap ripple.** One canvas, fewer particles on phones, paused when off screen, switched off for `prefers-reduced-motion`.
- **Scroll reveals** with `IntersectionObserver`, animating only opacity and transform.
- **Countdown** always in the wedding's time zone, never the visitor's.
- **Add to Calendar** builds an `.ics` file in the browser: one `VEVENT` per function, a `VTIMEZONE` for Asia/Kolkata, escaped and folded lines.
- **Repeating decorative borders** slide on whole device pixels so they stay sharp.
- **Fit-to-width names**: long names shrink just enough to stay on one line.
- `noindex,nofollow`, `og:` tags for the WhatsApp preview, `format-detection` off so iOS doesn't turn dates and numbers into links.

### What they usually don't do

- No RSVP. Guests reply on WhatsApp.
- One link for everyone. No personal greeting and no per-guest function list.
- Any change means editing HTML and redeploying.
- Several megabytes must download before anything shows.

Our advantage: we already have per-guest links, RSVP, function visibility, family-only functions and schedule links.

## 2. Build versus buy

| Output | Choice | Reason |
|---|---|---|
| Interactive web invite (envelope, music, timeline, RSVP) | **Build** | Depends on our guest links, RSVP and function visibility. Outside services produce static files. |
| WhatsApp image card / save the date | Buy (API) first, or render our own theme to an image later | Template image APIs are cheap and quick |
| Video invite | Ad Studio (ours), or a video template API | Building video rendering from scratch is expensive |
| Printable PDF | Ad Studio or a template API, or render our theme to PDF | Either works |
| Artwork (ritual icons, skylines, processions) | Commission or license | The real moat. Art, not code. |
| Couple caricature | AI image model plus human review | Paid add-on |
| Canva-style editor for static designs | Buy an editor toolkit | Building one is a multi-month detour |

### Outside services to evaluate

Verify current pricing and terms before committing, especially whether a template licence lets our customers create their own end products.

- **Fill a template through an API (image, PDF, some video):** Placid, Bannerbear, Templated.io, APITemplate.io. Canva Connect API (Autofill has required Canva Enterprise, and editing happens inside Canva).
- **Video templates through an API:** Creatomate, Shotstack.
- **Editors to embed in React:** Polotno SDK, IMG.LY CreativeEditor SDK. Fabric.js or Konva to build a lighter one.
- **Artwork:** commission Indian illustrators and own the rights; stock libraries with APIs such as Freepik (check the template-tool clause, which many marketplaces such as Envato restrict); AI image models with consent and review.

## 3. Ad Studio as the creative engine (later)

Ad Studio (`fal-ad-studio-v1`, TypeScript) already has: a pg-boss job queue and worker; Fal image (Flux) and image-to-video (Kling) generation; FFmpeg assembly with captions, music, fades and watermarks; a no-cost fixed renderer (`sample-renderer.ts`); a versioned template catalogue that keeps public metadata separate from private recipes; a curated music catalogue; private S3 storage; per-job cost ceilings; Razorpay credits.

### Split

```
Shaadi Planner Pro (Go)                        Ad Studio (TS) = creative engine
Owns wedding data                              Owns templates, theme packages, art, music
Interactive web invite + RSVP     ── API ──▶   Renders video, image card, PDF
Per-guest links, functions                     AI art: caricature, ritual icons
Sells to families (Shop)                       Never stores guest lists
```

The planner sends a snapshot of invitation content with each render. Ad Studio deletes it when the job expires.

### Gaps to close in Ad Studio

1. Service-to-service auth (API keys or signed requests, one account per calling app). Today it only has Google sign-in.
2. Public render API: `GET /api/v1/templates?category=wedding-invite`, `POST /api/v1/renders` (`templateId`, `version`, `content`, `assets`, `output`, `callbackUrl`, `idempotencyKey`), `GET /api/v1/renders/:id`, signed completion webhook.
3. Mapping from invitation content to its scene manifest.
4. Styled text: today's captions are FFmpeg `drawtext` on a black box. Devanagari and Gujarati need text shaping. Preferred route: render overlays from the same React theme components in headless Chromium so web and video match.
5. Image and PDF outputs.
6. Billing between apps: the planner charges the family in its Shop; Ad Studio bills the planner's account.
7. Wedding AI rules: photo consent, face review, consistent style.

### Order (when we get there)

| Step | Ad Studio | Planner |
|---|---|---|
| A | API keys, render API, webhook, one wedding video on the fixed renderer | "Create video invite" button |
| B | Theme package format, browser-rendered overlays, image and PDF outputs | Web invite loads the theme package; sell outputs in the Shop |
| C | Premium AI: caricature, animated ritual scenes | "Premium video" option |
| D | Designer submissions, embeddable editor with signed embed tokens | Embedded editor |

## 4. Product roadmap

### Phase 0: content model
- Invitation content per wedding: couple names and honorifics, parents, blessings (deity medallions, kuldevi, shloka), family groups with relation labels (including late relatives), hosts' sign-off, contacts, dress code, venue address and map link, music on/off, theme.
- Function details: icon, optional end time, subtitle, time label override (for example "Brahma Muhurat, 4:00 AM").
- Organizer editor screen in the workspace.

### Phase 1: interactive web invite, one theme (current)
- Uses existing per-guest links: personal greeting, only that guest's functions, RSVP inline.
- Envelope opening, monogram seal, blessings, hero, countdown, couple, timeline, family, venue, calendar, contacts, closing, music, petals and lanterns.
- WhatsApp link preview, first screen fast on mid-range Android over 4G, reduced-motion support.
- Done when a real family sends it to 200+ guests and RSVPs come back into the app.

### Phase 2: themes and outputs
- Theme = colour tokens + fonts + artwork pack + effect switches. 6–8 themes (South Indian temple, Rajasthani, Bengali, minimal modern, Punjabi, Gujarati/Marwari).
- Community presets for deities and shlokas. Languages: English, Hindi, Gujarati, Marathi, Tamil.
- Analytics: opened, not opened, RSVP rate per household.
- Premium themes in the Shop. First rendered outputs (image card, PDF) through Ad Studio or an API.

### Phase 3: personalisation
- Couple photo or caricature, photo album, per-side and per-function invites, reminders ("3 days to Haldi").
- Video invites through Ad Studio if families ask for them.

### Phase 4: platform
- Designer marketplace with revenue share, planner white-label, print partners, live wedding-day page on the same link.

## 5. Business model (assumptions to validate)

- Free: one theme, our branding.
- Paid one-off: premium themes, custom illustration, later video and print.
- Bundled in a paid planner plan.
- The data advantage (RSVP, per-guest functions, open tracking) justifies pricing above a one-off Instagram designer.

## 6. Risks

- **Music copyright:** offer only licensed or royalty-free tracks.
- **Image rights:** monument photos, deity art and outside templates need rights for use in a template tool.
- **Privacy:** family names and phone numbers are on the page. Unguessable token links, `noindex`, revocable links.
- **Cultural accuracy:** shlokas, deity order and honorifics need review.
- **Provider lock-in:** content stays in our model; each provider sits behind one interface.
- **Performance:** most guests open from WhatsApp on mid-range Android. Test there.

## 7. Quality checklist for the web invite

- [ ] Opening sequence feels designed: envelope, seal, flap, card rise, sparkle, smooth hand-off to the page.
- [ ] Typography: decorative display face for names, refined serif for body, Devanagari that renders correctly.
- [ ] Every section reveals gently on scroll; nothing jumps or reflows.
- [ ] Music starts after opening, fades in, has a large On/Off control, remembers the choice.
- [ ] Countdown uses the wedding time zone.
- [ ] Timeline groups functions by day, with icons and custom time labels.
- [ ] Add to Calendar works on iPhone and Android; Directions opens maps.
- [ ] Personal greeting and RSVP inline, which one-off custom invites cannot do.
- [ ] First paint under ~300 KB on 4G; heavy effects load after opening.
- [ ] Effects pause off screen and switch off for reduced motion.
- [ ] Looks right from 320 px phones to desktop, with no horizontal scroll.
- [ ] WhatsApp preview shows names, date and an image.

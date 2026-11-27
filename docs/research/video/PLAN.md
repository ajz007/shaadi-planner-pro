# Video for shaadiplannerpro.com: research outcome and validation plan

## Context
Invitation templates landed well with friends. The owner wants to add video, but makeadreels.com taught a lesson: people registered and nobody generated anything. That product had generic "ad" positioning, 5 disjoint AI photos, and 5 s clips. Before building, we researched what Indian families actually buy and share, how the cheap AI kiss/hug apps work, and whether to use AI, template motion or a hybrid. **This plan does not implement the feature. It defines the direction and the cheap validation experiments that decide whether to build.**

Full report, with sources: [REPORT.md](REPORT.md). The four research note files (`notes-*.md`) sit beside it.

## Key findings
- **What sells is a WhatsApp video e-invite, not an "AI reel".**
  - 57–79% of couples run wedding communication on WhatsApp, and about 91% used e-invites (older survey).
  - Self-serve video invites sell for ₹999–1,499; caricature or custom ones for ₹1,500–5,000.
  - Suites with an RSVP microsite sell for ₹4,500–10,000+. Our RSVP links and guest pages are already most of that top tier.
  - Parents often send the formal invite to elders, so the file must stay small: 30 s or less, 16 MB or less.
- **Kiss/hug apps** apply a fixed effect template (a LoRA or tuned prompt) to one photo, producing a 5–10 s clip.
  - Cost to them is $0.20–0.50 per clip (fal Vidu templates, for example `dreamy_wedding` at $0.30; Kling effects about $0.28).
  - Revenue comes from weekly subscriptions (about ₹449/week) driven by heavy paid ads.
  - India's IT Rules (Feb 2026) require AI videos to be labelled, and consent risk is high. These are not appropriate for invites sent to elders.
- **Hybrid, with templates doing most of the work, is the best fit.**
  - Template motion graphics via Remotion (React, so it reuses our JSX/CSS/SVG templates) cost about ₹1–3 per render.
  - Names and dates are always exact, and Indic scripts render correctly. ffmpeg `drawtext` breaks Devanagari, so makeadreels' text path is unsuitable.
  - A hybrid with one optional 3–5 s AI "living photo" costs about ₹35–90 per video. Fully generative costs ₹130–530.
- **The owner's hypotheses:**
  1. Generic positioning: confirmed.
  2. Disjoint photos: confirmed. The problem is separate AI generations, not multiple photos. 2–4 photos inside a template montage are fine.
  3. One photo, fixed template, 15–20 s: largely confirmed. Make one hero photo required and extras optional. Use 15 s for save-the-date and 30 s for the invite.
  4. A 5 s clip is too short: right for invites. It cannot carry names, date, events and RSVP.
- **Music risk:** Zee is seeking ₹2 crore from Nykaa over Bollywood songs in reels. Default to royalty-free tracks, and offer a silent export so couples add a song in Instagram personally.

## Recommended direction (ranked)
1. **WhatsApp video invite and save-the-date**, generated from our existing invitation templates and content.
   - Template motion (Remotion), 9:16, 15 s or 30 s, with an RSVP/QR end card.
   - Also export a still image and a PDF.
   - Price: ₹999 pack (save-the-date plus invite, unlimited re-renders, no watermark). Free watermarked preview.
2. **One couple page** combining invite, events, schedule and RSVP, with a QR code for printed cards. This mostly exists already; it needs unification.
3. **Multi-event suite** (haldi, mehendi, sangeet, reception), with a parents'-voice version and regional languages, at ₹2,499.
4. **Free reminder nudges**: families send pre-filled WhatsApp links themselves, at zero cost. Paid automated WhatsApp Business reminders come only if families ask (about ₹100–150 per wedding in Meta fees).
5. **AI "living photo" add-on** (₹499) inside the template, using fal Vidu or Kling templates and reusing the makeadreels queue. It needs a consent checkbox and an AI label.
6. **Viral loop**: a "Made with ShaadiPlannerPro" end-card link on every free export.

The earlier "makeadreels partner API" plan is deferred until step 5. It is no longer the critical path.

## Phase 0: validation experiments (about 2 weeks, before any build)
1. **Fake-door button** in `web/src/studio/InvitationStudio.tsx`: "Download as WhatsApp video, ₹999", which leads to a "coming soon, join the list" page. Count clicks per active wedding. The only code involved is a button, a waitlist and a counter.
2. **Concierge sales:** hand-make 10–20 video invites (Canva or Remotion by hand) from real users' published invitations and sell them through the existing Razorpay Shop (`internal/commerce`, `web/src/shop-catalog.json`). Measure the conversion rate and the edits people ask for.
3. **A/B with families:** show couples and their parents a template-only and a hybrid AI version of the same invite. Record which they would forward.
4. **AI quality spike:** spend about $5 on fal Vidu `dreamy_wedding`, `romantic_lift` and `couple_walk`, plus a Kling effect, using consented Indian couple photos. Check face and jewelry fidelity.
5. **Tech checks:**
   - A Remotion proof-of-concept rendering `blush-envelope` with Hindi, Tamil and Telugu names.
   - WhatsApp send and Status tests on a cheap Android phone to check size and compression.
   - Confirm the 160 KB couple photo is too low-resolution for full-frame video, which would mean a separate high-resolution upload is needed.
6. **Decision gate:**
   - Build step 1 if at least 5% of active weddings click the fake door, or at least 5 concierge sales close.
   - Otherwise invest in the couple page and suite instead.

## Verification
- Fake-door clicks and waitlist entries are recorded per wedding (Postgres row or analytics event), and appear in an admin query.
- Concierge orders complete through Razorpay test, then live mode.
- The Remotion proof-of-concept produces an MP4 of 30 s or less, 16 MB or less, at 1080×1920. Indic glyphs are checked visually, and the file is checked after a WhatsApp round-trip.
- Results are written back into `INVITATIONS-PLAN.md`'s decision log before Phase 1 is planned in detail.

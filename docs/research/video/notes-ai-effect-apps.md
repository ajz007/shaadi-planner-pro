# AI "photo to video effect" apps: mechanism, economics, API prices (research notes, 2026-11-27)

## Which apps/products exist, pricing, downloads, revenue

### Takeaway
PixVerse is the effect-template leader with numbers its makers report themselves: 100M+ users and $40M+ ARR (Aug–Oct 2025), then 150M registered users and 15M MAU (Jul 2026). A long tail of "AI kiss & hug" wrapper apps sells weekly subscriptions with credits per clip and runs heavy Meta and TikTok ads.

### Cited Findings
- PixVerse: over 100M users and over $40M ARR, revealed at a Stanford GSB fireside chat; the user milestone was reached in Aug 2025 — [blockchainnews](https://blockchainnews.azurewebsites.net/ainews/pixverse-ai-video-platform-surpasses-100m-users-and-40m-arr-leading-mobile-first-ai-video-revolution); [PixVerse Series B blog](https://pixverse.ai/en/blog/pixverse-announces-series-b-international-expansion-ai-video)
- PixVerse CEO told 36Kr that subscription revenue already covers costs — [KrASIA](https://www.kr-asia.com/aisphere-touts-pixverse-as-the-canva-for-video-generation-and-lands-the-funding-to-prove-it)
- Viral PixVerse effect templates (e.g. "Venom transformation") have drawn more than 10 billion views since Nov 2024. User-made templates can become trends. (Search snippet of the KrASIA/aibase coverage; not verified on the full page) — [KrASIA](https://www.kr-asia.com/aisphere-touts-pixverse-as-the-canva-for-video-generation-and-lands-the-funding-to-prove-it)
- PixVerse Series C extension, Jul 2026: $439M total, valuation above $2B, 150M+ registered and 15M+ MAU. Revenue not disclosed. Image-to-video cited at about $4.80 per minute — [TechCrunch](https://techcrunch.com/2026/07/13/video-generation-startup-pixverse-raises-439m-valuation-soars-past-2b/)
- PixVerse US app (Sensor Tower blog snippets, apparently auto-generated, so low confidence): weekly revenue about $58K (late Q1 2025) and $49K–90K (Q3 2025); Europe Q3 2025 $59K–102K/week, with a weekly download peak of 348K — [Sensor Tower Q3 US](https://sensortower.com/blog/2025-q3-unified-top-5-photography%20apps-units-us-600a8192241bc16eb890d396); [Sensor Tower Q3 Europe revenue](https://sensortower.com/blog/2025-q3-unified-top-5-photography%20apps-revenue-europe-600a8192241bc16eb890d396)
- Market context: generative AI apps reached about 3.8B downloads in 2025, and in-app purchase revenue more than tripled to over $5B — [TechCrunch Jan 2026](https://techcrunch.com/2026/01/21/consumers-spent-more-on-mobile-apps-than-games-in-2025-driven-by-ai-app-adoption/?rand=324); [Sensor Tower State of AI Apps 2025](https://sensortower.com/blog/state-of-ai-apps-market-overview-2025)
- India kiss/hug wrapper apps (Aug 2026): "AI Video Generator: kiss & Hug" by Hangover Studios (Yalavarthi Software Solutions) charges Rs 449/week, Rs 699/month or Rs 2,999/year (yearly pre-selected, 8,000 bonus credits). A two-person video costs 30 credits, and saving or sharing a clip costs 5 credits. Other apps named: Heyo (a1.art-linked), KiHu, Kiss AI and VIDI.AI. "Several" have passed 1M downloads, and some were pulled from Play in Aug 2026 — [ThePrint](https://theprint.in/tech/upload-anyones-pic-ai-will-make-intimate-video-of-you-kiss-hug-apps-test-indias-it-rules/3024195/)
- Higgsfield plans (sources conflict): $15/200 credits, $49/1,000 and $129/3,000 per month, against $9/$23/$59 annual tiers in another source. Kling 3.0 720p costs about 7 credits per 5 s (Apr 2026 data). Users pay per attempt, so retries raise the real cost — [Higgsfield blog](https://higgsfield.ai/blog/higgsfield-pricing-explained); [Krea summary](https://www.krea.ai/blog/higgsfield-pricing-explained-2026-unlimited-credits-and-real-monthly-costs); [Higgsfield blog on credits](https://higgsfield.ai/blog/why-ai-video-credits-run-out)

### Inferences
- The consumer price anchor is a weekly subscription (about $5/week in India, typically $7–10/week in Western markets for such apps), paying for clips that cost the app $0.20–0.50 each. Gross margin is large. Paid acquisition is the main cost.

### Gaps
- No verified per-app revenue or downloads for Remini, Revive, Vivid, Meitu, Hypic, CapCut effects, Hailuo or Kling consumer apps (search budget exhausted). Consumer pricing for Kling, Hailuo, Vidu and Pika apps was not verified this session.
- No Appfigures figures found for kiss/hug apps.

## How they work technically

### Takeaway
"Effects" are fixed templates: a hidden, effect-specific motion fine-tune or LoRA, or a curated prompt, on the vendor's base image-to-video model. The user uploads a single photo (rarely two or three) and gets a 5–10 s clip at 720p in 16:9 or 9:16. Identity is preserved because the photo is the first frame.

### Cited Findings
- fal Wan Effects (Wan 2.1 14B I2V plus LoRAs): about 44 preset effects, including squish, muscle, inflate, crush, rotate, deflate, cakeify, hulk, baby, bride, classy, puppy, snow-white, disney-princess and mona-lisa. "Each effect applies a specific LoRA-based transformation." $0.35 per video. NOTE: the model page and its /api page returned 404 today, so the endpoint may be deprecated — [fal wan-effects (search snippet)](https://fal.ai/models/fal-ai/wan-effects); [llms.txt](https://fal.ai/models/fal-ai/wan-effects/llms.txt)
- The open-source basis is Remade-AI's Wan2.1 14B I2V 480p LoRAs (Squish, Inflate and others) — [HF Remade-AI/Squish](https://huggingface.co/Remade-AI/Squish); [HF Remade-AI/Inflate](https://huggingface.co/Remade-AI/Inflate); [stable-diffusion-art tutorial](https://stable-diffusion-art.com/wan-2-1-lora/)
- Kling effects on fal take one image ("Every effect requires exactly one image"), with a duration of 5 or 10 s. Effect list includes hug_pro, kiss_pro, heart_gesture_pro, fight_pro, bouquet_drop, surprise_bouquet, glamour_photo_shoot, girlfriend, boyfriend, pure_white_wings, bullet_time_360 and many holiday effects — [fal Kling v1.6 effects API](https://fal.ai/models/fal-ai/kling-video/v1.6/standard/effects/api)
- Vidu template-to-video on fal: about 200 templates, including dreamy_wedding, romantic_lift, sweet_proposal, couple_arrival, cupid_arrow, hug, kiss, cheek_kiss, rain_kiss, couple_walk, flower_receive, love_story, carry_me, hug_from_behind, petal_scattered, live_photo, live_memory, youth_rewind, muscling, get_thinner and balloon_flyaway. Most templates take one image; dynasty_dress takes 1–2 and wish_sender takes 3. Aspect ratio is 16:9 or 9:16 — [fal Vidu template API](https://fal.ai/models/fal-ai/vidu/template-to-video/api)
- PixVerse also exposes effects plus a separate "transition" (start/end frame) endpoint and a reference-to-video endpoint — [fal PixVerse v5.5 effects](https://fal.ai/models/fal-ai/pixverse/v5.5/effects); [transition](https://fal.ai/models/fal-ai/pixverse/v5.5/transition); [C1 reference-to-video](https://fal.ai/models/fal-ai/pixverse/c1/reference-to-video)
- PixVerse attributes its edge to data labelling ("how you label it") — [TechCrunch](https://techcrunch.com/2026/07/13/video-generation-startup-pixverse-raises-439m-valuation-soars-past-2b/)

### Inferences
- Couple effects from one photo (hug and kiss) work when the photo already holds both people. Wrapper apps that take two separate faces likely composite them into a single first frame, or use multi-image templates or reference-to-video.
- Identity drifts as motion grows (kiss and turn-around effects). First-frame conditioning keeps the opening frames faithful.

### Gaps
- Vendors don't publish whether a given effect is a LoRA, a full fine-tune or a prompt. The template output resolution and duration for Vidu were not stated on the page.

## Developer API prices (fal, verified 2026-11-27 unless flagged)

### Takeaway
Template endpoints cost about $0.20–0.50 per clip, which is cheaper than or comparable to the owner's current Kling 2.5 Turbo Pro 5 s clip ($0.35).

### Cited Findings
- fal Kling v1.6 standard effects: $0.056 per second, so about $0.28 per 5 s and $0.56 per 10 s — [fal page](https://fal.ai/models/fal-ai/kling-video/v1.6/standard/effects)
- fal Vidu template-to-video: Standard $0.20 (4 credits; e.g. hug, kiss, love_pose), Premium $0.30 (6 credits; e.g. dreamy_wedding, dynasty_dress), Advanced $0.50 (10 credits; live_photo), per generation — [fal page](https://fal.ai/models/fal-ai/vidu/template-to-video)
- fal Wan Effects: $0.35 per video (possibly deprecated, page 404) — [fal](https://fal.ai/models/fal-ai/wan-effects)
- fal PixVerse effects: base $0.15 per 5 s at 360p/540p, $0.20 at 720p and $0.40 at 1080p (v3.5 tiers; v5.5 is said to match image-to-video pricing). Not verified on the live page because the fetch timed out — [fal PixVerse v5.5 effects](https://fal.ai/models/fal-ai/pixverse/v5.5/effects); [v3.5 i2v](https://fal.ai/models/fal-ai/pixverse/v3.5/image-to-video)
- fal pricing page: Kling 2.5 Turbo Pro I2V $0.07/s and Kling 2.6 Pro $0.07/s. Seedance 1 Pro Fast is billed at $1 per 1M tokens. PixVerse V6 is shown at $0.005/s, which looks suspect and needs checking. Veo 3.1 Fast is $0.15/s — [fal pricing](https://fal.ai/pricing)
- Cheaper or other models (third-party aggregators, low confidence): Wan 2.5 $0.05/s at 480p; Wan 2.7 $0.10/s at 720p and $0.15/s at 1080p; Wan 3.0 $0.05–0.20/s; LTX-2 $0.06/s at 1080p (another source says LTX-2.3 is $0.08/s); Seedance 2.5 Flash about $0.13/s at 480p and $0.30/s at 720p; older Seedance Lite about $0.018/s on Replicate — [kreatorflow](https://kreatorflow.ai/ai-video-api-pricing); [fal Seedance 2.5](https://fal.ai/seedance-2.5); [teamday](https://www.teamday.ai/blog/ai-api-pricing-comparison-2026); [ofox](https://ofox.ai/blog/fal-ai-alternatives-video-generation-api-2026/)
- Official Kling API, Kling 3.0: $0.084/s at 720p and $0.112/s at 1080p without audio (Oct 30, 2026) — [kreatorflow](https://kreatorflow.ai/ai-video-api-pricing)

### Inferences
- A 15–20 s wedding video built from 3–4 template clips costs about $0.60–2.00 in COGS. Retries and failed outputs typically add 30–100%.

### Gaps
- Hailuo template pricing and PiAPI effect prices were not verified. The live PixVerse effects price and the Wan 2.5/2.6 and LTX prices on fal were not confirmed from fal pages (404s or timeouts).

## Getting from 5–10 s clips to 15–20 s

### Takeaway
Combine options: (a) chain 2–4 template clips from the same photo (e.g. dreamy_wedding, then petal_scattered, then love_story) and stitch them; (b) use the extend endpoints (PixVerse has an "Extend" endpoint on fal) or a start/end-frame "transition" endpoint, seeded from the last frame; (c) wrap one AI clip in deterministic motion graphics such as Ken Burns, names, a date and music, which cost almost nothing.

### Cited Findings
- PixVerse Extend and Transition (start/end frame) endpoints exist on fal — [fal pricing](https://fal.ai/pricing); [fal PixVerse transition](https://fal.ai/models/fal-ai/pixverse/v5.5/transition)
- Kling effects support 10 s output — [fal Kling effects API](https://fal.ai/models/fal-ai/kling-video/v1.6/standard/effects/api)

### Inferences
- The cheapest reliable recipe: one or two template clips ($0.20–0.60) plus FFmpeg/Remotion overlays with a title card, names and music. This avoids identity drift that compounds over chained extends.

### Gaps
- No source measured identity drift across chained extends.

## Why they sell and how they're marketed

### Takeaway
They sell on emotion (couples, deceased relatives, nostalgia), novelty, and input that takes one photo with no prompt. Paid Meta and TikTok ads that show before/after samples drive sales.

### Cited Findings
- Forbes (Jan 2025): over 2,500 Meta ads for AI kissing apps (about 1,000 active) and about 1,200 AI hugging app ads. About 1,000 TikTok ads ran in the EU, and TikTok removed them after Forbes asked — [Forbes](https://www.forbes.com/sites/rashishrivastava/2025/01/16/ai-kissing-apps-are-taking-deepfakes-mainstream/) (search snippet only; the page returned 403)
- Google Ads Transparency lists about 1,000 creatives in India from the Hangover Studios advertiser — (search snippet citing [ThePrint](https://theprint.in/tech/upload-anyones-pic-ai-will-make-intimate-video-of-you-kiss-hug-apps-test-indias-it-rules/3024195/))
- Example ad for MOVA AI Hugs on TikTok — [pipiads](https://www.pipiads.com/tiktok-ads-examples/movaaihugsvideofilter-tiktok-ads-1818205554126946)
- Template virality: more than 10B views for PixVerse effect trends — [KrASIA](https://www.kr-asia.com/aisphere-touts-pixverse-as-the-canva-for-video-generation-and-lands-the-funding-to-prove-it)

### Inferences
- makeadreels getting zero generations fits the template thesis: a blank prompt box is friction, while a named template ("Dreamy Wedding") with a sample video shows the outcome before upload.

### Gaps
- No a16z data was collected this session.

## Quality, identity, moderation and consent risks

### Takeaway
Real-face couple effects are a deepfake and non-consensual intimate imagery (NCII) vector. Regulators (India's IT Rules, Feb 2026) and ad platforms (TikTok's consent rule) are tightening. A wedding product needs consent attestation, AI labels, and prefers the couple's own joint photo.

### Cited Findings
- India's amended IT Rules took effect 20 Feb 2026. Synthetic video must be labelled, with metadata where feasible. One tested app had no label, did no consent check on the partner's face, and its age ratings were inconsistent (12+ or 3+). Uploads reportedly stayed accessible after account deletion. Non-consensual use may fall under the IT Act and the Bharatiya Nyaya Sanhita (BNS) — [ThePrint](https://theprint.in/tech/upload-anyones-pic-ai-will-make-intimate-video-of-you-kiss-hug-apps-test-indias-it-rules/3024195/)
- TikTok requires advertisers to get consent from people depicted, even in AI ads. Meta allows kissing and hugging ads but bans non-consensual sexual content — [Forbes](https://www.forbes.com/sites/rashishrivastava/2025/01/16/ai-kissing-apps-are-taking-deepfakes-mainstream/) (via snippet)

### Gaps
- No quantitative identity-preservation benchmarks were found.

# Template-based (non-generative) wedding video vs generative AI video

Research date: 2026-11-27. Per-render figures marked "calc" are my own arithmetic from the cited list prices, for a 30 s 9:16 video.

## 1. Options and prices (Remotion, Creatomate, Shotstack, JSON2Video, Plainly, Placid, Bannerbear, Templated.io, self-hosted)

### Takeaway
Hosted template APIs cost roughly $0.08 to $3 per 30 s render. Shotstack, Creatomate and JSON2Video are the cheapest at about $0.08 to $0.16. Remotion is free for companies of up to 3 people. Above that size it costs $0.01 per render with a $100 monthly minimum, plus about $0.01 to $0.02 of AWS Lambda compute per short render. That makes Remotion the cheapest and most controllable option for a React team.

### Cited Findings
**Remotion**
- The Free License covers "individuals and companies of up to 3 people", with all features and unlimited commercial use — [Remotion pricing](https://www.remotion.dev/docs/license/pricing)
- The Company License for "Automators" costs "$0.01 per render, charged in increments of 1000 renders ($10)", with a **$100 monthly minimum**. It explicitly covers automated video products such as video editors, prompt-to-video apps and embedding the Remotion Player. Developers on automation projects do not need a seat — [Remotion pricing](https://www.remotion.dev/docs/license/pricing)
- The "Creators" licence is $25 per month per seat. Enterprise starts at $500 per month and includes the "Editor Starter" — [Remotion pricing](https://www.remotion.dev/docs/license/pricing)
- The pricing page does not explicitly address end users customising templates in a SaaS. The Automators tier is the one aimed at "automated video products" — [Remotion pricing](https://www.remotion.dev/docs/license/pricing)
- Lambda cost examples (2048 MB, us-east-1, Remotion 4.0.381): Hello World $0.001 in 7.6 s. A 1 min local video **$0.017 in 18.9 s** (warm). A 10 min HD video $0.103 in 56 s. A 10 s 4K clip $0.013 in 45 s. These exclude bandwidth, storage, logs and licensing — [Remotion Lambda cost example](https://www.remotion.dev/docs/lambda/cost-example)

**Creatomate**
- Essential is $45 per month for 2,000 credits, Growth $108 per month for 10k+ credits (adds the Embed & Preview SDK), and Beyond $274 per month for 50k+ credits — [Creatomate pricing](https://creatomate.com/pricing)
- A "Short" is a 30 s vertical 720p video at 25 fps and costs 6.91 credits, so Essential covers about 289 Shorts. The page gives no 1080p multiplier. The free trial is 50 credits with a 480 px preview cap. There is no statement on render speed or white-label use — [Creatomate pricing](https://creatomate.com/pricing)
- calc: about **$0.155 per 30 s 720p Short** on Essential. 1080p will cost more (multiplier unknown).

**Shotstack**
- Pay as you go is $10 for 50 min, which is **$0.20/min**. Starter is $39/mo for 250 min ($0.156/min, 1080p max). Pro is $99/mo for 750 min ($0.132/min, 4K). Scale is $199/mo for 2,000 min ($0.10/min). Volume is $499/mo for 10,000 min ($0.05/min). Minutes are counted per second and rounded down — [Shotstack pricing](https://shotstack.io/pricing/)
- New sign-ups get 10 free credits for 30 days plus a free sandbox. The white-label editor is included on every option and is "source-available under a PolyForm Shield License" — [Shotstack pricing](https://shotstack.io/pricing/)
- Shotstack also resells AI generation. A 5 s MiniMax H3 768p clip costs 38¢, a GPT Image 2.5 image 7¢, and 1 min of Lyria 3.5 music 13¢ — [Shotstack pricing](https://shotstack.io/pricing/)
- calc: a 30 s render costs **$0.05 to $0.10**.

**JSON2Video**
- The free tier is 600 credits with a watermark. Each second of video uses one credit. Prepaid plans are $49.95 for 7,200 credits (120 min) and $99.95 for 15,600 credits, with no watermark and no expiry. Subscriptions are Hobby $199.50/yr (50 min/mo), Professional $49.95/mo (200 min/mo) and Startup $99.95/mo (500 min/mo) — [JSON2Video pricing](https://json2video.com/pricing/)
- calc: about $0.10 to $0.21 per 30 s video.

**Plainly (After Effects templates)**
- Starter is $69/mo for 50 render minutes with 2 concurrent renders. Explorer is $134 for 100 min, Team $259 for 200 min, Pro $649 for 600 min, and Unlimited starts at $1,500/mo. Yearly billing is up to 30% off. There is a 14-day trial. Output goes up to 4K. Exported seconds are counted, not render time. No overage or white-label terms are shown — [Plainly pricing](https://www.plainlyvideos.com/pricing)
- calc: about **$0.69 per 30 s video** on Starter.

**Bannerbear**
- Automate is $49/mo for 1,000 API credits. Scale is $149/mo for 10k credits and Enterprise $299/mo for 50k. Animations cost **2 credits per second**, and 60 fps doubles that. The trial is 30 credits — [Bannerbear pricing](https://www.bannerbear.com/pricing/)
- calc: 60 credits per 30 s, about **$2.94** on Automate or about $0.89 on Scale.

**Templated.io**
- Starter is $39/mo for 1k credits, Scale $99/mo for 5k credits (includes the **white-label embedded editor**), and Enterprise $229/mo for 25k. Video credits are calculated as W×H×FPS×seconds / 50,000,000, so 1080p, 30 fps, 10 s costs 13 credits. The trial is 50 credits — [Templated pricing](https://templated.io/pricing/)
- calc: 1080×1920, 30 fps, 30 s is about 37 credits, roughly $1.45 on Starter or $0.74 on Scale.

**Placid**
- Plans are Basic 500 credits/mo, Pro 2,500, Business 25,000 and VIP 100,000. Video costs 10 credits per 10 s, up to 1080p. Unused credits roll over up to 2x. Editor SDK and white-label are listed as features — [Placid pricing](https://placid.app/pricing)
- Dollar prices are Basic $19, Pro $39, Business $89 and VIP $249 per month. These come only from a third-party source, not the official page — [TrustRadius](https://www.trustradius.com/products/placid.app/pricing)
- calc: 30 credits per 30 s, about $1.14 on Basic.

**Self-hosted / deterministic HTML capture**
- Timecut overrides the page's time functions, snapshots each frame and pipes the frames to ffmpeg — [timecut GitHub](https://github.com/tungs/timecut)
- puppeteer-capture uses Chrome's experimental HeadlessExperimental CDP domain for frame-exact capture. It supports Linux and Windows. It is low adoption — [puppeteer-capture](https://github.com/alexey-pelykh/puppeteer-capture)
- HeyGen's HyperFrames is an HTML-to-video framework positioned against Remotion. Both drive headless Chrome deterministically — [HyperFrames vs Remotion](https://hyperframes.heygen.com/guides/hyperframes-vs-remotion)

### Inferences
- At 1,000 renders a month, cost runs from about $100 (Remotion licence floor plus about $10 to $20 Lambda) to $45 to $100 (Creatomate or Shotstack). Plainly or Bannerbear would cost $300 to $3,000. Below about 3 people the Remotion licence is $0.
- Remotion also fits the existing React 19 + Vite stack. The templates are React components, and the Remotion Player can give users a live in-browser preview with no render cost.
- Hosted JSON-template APIs mean rebuilding templates in each vendor's editor format. That is vendor lock-in, and it means the existing code templates cannot be reused.
- Plainly is the only route to AE-grade designer assets (stock wedding packs from Envato/Motion Array), but its per-minute price is 4 to 7 times that of the others.

### Gaps
- Remotion LICENSE.md and FAQ were not fetched, so whether "end-user customisation" carries any extra condition is unconfirmed. Read https://www.remotion.dev/docs/license/faq.
- I found no published render-speed numbers for Creatomate, Shotstack, JSON2Video, Placid or Templated.
- Creatomate's 1080p credit multiplier is not published on the pricing page.
- I did not price Motion Canvas (MIT open source, no render cloud) or Railway CPU cost for self-hosted Chrome+ffmpeg renders.

## 2. Quality for "premium wedding" output (Ken Burns, 2.5D parallax, particles, petals, gold foil, light leaks, kinetic type, Indic text shaping)

### Takeaway
Template compositing can get close to "premium" output with Ken Burns, 2.5D depth parallax, overlay assets (petals, light leaks, foil, which are best used as pre-rendered alpha or screen-blend video loops) and kinetic typography. Indic script shaping is the main technical trap. Browser-based renderers (Remotion or HTML capture) handle it naturally. Raw ffmpeg drawtext has a long history of broken Devanagari.

### Cited Findings
- DepthFlow is an open-source tool that turns an image into 2.5D parallax video using Depth Anything V2 — [DepthFlow GitHub](https://github.com/lloydjf/DepthFlow); [HF Space README](https://huggingface.co/spaces/BrokenSource/DepthFlow/blob/main/README.md?code=true)
- Depth Anything V2 Small runs in the browser via transformers.js/ONNX plus WebGPU. Layers at different Z depths create cinematic parallax — [dev.to](https://dev.to/martindelophy/building-cinematic-depth-in-the-browser-with-depth-anything-v2-small-and-webgpu-1k07)
- The core 2.5D shader trick displaces the UVs of near pixels more than far pixels, using a greyscale depth texture — [freefrontend](https://freefrontend.com/code/halloween-2-5d-parallax-shader-2026-05-07/); a related Three.js relighting technique uses depth maps — [Codrops](https://tympanus.net/codrops/2026/08/19/relighting-images-with-depth-maps-and-three-js/)
- FFmpeg ticket #9200 reports that drawtext with Hindi fonts does not render some characters properly — [FFmpeg trac #9200](https://trac.ffmpeg.org/ticket/9200)
- Indic subtitles broke when libass lacked harfbuzz ("cannot be fixed in FFmpeg") — [FFmpeg-trac #8738](https://ffmpeg.org/pipermail/ffmpeg-trac/2020-June/054645.html)
- Since 6.1, drawtext requires `--enable-libharfbuzz`. A 2023 commit "improve glyph shaping and positioning" added a `text_shaping` option — [FFmpeg cvslog 2023](https://lists.ffmpeg.org/pipermail/ffmpeg-cvslog/2023-June/137892.html); [Arch bug 80327](https://bugs.archlinux.org/task/80327)

### Inferences
- In a Remotion or Chrome-based renderer, text is shaped by Chrome's own HarfBuzz stack. Devanagari, Tamil, Telugu and similar scripts with Noto or Google Fonts should render the way they already do in the owner's HTML invitations. This is a strong reason to prefer the browser route over ffmpeg drawtext. I have no primary source for this; it is based on how Chromium works.
- If ffmpeg is used for text, pre-render text cards as PNG from the browser, or use ASS via a libass built with harfbuzz, rather than drawtext.
- Remotion can drive a depth-displacement shader per frame (Three.js via @remotion/three, or a WebGL canvas) from a depth map computed once on the server. That gives "3D camera" parallax for a few cents or less. Edge stretching artefacts around hair and edges are the known weakness of single-image depth parallax.
- Petals, light leaks and gold glints are most cheaply done as licensed stock overlay loops (ProRes 4444 or WebM with alpha, or screen-blend MP4). Shader or canvas particles in Remotion are also possible. "Gold foil" text is best done as an animated gradient or texture mask on SVG text.

### Gaps
- I found no source benchmarking the visual quality of template output against AI video for weddings, and no user-preference data.
- I did not verify Remotion-specific Indic font issues (for example font loading timing in Lambda). The owner should test `@remotion/google-fonts` with Noto Sans Devanagari and Tamil.

## 3. Hybrid: one short AI clip inside a template reel

### Takeaway
A hybrid is technically simple: generate a 5 s image-to-video clip of the couple photo for about $0.35 to $0.40 and drop it into a template as a video layer. Shotstack even sells AI clips inside its render API. I found no named wedding product documenting this exact pattern.

### Cited Findings
- Kling 2.5 Turbo Pro image-to-video on fal costs **$0.07/second**, so a 5 s clip is about $0.35. This comes from aggregators that cite fal's pricing page — [teamday fal pricing Nov 2026](https://www.teamday.ai/blog/fal-ai-pricing-2026); [pricepertoken](https://pricepertoken.com/fal-ai-pricing)
- Shotstack bundles AI generation into the same credit system as template renders, for example a 5 s MiniMax H3 768p clip for 38¢ — [Shotstack pricing](https://shotstack.io/pricing/)

### Inferences
- A cost model for a hybrid 20 s reel: one 5 s AI clip ($0.35) plus a template render ($0.01 to $0.16) plus optional stylised first frame ($0.04). That totals about **$0.40 to $0.60**, against $1.50 to $3+ for a fully generative 15 to 20 s reel at similar per-second rates.
- The AI clip is the only part with identity-drift risk. Keep it short (3 to 5 s), use "subtle motion" prompts, and always keep a Ken Burns or parallax fallback if the user rejects it.

### Gaps
- I did not confirm Vidu pricing on fal or official Kling pricing directly.
- I found no case studies or Reddit reports from wedding or invite apps shipping this hybrid.

## 4. Background removal / segmentation and AI stylisation

### Takeaway
Background removal is nearly free (BiRefNet or rembg, billed per compute-second on fal or self-hostable). Stylised first frames via Flux Kontext or Nano Banana cost about $0.04 per image. Identity fidelity is claimed by the vendors but not quantified.

### Cited Findings
- fal BiRefNet v2 is billed per compute second, and the page shows no fixed per-image price — [fal birefnet v2](https://fal.ai/models/fal-ai/birefnet/v2)
- FLUX.1 Kontext [pro] on fal costs **$0.04 per image**. It claims character consistency across edits without fine-tuning, but publishes no metrics — [fal flux-pro/kontext](https://fal.ai/models/fal-ai/flux-pro/kontext)
- Nano Banana is about $0.039 to $0.04 per image on fal. One third-party tool lists Nano Banana 2.1 Edit at $0.044 to $0.065 at 1K. Sources disagree — [apiframe](https://apiframe.ai/blog/fal-ai-pricing); [assetlab](https://assetlab.coastalcreativelab.com/models/)
- Bannerbear's video tools include "removing a background" for 2 credits — [Bannerbear pricing](https://www.bannerbear.com/pricing/)

### Inferences
- A cut-out couple composited into a mandap or floral-frame scene, with parallax between layers, gives a strong "designed" look with zero identity risk, because it uses real pixels. Stylisation (caricature or watercolour) does carry identity risk, so offer it as an opt-in with preview and regenerate.
- rembg or BiRefNet can run on CPU in the Go backend's sidecar, but GPU is much faster. fal per-call cost is likely well under a cent for 1 to 3 photos. This is unverified.

### Gaps
- I found no exact fal BiRefNet per-image cost and no Depth Anything price on fal.
- I found no independent identity-fidelity benchmarks for Kontext, GPT-image or Nano Banana on South Asian faces.

## 5. Reusing existing HTML/CSS/SVG invitation templates for video

### Takeaway
Yes. Either port the templates to Remotion compositions (React, frame-driven animation) or capture the existing pages deterministically (timecut or a virtual-time approach) and pipe the frames to ffmpeg. Plain real-time screencast is not suitable for production.

### Cited Findings
- Real-time screencasts have variable frame timing and are not reproducible. Deterministic capture steps the page frame by frame — [puppeteer-capture README](https://cdn.jsdelivr.net/npm/puppeteer-capture@1.58.0/README.md); [screenshotone blog](https://screenshotone.com/blog/how-to-record-videos-with-puppeteer/)
- Timecut overrides JS time functions and feeds the snapshots to ffmpeg — [timecut](https://github.com/tungs/timecut)
- Headless deterministic HTML/CSS animation to MP4 is covered in [dev.to dsplce](https://dev.to/dsplce-co/htmlcss-animation-to-video-mp4-the-headless-deterministic-way-incl-claude-4a2) and [HeyGen HyperFrames](https://www.heygen.com/research/html-to-video)

### Inferences
- **Pros of Remotion:** the owner's React skills transfer directly, and the existing JSX, CSS and SVG largely carry over. Animations must be rewritten to use `useCurrentFrame()` and `interpolate` instead of CSS keyframes. You get correct Indic shaping and the free in-browser Player for previews. Rendering can run on Lambda or in a Docker container on Railway.
- **Cons of Remotion:** the licence fee once the team has more than 3 people, a Chrome-per-render memory footprint on Railway, and CSS transitions and animations are not frame-deterministic without the rewrite.
- **Pros of Puppeteer or timecut:** no rewrite of CSS animations.
- **Cons of Puppeteer or timecut:** brittle tooling (experimental CDP, small maintainers), and video, WebGL and audio sync are harder. Remotion solves these.

### Gaps
- I did not benchmark Railway render times or memory for Chromium+ffmpeg on a 30 s 1080×1920 composition.

## 6. Music licensing for wedding reels

### Takeaway
Bollywood tracks are unsafe for a business-generated reel. The Instagram in-app library is licensed for personal, non-commercial use. Zee v. Nykaa (Delhi HC) shows labels are enforcing against brands. Ship royalty-free or commercially licensed tracks, or let users add Instagram's own audio after export on their personal account.

### Cited Findings
- Instagram's music library is licensed for personal, non-commercial use. Business accounts are limited to the Meta Sound Collection — [foximusic guide](https://www.foximusic.com/blog/instagram-reels-music-copyright-legal-guide/) (vendor source)
- In Zee Entertainment v. Nykaa (Delhi HC), Zee sought INR 2 crore over Bollywood tracks in promotional reels, and Nykaa reportedly removed 12 reels — [Intepat](https://www.intepat.com/blog/blog-zee-nykaa-music-copyright-instagram-india); [Chambers](https://chambers.com/articles/commercial-use-of-music-on-social-media-analyzing-the-zee-entertainment-v-nykaa-copyright-infringe)
- Copyright analysis looks at the purpose of use, not the account type — [Gala Law](https://blog.galalaw.com/post/102mtty/zee-v-nykaa-india-what-every-brand-and-their-counsel-needs-to-know-about-musi)
- Saregama sells per-post business licences tied to an Instagram account, valid only on Instagram and Facebook — [Saregama business FAQ](https://business.saregama.com/faq)
- Hoopr offers Bollywood and regional tracks cleared for commercial use — [exchange4media](https://www.exchange4media.com/media-others-news/rs-900-cr-in-lost-royalties-the-hidden-cost-of-unlicensed-reel-audio-in-branded-content-149424.html)
- Shotstack offers AI music (Lyria 3.5) at 13¢ per minute — [Shotstack pricing](https://shotstack.io/pricing/)

### Inferences
- The safest product design is to bundle a curated royalty-free or AI-generated instrumental library (shehnai, sitar, nadaswaram moods). Also offer an "export silent, add a trending song in Instagram" option. On a personal account that sits within Meta's own licence, which is personal-use by design.

### Gaps
- I did not fetch exact prices for Epidemic Sound, Artlist or Hoopr API and SaaS-embedding licences. Platform-embedding (sublicensing to end users) usually needs an enterprise deal.
- The outcome of the Zee v. Nykaa case is unconfirmed.

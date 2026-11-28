# Video renderer

Turns wedding details into vertical MP4s (1080 × 1920, 30 fps, H.264) for WhatsApp and Instagram, using [Remotion](https://www.remotion.dev). It is separate from the web app and is not part of the deployed Docker image.

- `src/engine/` holds generic, frame-driven pieces: photo motion, petals, text reveals, light sweeps, scene fades and QR codes. None of it is wedding-specific, so other products (for example makeadreels ad reels) can reuse it.
- `src/wedding/` holds the wedding compositions: a 15-second save-the-date and a 30-second invitation. They reuse the planner's SVG art from `web/src/invitation/art.tsx`.

## Run it

```sh
cd video
npm install
npm run studio                 # preview and scrub every composition at http://localhost:3000
npm run render                 # render every sample to out/*.mp4
npm run render -- invite-hindi # render one composition
npm run render -- invite-english --photo ~/couple.jpg --props my-wedding.json
npm run render -- --stills     # key frames as PNGs, for checking layouts
```

`--props` takes a JSON file with any fields of `WeddingVideoProps` (`src/wedding/types.ts`) to override. `--photo` copies a photo into `public/` (git-ignored) and uses it.

Rendering needs headless Chrome. On Ubuntu 22.04 (including WSL) it needs these libraries first:

```sh
sudo apt-get install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon0 libgbm1 libasound2 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libpango-1.0-0 libcairo2 libatspi2.0-0
```

## Indian scripts

Text is laid out by Chrome, so Devanagari, Tamil and Telugu shape correctly. Conjuncts and matras stay together, which ffmpeg's `drawtext` does not guarantee. The samples cover Hindi, Tamil and Telugu. Two rules keep this working:

- Wide letter-spacing is applied only to Latin text (`tracking` in `src/wedding/parts.tsx`), because spacing pulls Indic letters apart.
- Letter-by-letter reveals split text by grapheme, not by code point.

The Hindi, Tamil and Telugu labels in `src/wedding/samples.ts` are first drafts. A native speaker should review them before families see them.

## Numbers from the first renders

These were measured on a 16-core machine.

| Video | Render time | File size |
| --- | --- | --- |
| 30 s invitation | about 30 s | 4.4–5.2 MB |
| 15 s save-the-date | about 15 s | 2.2–2.6 MB |

Both are well under WhatsApp's 16 MB limit.

## Licence

Remotion is free for individuals and companies with up to three people. Larger companies need a company licence. Check [remotion.dev/license](https://www.remotion.dev/license) before deploying commercially.

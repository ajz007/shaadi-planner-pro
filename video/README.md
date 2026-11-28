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
npm run deploy:lambda          # publish to AWS Lambda (see below; normally done by GitHub Actions)
```

`--props` takes a JSON file with any fields of `WeddingVideoProps` (`src/wedding/types.ts`) to override. `--photo` copies a photo into `public/` (git-ignored) and uses it.

Rendering needs headless Chrome. On Ubuntu 22.04 (including WSL) it needs these libraries first:

```sh
sudo apt-get install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon0 libgbm1 libasound2 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libpango-1.0-0 libcairo2 libatspi2.0-0
```

## In the planner: WhatsApp videos

Organizers make videos from the **Publish** step of the invitation studio (`web/src/studio/WhatsAppVideo.tsx`). Videos come with the Family Pass. Rendering runs on **AWS Lambda** with Remotion, so there is nothing to pay for while no one is making a video.

1. **The request.** The Go app (`internal/workspace/workspace_video.go`) snapshots the *published* invitation: names, guest-visible functions and venues, design and chosen language. It starts a render of the `planner-save-the-date` or `planner-invite` composition through Remotion's Go SDK (`workspace_video_lambda.go`). `src/wedding/snapshot.ts` maps the snapshot to video props.
2. **The photo.** The couple photo isn't sent with the request. The render fetches it from the app at `/api/video-photo/<token>`, using a one-time link that stops working when the render ends. Photos are never copied into S3.
3. **The progress.** While the studio is open it polls every few seconds. Each poll asks Lambda how the render is going and records the finished file in `wedding_videos`. A render that hasn't finished after 15 minutes is marked failed.
4. **The file.** MP4s stay under `renders/` in the private `spp-video-…` S3 bucket and are deleted after 30 days.
   - Playing and downloading redirect to a 15-minute signed S3 link.
   - Sharing on a phone streams the file through the app, so the browser can hand it to WhatsApp.

One video goes to every guest, so it carries no personal RSVP link. Its last screen asks guests to reply using the link they were sent.

## Deploying to AWS Lambda

Lambda runs in the app's region (`us-west-1`, where the shop bucket is). Remotion supports it, and it only adds about a second to downloads from India. All AWS resources are named `spp-video-*`.

`aws/README.md` has the one-time setup:
- a role for the function;
- a deploy user for GitHub Actions;
- two statements for the app's existing user;
- the GitHub secrets.

The IAM policies are in `aws/`.

**Deploys.** `.github/workflows/video-lambda.yml` runs `scripts/deploy-lambda.mjs` on pushes to `main` that change `video/` or the shared invitation art. The script:
- creates or updates the `spp-video-<account>-<region>` bucket: no ACLs, only `sites/` public, `renders/` deleted after 30 days;
- deploys `spp-video-render-<remotion version>`;
- uploads the compositions.

The job summary prints the `SHAADI_VIDEO_*` values for the app. Pull requests only typecheck.

To deploy by hand with the deploy user's credentials: `AWS_REGION=us-west-1 npm run deploy:lambda`.

### Cost

- There is no cost while idle.
- A render is roughly $0.01–0.02 of Lambda time. The AWS free tier (400,000 GB-seconds a month) likely covers hundreds of videos a month.
- S3 storage for 30 days of renders costs pennies.
- Check the real cost in AWS Cost Explorer after the first week.

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

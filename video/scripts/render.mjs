// Renders wedding videos to MP4.
//
//   npm run render                              all sample compositions
//   npm run render -- invite-hindi              one composition
//   npm run render -- invite-english --photo ~/couple.jpg --props my-wedding.json
//   npm run render -- --stills                  key frames as PNGs, for checking layouts
//
// --props takes a JSON file with any WeddingVideoProps fields to override.
// --photo copies a local photo into public/ (git-ignored) and uses it.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { bundle } from '@remotion/bundler'
import { renderMedia, renderStill, selectComposition, getCompositions } from '@remotion/renderer'
import { webpackOverride } from '../webpack-override.mjs'

const args = process.argv.slice(2)
const option = name => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined }
const flag = name => { const i = args.indexOf(name); return i >= 0 ? (args.splice(i, 1), true) : false }

const stills = flag('--stills')
const propsFile = option('--props')
const photo = option('--photo')
const overrides = propsFile ? JSON.parse(readFileSync(propsFile, 'utf8')) : {}
if (photo) {
  const name = 'local-photo' + path.extname(photo).toLowerCase()
  copyFileSync(photo, path.join('public', name))
  overrides.photo = name
}

mkdirSync('out', { recursive: true })
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts'), webpackOverride })
const all = await getCompositions(serveUrl, { inputProps: overrides })
const wanted = args.length ? all.filter(c => args.includes(c.id)) : all
if (!wanted.length) throw new Error('No composition matches. Available: ' + all.map(c => c.id).join(', '))

for (const { id } of wanted) {
  const composition = await selectComposition({ serveUrl, id, inputProps: overrides })
  const inputProps = { ...composition.defaultProps, ...overrides }
  if (stills) {
    const frames = id.startsWith('invite') ? [60, 250, 470, 690, 860] : [70, 230, 420]
    for (const frame of frames) {
      const output = `out/${id}-${frame}.png`
      await renderStill({ composition, serveUrl, output, frame, inputProps })
      console.log('wrote', output)
    }
    continue
  }
  const output = `out/${id}.mp4`
  const started = Date.now()
  let shown = -1
  await renderMedia({
    composition, serveUrl, codec: 'h264', outputLocation: output, inputProps,
    // WhatsApp re-encodes anything large; a moderate CRF keeps files small
    // while staying sharp on phones.
    crf: 23, pixelFormat: 'yuv420p', x264Preset: 'medium',
    onProgress: ({ progress }) => {
      const tenth = Math.floor(progress * 10)
      if (tenth > shown) { shown = tenth; process.stdout.write(`${id} ${tenth * 10}%\n`) }
    },
  })
  console.log(`wrote ${output} in ${((Date.now() - started) / 1000).toFixed(1)}s`)
}

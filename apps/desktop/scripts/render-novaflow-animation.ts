/** Generate the NovaFlow particle atlas consumed by the existing home animation renderer. */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'

/**
 * Sample the supplied sail silhouette and animate its points gathering, floating and dispersing.
 * @returns Completion after the lossless radius/opacity atlas has been written.
 */
export async function renderNovaFlowAnimation(): Promise<void> {
  const root = new URL('../../../', import.meta.url)
  const svg = await readFile(new URL('apps/desktop/resources/novaflow/mark.svg', root), 'utf8')
  const mask = await sharp(Buffer.from(svg)).resize(128, 128).ensureAlpha().raw().toBuffer()
  const width = 192, height = 108, columns = 12, frames = 137
  const atlasWidth = width * columns, atlasHeight = height * Math.ceil(frames / columns)
  const pixels = Buffer.alloc(atlasWidth * atlasHeight * 4)
  // The renderer interprets red as radius and green as coverage, not visible color.
  for (let frame = 0; frame < frames; frame++) {
    const progress = frame / (frames - 1)
    const assembly = Math.max(0, 1 - progress / 0.3) ** 3
    const dispersal = Math.max(0, (progress - 0.72) / 0.28) ** 2
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        const alpha = mask[(y * 128 + x) * 4 + 3]!
        if (alpha < 64) continue
        const phase = x * 0.73 + y * 1.17
        const scatter = assembly * 22 + dispersal * 30
        const px = Math.round(96 + (x - 64) * 1.35 + Math.sin(phase) * scatter + dispersal * 14)
        const py = Math.round(54 + (y - 65) * 1.35 + Math.cos(phase * 1.3) * scatter
          + assembly * 12 - Math.sin(progress * Math.PI * 2 + x * 0.035) * 1.2 - dispersal * 8)
        if (px < 0 || px >= width || py < 0 || py >= height) continue
        const at = ((Math.floor(frame / columns) * height + py) * atlasWidth + (frame % columns) * width + px) * 4
        pixels[at] = 76
        pixels[at + 1] = Math.max(pixels[at + 1]!, Math.round(alpha * (1 - dispersal)))
        pixels[at + 3] = 255
      }
    }
  }
  const output = await sharp(pixels, { raw: { width: atlasWidth, height: atlasHeight, channels: 4 } })
    .webp({ lossless: true, effort: 6 }).toBuffer()
  await writeFile(new URL('packages/client/ui-brand-official/src/client/assets/novaflow-atlas.webp', root), output)
  console.info(`NovaFlow animation: ${frames} frames, ${output.length} bytes`)
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) await renderNovaFlowAnimation()

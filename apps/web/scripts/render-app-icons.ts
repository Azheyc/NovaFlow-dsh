/** Render web installation icons from the NovaFlow desktop tile. */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertNever } from '@deepseek-ai/dsh-util-values'

/** Square vector tile shared with the desktop application. */
export const TILE_SOURCE = fileURLToPath(new URL('../../desktop/resources/icon.svg', import.meta.url))
/** Directory containing the committed installation icons. */
export const ICON_OUTPUT_DIRECTORY = fileURLToPath(new URL('../public/', import.meta.url))
/** Artwork scale that preserves the complete mark under circular launcher masks. */
export const MASKABLE_ARTWORK_SCALE = 0.82
/** Radius guaranteed to remain visible under a platform mask, relative to the tile edge. */
export const MASKABLE_SAFE_RADIUS_RATIO = 0.4

/** One installation icon served by the manifest or an HTML link. */
export interface AppIconVariant {
  /** File name inside public/. */
  readonly file: string
  /** Square edge in pixels. */
  readonly size: number
  /** Whether to shrink the artwork into the platform safe zone. */
  readonly kind: 'tile' | 'maskable'
}

/** PNG sizes required by web launchers and iOS. */
export const APP_ICON_VARIANTS: readonly AppIconVariant[] = [
  { file: 'icon-192.png', size: 192, kind: 'tile' },
  { file: 'icon-512.png', size: 512, kind: 'tile' },
  { file: 'icon-maskable-512.png', size: 512, kind: 'maskable' },
  { file: 'apple-touch-icon.png', size: 180, kind: 'tile' },
]

/**
 * Validate the shared tile, keeping its opaque background.
 * @param source - Complete 1024-unit SVG tile.
 * @returns The validated document.
 */
export function tileDocument(source: string): string {
  const trimmed = source.trim()
  if (!/^<svg\b[^>]*viewBox="0 0 1024 1024"/u.test(trimmed)) throw new Error('app icons: no square tile root element')
  if (!trimmed.includes('<g id="brand-glyph">')) throw new Error('app icons: no artwork group')
  // Launcher icons supply their own platform mask and require opaque corners.
  return trimmed.replace('<rect width="1024" height="1024" rx="160"', '<rect width="1024" height="1024"')
}

/**
 * Scale only the mark so platform masks retain all three sails.
 * @param source - Complete SVG tile.
 * @returns A maskable tile with the same opaque background.
 */
export function maskableDocument(source: string): string {
  return tileDocument(source).replace('<g id="brand-glyph">',
    `<g id="brand-glyph" transform="translate(512 512) scale(${String(MASKABLE_ARTWORK_SCALE)}) translate(-512 -512)">`)
}

function documentForVariant(source: string, kind: AppIconVariant['kind']): string {
  switch (kind) {
    case 'tile': return tileDocument(source)
    case 'maskable': return maskableDocument(source)
    default: return assertNever(kind)
  }
}

/**
 * Rasterize each icon independently with supersampling for smooth small edges.
 * @param source - Complete SVG tile.
 * @returns PNG bytes and their installation variants.
 */
export async function renderAppIcons(source: string): Promise<readonly { variant: AppIconVariant; png: Buffer }[]> {
  const { default: sharp } = await import('sharp')
  return Promise.all(APP_ICON_VARIANTS.map(async (variant) => {
    const document = documentForVariant(source, variant.kind)
    const raster = await sharp(Buffer.from(document), { density: 72 * Math.max(1024, variant.size * 4) / 1024 }).png().toBuffer()
    const png = await sharp(raster).resize(variant.size, variant.size, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer()
    return { variant, png }
  }))
}

async function main(): Promise<void> {
  for (const { variant, png } of await renderAppIcons(await readFile(TILE_SOURCE, 'utf8'))) {
    await writeFile(resolve(ICON_OUTPUT_DIRECTORY, variant.file), png)
  }
  console.info(`app icons: wrote NovaFlow installation icons to ${ICON_OUTPUT_DIRECTORY}`)
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) await main()

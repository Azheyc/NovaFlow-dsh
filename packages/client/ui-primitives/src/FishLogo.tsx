import type { IconProps } from './icons/props.ts'
import { NOVAFLOW_LOGO_PATH, NOVAFLOW_TILE_PATH } from './brand-artwork.ts'

/** Square NovaFlow artwork extent; legacy export name retained for existing consumers. */
export const FISH_LOGO_VIEWBOX = { width: 1024, height: 1024 }

/** NovaFlow sail silhouette; legacy export name retained for existing consumers. */
export const FISH_LOGO_PATH = NOVAFLOW_LOGO_PATH

/**
 * Render the NovaFlow white mark on its black tile.
 * @param props - Requested square edge and layout class.
 * @returns Decorative brand artwork, hidden from assistive technology.
 */
export function FishLogo({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" className={className} aria-hidden="true">
      <path d={NOVAFLOW_TILE_PATH} fill="#000" />
      <path d={NOVAFLOW_LOGO_PATH} fill="#fff" />
    </svg>
  )
}

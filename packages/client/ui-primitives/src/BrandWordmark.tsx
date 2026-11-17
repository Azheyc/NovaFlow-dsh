import type { IconProps } from './icons/props.ts'
import { FishLogo } from './FishLogo.tsx'
import { NOVAFLOW_WORDMARK_PATH } from './brand-artwork.ts'

/** Display options for the NovaFlow wordmark. */
export interface BrandWordmarkProps extends IconProps {
  /** Whether to include the leading NovaFlow tile; defaults to true. */
  includeMark?: boolean | undefined
}

/**
 * Render the NovaFlow name, optionally with its supplied mark.
 * @param props - Height, layout class and leading-mark visibility.
 * @returns Decorative wordmark with a width proportional to its height.
 */
export function BrandWordmark({ size = 24, className, includeMark = true }: BrandWordmarkProps) {
  const width = includeMark ? 114 : 88
  return (
    <svg width={(size * width) / 24} height={size} className={className}
      viewBox={includeMark ? '0 0 114 24' : '26 0 88 24'} fill="none" aria-hidden="true">
      {includeMark && <FishLogo size={24} />}
      <path d={NOVAFLOW_WORDMARK_PATH} transform="translate(26 0)" fill="currentColor" />
    </svg>
  )
}

/** NovaFlow home animation using the original click and lifecycle behavior. */
import type { ReactNode } from 'react'
import type { HeroFrameOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { PixelWhale } from './home-whale/PixelWhale.tsx'

/**
 * Show the NovaFlow point animation only on the blank conversation home.
 * @param props - Home visibility and conversation content.
 * @returns The unchanged content with a noninteractive decorative layer.
 */
export function NovaFlowFrame({ hero, children }: HeroFrameOwnerProps & { children: ReactNode }) {
  return <PixelWhale hero={hero}>{children}</PixelWhale>
}

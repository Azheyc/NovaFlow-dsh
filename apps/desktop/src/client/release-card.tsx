import { useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives/src/Button.tsx'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives/src/Modal.tsx'
import { IconChevronLeftOutlineRegular, IconChevronRightOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives/src/icons/index.tsx'
import { ICON_ARTWORK, ICON_REGULAR_STROKE, iconSymbolId } from '@deepseek-ai/dsh-client-ui-primitives/src/icons/artwork.ts'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/base.css'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/gradient-shadow-text.css'
import type { ReleaseCardView } from '../release-card-view.ts'
import './release-card.css'

type Props = { view: ReleaseCardView; respond: (index: number) => void }

function ReleaseCard({ view, respond }: Props) {
  const columns = useRef<HTMLDivElement>(null)
  const [count, setCount] = useState(1)
  const [page, setPage] = useState(0)
  useLayoutEffect(() => {
    const element = columns.current
    if (!element) return
    const measure = (): void => {
      const width = element.clientWidth
      if (!width) return
      const total = Math.max(1, Math.round(element.scrollWidth / width))
      setCount(total)
      const current = Math.min(page, total - 1)
      setPage(current)
      element.scrollLeft = current * width
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [view.releaseNotes, page])
  const footer = <>
    {view.releaseNotes && count > 1 && view.pages && <nav className="release-pager" aria-label={view.releaseNotesLabel}>
      <Button size="sm" aria-label={view.pages.previous} title={view.pages.previous} disabled={page === 0}
        onClick={() => setPage(page - 1)}><IconChevronLeftOutlineRegular size={16} /></Button>
      <span aria-live="polite">{page + 1} / {count}</span>
      <Button size="sm" aria-label={view.pages.next} title={view.pages.next} disabled={page >= count - 1}
        onClick={() => setPage(page + 1)}><IconChevronRightOutlineRegular size={16} /></Button>
    </nav>}
    {view.buttons.map((label, index) => <Button key={index} variant={index === 0 ? 'primary' : 'outline'}
      onClick={() => respond(index)}>{label}</Button>)}
  </>
  return <Modal open title={view.message} description={view.detail} closeLabel={view.closeLabel} onClose={() => respond(view.cancelId)}
    className="release-card" contentClassName="release-content" footer={footer} backdropBlur={false}>
    {view.percent !== undefined && <div className="release-progress">
      <progress aria-label={view.message} max={100} value={view.percent} /><span>{Math.floor(view.percent)}%</span>
    </div>}
    {view.releaseNotes && <section className="release-notes" aria-label={view.releaseNotesLabel}>
      <h3>{view.releaseNotesLabel}</h3>
      <div ref={columns} className="release-columns">{view.releaseNotes.split(/\r?\n/u).map((line, index) => {
        const heading = /^#{1,6}\s+(.+)/u.exec(line)
        if (heading) return <h4 key={index}>{heading[1]}</h4>
        if (!line.trim()) return null
        return <p key={index}>{line.replace(/^[-*]\s+/u, '• ')}</p>
      })}</div>
    </section>}
  </Modal>
}

const container = document.createElement('div')
container.hidden = true
const sprite = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
sprite.setAttribute('width', '0')
sprite.setAttribute('height', '0')
sprite.setAttribute('aria-hidden', 'true')
sprite.classList.add('release-sprite')
const definitions = document.createElementNS(sprite.namespaceURI, 'defs')
for (const glyph of ['close-outline', 'chevron-left-outline', 'chevron-right-outline'] as const) {
  const artwork = new DOMParser().parseFromString(ICON_ARTWORK[glyph].svg(ICON_REGULAR_STROKE), 'image/svg+xml').documentElement
  artwork.id = iconSymbolId(glyph, 'regular')
  definitions.append(document.importNode(artwork, true))
}
sprite.append(definitions)
document.body.append(sprite)
document.body.append(container)
const root = createRoot(container)

/** Present the shell-owned update in the client's modal and button components. */
export function showReleaseCard(view: ReleaseCardView, respond: Props['respond']): void {
  root.render(<ReleaseCard key={view.releaseNotes ?? ''} view={view} respond={respond} />)
}

export function hideReleaseCard(): void { root.render(null) }

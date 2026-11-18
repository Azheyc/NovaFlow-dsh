import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DesktopUpdateSource } from './desktop-update-source.ts'
import css from './DesktopUpdateCheckRow.module.css'

interface DesktopUpdateCheckRowInjected {
  hooks: { desktopUpdate: DesktopUpdateSource['store'] }
  check(): void
}

/** Render the manual check action below the installed version. */
export function DesktopUpdateCheckRow({ useDesktopUpdate, check, t }:
  PropsRuntime<'settings.general.item'> & PropsLocale<'settings'> & InjectFace<DesktopUpdateCheckRowInjected>) {
  const { presentation, opening, failed } = useDesktopUpdate(value => value)
  const checking = presentation?.phase === 'checking'
  const busy = opening || (presentation?.configurationError === undefined
    && (checking || presentation?.phase === 'verifying' || presentation?.phase === 'installing'))
  return <div className={css.row}>
    {failed && <span className={css.error} role="alert">{t('desktop.update.checkFailed')}</span>}
    <Button variant="outline" disabled={busy} aria-busy={busy} onClick={check}>
      {t(checking ? 'desktop.update.checking' : 'desktop.update.check')}
    </Button>
  </div>
}

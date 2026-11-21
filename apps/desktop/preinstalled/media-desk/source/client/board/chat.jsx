import React from 'react'
import { ChatPanel } from '../chat.jsx'
import { setDesk } from '../desk.js'
import { t } from '../i18n.js'
import { IconButton } from '../ui.jsx'
import { call, report } from './api.js'

export function BoardChat({ canvas, beforeSend, onCanvasChanged }) {
  const [chat, setChat] = React.useState({ messages: [], running: false })
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState('')
  const actions = React.useRef(null)
  actions.current = { beforeSend, onCanvasChanged }
  React.useEffect(() => {
    let closed = false
    let timer
    async function poll() {
      try {
        const next = await call(`canvas/chat?id=${encodeURIComponent(canvas.id)}`)
        if (closed) return
        setChat(next)
        setError(next.error ?? '')
        if (next.revision) await actions.current.onCanvasChanged(next.revision)
      } catch (err) {
        if (!closed) setError(err.message)
      } finally {
        if (!closed) timer = setTimeout(poll, 1800)
      }
    }
    poll()
    return () => { closed = true; clearTimeout(timer) }
  }, [canvas.id])
  const send = async message => {
    setSending(true)
    try {
      await actions.current.beforeSend()
      await call('canvas/chat', { id: canvas.id, message, requestId: crypto.randomUUID() })
      setChat(previous => ({ ...previous, running: true }))
    } catch (err) { report(err); throw err }
    finally { setSending(false) }
  }
  return <aside className="md-dock" aria-label={t('画布助手')}>
    <ChatPanel intro={false} session={{ ...chat, running: chat.running || sending, send }} placeholder={t('描述要在画布上完成的工作')} top={error && <p role="alert">{error}</p>}
      head={<><h2>{t('画布助手')}</h2><span style={{ flex: 1 }} />{chat.running && <button type="button" onClick={() => call('canvas/chat/cancel', { id: canvas.id }).catch(report)}>{t('停止')}</button>}<IconButton icon="close" label={t('收起对话')} onClick={() => setDesk({ dockOpen: false })} /></>} />
  </aside>
}

import React from 'react'
import { ChatPanel } from '../chat.jsx'
import { setDesk } from '../desk.js'
import { t } from '../i18n.js'
import { Icon, IconButton } from '../ui.jsx'
import { call, report } from './api.js'
import { boardWorkflows } from './workflows.js'

function WorkflowPicker({ onPick }) {
  return <section className="md-board-workflows" aria-label={t('流程预设')}>
    <h3>{t('流程预设')}</h3>
    <p>{t('选择流程后，补充素材或要求再发送。')}</p>
    {boardWorkflows.map(row => <button key={row.label} type="button" onClick={() => onPick(t(row.prompt, { skill: row.skill }))}>
      <Icon name={row.icon} size={18} />
      <span><strong>{t(row.label)}</strong><small>{t(row.description)}</small></span>
      <Icon name="upRight" size={13} />
    </button>)}
  </section>
}

export function BoardChat({ canvas, beforeSend, onCanvasChanged }) {
  const [chat, setChat] = React.useState(null)
  const [pickerOpen, setPickerOpen] = React.useState(false)
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
    setPickerOpen(false)
    setSending(true)
    try {
      await actions.current.beforeSend()
      await call('canvas/chat', { id: canvas.id, message, requestId: crypto.randomUUID() })
      setChat(previous => ({ ...previous, running: true }))
    } catch (err) { report(err); throw err }
    finally { setSending(false) }
  }
  const messages = chat?.messages ?? []
  const running = chat?.running || sending
  const showPicker = chat && !running && (!messages.length || pickerOpen)
  return <aside className="md-dock" aria-label={t('画布助手')}>
    <ChatPanel intro={false} disabled={!chat} session={{ messages, running, send }} placeholder={t('描述要在画布上完成的工作')} top={error && <p role="alert">{error}</p>}
      renderPromptPicker={showPicker ? fill => <WorkflowPicker onPick={prompt => { fill(prompt); setPickerOpen(false) }} /> : undefined}
      head={<><h2>{t('画布助手')}</h2><span style={{ flex: 1 }} />
        {!!messages.length && !running && <IconButton icon="list" label={t('流程预设')} active={pickerOpen} aria-expanded={pickerOpen} onClick={() => setPickerOpen(!pickerOpen)} />}
        {chat?.running && <button type="button" onClick={() => call('canvas/chat/cancel', { id: canvas.id }).catch(report)}>{t('停止')}</button>}
        <IconButton icon="close" label={t('收起对话')} onClick={() => setDesk({ dockOpen: false })} /></>} />
  </aside>
}

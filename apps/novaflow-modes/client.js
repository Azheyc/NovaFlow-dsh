window.__ModuleLoader__.load({
  id: '@local/novaflow-modes',
  factory(require) {
    const React = require('react')
    const { Modal, Button } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement
    const dictionaries = {
      zh: { title: '选择适合工作的 Agent 模式', description: '进行特定工作时，可以选择适合的 Agent 模式。你可以在会话中临时切换，也可以前往 Agent 预设设置默认模式。', detail: '建模模式和自媒体创作模式目前使用标准模式能力，后续会加入专用插件。', view: '查看 Agent 预设', done: '知道了', close: '关闭', error: '暂时无法保存指引状态，请重试' },
      en: { title: 'Choose an Agent mode for your work', description: 'For specialized work, choose a suitable Agent mode. Switch temporarily within a conversation, or set the default in Agent presets.', detail: 'Modeling and media creation currently use Standard capabilities. Specialized plugins will be added later.', view: 'View Agent presets', done: 'Got it', close: 'Close', error: 'Could not save this preference. Please try again.' },
    }
    return { inject: ['slots', 'locale'], apply(ctx) {
      ctx.effect(() => ctx.locale.register('novaflow.modes', dictionaries))
      const t = ctx.locale.bind('novaflow.modes')
      async function call(action, signal) {
        const response = await fetch('/api/novaflow-modes', { method: 'POST', credentials: 'same-origin', redirect: 'error', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }), signal })
        if (!response.ok) throw new Error('Mode guide request failed')
        return response.json()
      }
      function Guide({ complete, openSection }) {
        const [visible, setVisible] = React.useState(false)
        const [busy, setBusy] = React.useState(false)
        const [error, setError] = React.useState(false)
        const finished = React.useRef(false)
        React.useEffect(() => {
          const controller = new AbortController()
          let timer
          const load = async () => {
            try {
              const state = await call('state', controller.signal)
              if (controller.signal.aborted) return
              if (state.seen) { finished.current = true; complete(); return }
              if (state.ready) setVisible(true)
              else timer = setTimeout(load, 1000)
            } catch { if (!controller.signal.aborted) complete() }
          }
          void load()
          return () => { controller.abort(); clearTimeout(timer) }
        }, [complete])
        const dismiss = async view => {
          if (busy || finished.current) return
          setBusy(true); setError(false)
          try {
            await call('dismiss')
            finished.current = true; setVisible(false); complete()
            if (view) openSection('agent-presets')
          } catch { setError(true) }
          finally { setBusy(false) }
        }
        return h(Modal, { open: visible, title: t('title'), description: t('description'), closeLabel: t('close'), onClose: () => { void dismiss(false) }, footer: h(React.Fragment, null,
          h(Button, { disabled: busy, onClick: () => { void dismiss(false) } }, t('done')),
          h(Button, { variant: 'primary', disabled: busy, onClick: () => { void dismiss(true) } }, t('view'))) },
          h('p', null, t('detail')), error && h('p', { role: 'alert' }, t('error')))
      }
      ctx.slots.inject('settings.onboarding', () => ctx.slots.register({ name: 'settings.onboarding', id: 'novaflow-modes', order: 50 }, Guide))
    } }
  },
})

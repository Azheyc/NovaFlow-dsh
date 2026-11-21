window.__ModuleLoader__.load({
  id: '@local/novaflow-modes',
  factory(require) {
    const React = require('react')
    const { Modal, Button } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement
    const dictionaries = {
      zh: { title: '在会话中使用内置技能', description: '直接在会话中说明你要完成的工作，助手可以按需加载相关技能。', detail: '内置技能包括故事创作、资产提取、角色板、场景参考和电影级分镜。', done: '知道了', close: '关闭', error: '暂时无法保存指引状态，请重试' },
      en: { title: 'Use built-in skills in a conversation', description: 'Describe what you want to do, and the assistant can load the relevant skills as needed.', detail: 'Built-in skills include story writing, asset extraction, character boards, scene references, and cinematic storyboarding.', done: 'Got it', close: 'Close', error: 'Could not save this preference. Please try again.' },
    }
    return { inject: ['slots', 'locale'], apply(ctx) {
      ctx.effect(() => ctx.locale.register('novaflow.modes', dictionaries))
      const t = ctx.locale.bind('novaflow.modes')
      async function call(action, signal) {
        const response = await fetch('/api/novaflow-modes', { method: 'POST', credentials: 'same-origin', redirect: 'error', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }), signal })
        if (!response.ok) throw new Error('Mode guide request failed')
        return response.json()
      }
      function Guide({ complete }) {
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
        const dismiss = async () => {
          if (busy || finished.current) return
          setBusy(true); setError(false)
          try {
            await call('dismiss')
            finished.current = true; setVisible(false); complete()
          } catch { setError(true) }
          finally { setBusy(false) }
        }
        return h(Modal, { open: visible, title: t('title'), description: t('description'), closeLabel: t('close'), onClose: () => { void dismiss() },
          footer: h(Button, { variant: 'primary', disabled: busy, onClick: () => { void dismiss() } }, t('done')) },
          h('p', null, t('detail')), error && h('p', { role: 'alert' }, t('error')))
      }
      ctx.slots.inject('settings.onboarding', () => ctx.slots.register({ name: 'settings.onboarding', id: 'novaflow-modes', order: 50 }, Guide))
    } }
  },
})

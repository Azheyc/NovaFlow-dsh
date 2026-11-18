window.__ModuleLoader__.load({ id: 'novaflow-dsh-prompt-presets', factory(require) {
  const React = require('react')
  const { useState, useEffect, useLayoutEffect, useRef, useContext } = React
  const { createPortal } = require('react-dom')
  const { Modal, Button } = require('@deepseek-ai/dsh-client-ui-primitives')
  const Binding = React.createContext(null)
  const names = { standard: '标准模式', 'novaflow-modeling': '建模模式', 'novaflow-media-creation': '自媒体创作模式' }
  const move = (items, index, step) => { items.splice(index + step, 0, items.splice(index, 1)[0]) }

  async function request(payload) {
    const response = await fetch('/api/novaflow-prompt-presets', { method: 'POST', credentials: 'same-origin', redirect: 'error', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
    if (!response.ok) throw new Error(response.status === 409 ? '配置已被其他窗口修改，请重新载入后编辑。' : '提示词库读取或保存失败，请重试。')
    return response.json()
  }

  function Connector({ sessionId, useSessions, input, inputActions }) {
    const publish = useContext(Binding)
    const mode = useSessions(state => state.byId[sessionId]?.projectionValues?.agentPreset)
    useLayoutEffect(() => {
      if (!publish) return
      publish({ sessionId, mode, input, inputActions })
      return () => publish(null)
    }, [publish, sessionId, mode, input, inputActions])
    return null
  }

  function Suggestions({ targets, binding, library }) {
    const [selected, choose] = useState(null)
    const [preview, showPreview] = useState(null)
    const [confirmation, confirm] = useState(null)
    const { card, above, below } = targets
    const editor = () => card.querySelector('[contenteditable="true"]')
    const available = binding?.input.phase === 'plain' && !!editor() && card.closest('[data-conversation-session]')?.dataset.conversationSession === binding.sessionId
    const groups = library.categories
    const group = groups.find(item => item.id === selected)
    const all = groups.flatMap(item => item.prompts)
    const prompts = group?.prompts ?? library.featured.map(id => all.find(item => item.id === id)).filter(Boolean)
    const pristine = available && !binding.input.draft && !binding.input.occurrences.length && !binding.input.attachmentIds.length
    useLayoutEffect(() => {
      if (!preview || !pristine || !prompts.includes(preview)) return
      const placeholder = card.querySelector('[data-composer-placeholder]')
      if (!placeholder) return
      placeholder.style.setProperty('--nf-preview-size', getComputedStyle(placeholder).fontSize)
      placeholder.dataset.nfPreview = preview.body
      const dismiss = event => { if (event.key === 'Escape') showPreview(null) }
      document.addEventListener('keydown', dismiss)
      return () => {
        delete placeholder.dataset.nfPreview
        placeholder.style.removeProperty('--nf-preview-size')
        document.removeEventListener('keydown', dismiss)
      }
    }, [preview, pristine, library, selected, card])
    const fill = (prompt, revision) => {
      confirm(null); showPreview(null)
      if (!available || !card.isConnected || !editor() || binding.inputActions.captureInsertion().draftRev !== revision) return
      binding.inputActions.setDraft(prompt.body)
      binding.inputActions.persistDraft()
      editor()?.focus()
    }
    const pick = prompt => {
      showPreview(null)
      const revision = binding.inputActions.captureInsertion().draftRev
      if (binding.input.draft || binding.input.occurrences.length) confirm({ prompt, revision })
      else fill(prompt, revision)
    }
    return <>{createPortal(<div className="nf-prompt-types" aria-label="提示词类型">{groups.map(item => <button key={item.id} type="button" aria-pressed={group?.id === item.id} onClick={() => { showPreview(null); choose(group?.id === item.id ? null : item.id) }}>{item.name}</button>)}</div>, above)}
      {createPortal(<div className="nf-prompt-list" aria-label="预设提示词">{prompts.map(prompt => <button key={prompt.id} type="button" disabled={!available} onMouseEnter={() => showPreview(prompt)} onMouseLeave={() => showPreview(null)} onFocus={() => showPreview(prompt)} onBlur={() => showPreview(null)} onClick={() => pick(prompt)}>{prompt.title}<span aria-hidden="true">↗</span></button>)}</div>, below)}
      {confirmation && available && confirmation.revision === binding.input.draftRev && <Modal open title="替换当前草稿？" description="提示词将替换输入框内的文字和行内引用，已添加的附件会保留。" closeLabel="取消" onClose={() => confirm(null)} footer={<><Button onClick={() => confirm(null)}>取消</Button><Button variant="primary" onClick={() => fill(confirmation.prompt, confirmation.revision)}>替换草稿</Button></>} />}
    </>
  }

  function Home({ hero, children, useLibrary }) {
    const root = useRef(null)
    const [binding, bind] = useState(null)
    const [targets, setTargets] = useState(null)
    const state = useLibrary(value => value)
    useLayoutEffect(() => {
      if (!hero) return
      let current
      const sync = () => {
        const card = root.current?.querySelector('[data-composer-card]')
        const bar = card?.closest('[data-slot="conversation.composer.bar"]')
        if (card === current?.card && (!current || current.above.isConnected && current.below.isConnected)) return
        current?.above.remove(); current?.below.remove(); current = null
        if (bar) {
          const above = document.createElement('div'), below = document.createElement('div')
          above.style.display = below.style.display = 'contents'
          bar.before(above); bar.after(below)
          current = { above, below, card }
        }
        setTargets(current)
      }
      sync()
      const observer = new MutationObserver(sync)
      observer.observe(root.current, { subtree: true, childList: true })
      return () => { observer.disconnect(); current?.above.remove(); current?.below.remove(); setTargets(null) }
    }, [hero])
    const mode = binding?.mode || state.defaultMode || 'standard'
    const library = state.catalog?.[mode] ?? state.catalog?.standard
    return <div style={{ display: 'contents' }} ref={root}><Binding.Provider value={hero ? bind : null}>{children}</Binding.Provider>
      {hero && targets && library && <Suggestions key={`${binding?.sessionId ?? ''}:${mode}`} targets={targets} binding={binding} library={library} />}</div>
  }

  function OrderButtons({ list, index, change, remove }) {
    return <div className="nf-prompt-actions"><button disabled={index <= 0} onClick={() => change(-1)}>上移</button><button disabled={index < 0 || index >= list.length - 1} onClick={() => change(1)}>下移</button><button disabled={index < 0} onClick={remove}>删除</button></div>
  }

  function Settings({ useLibrary, save, reload }) {
    const state = useLibrary(item => item)
    const [editing, setEditing] = useState(null)
    const [mode, setMode] = useState('standard'), [groupId, selectGroup] = useState(''), [promptId, selectPrompt] = useState('')
    const [message, report] = useState(''), [busy, setBusy] = useState(false)
    const catalog = editing?.catalog ?? state.catalog
    const modeNames = { ...names, ...state.names }
    const options = [...new Set([...Object.keys(modeNames), ...Object.keys(catalog ?? {})])]
    const update = callback => {
      const copy = structuredClone(catalog)
      callback(copy)
      setEditing({ catalog: copy, revision: editing?.revision ?? state.revision }); report('')
    }
    if (!catalog) return <section className="nf-prompt-settings"><h2>提示词预设</h2><p>{state.error || '正在加载…'}</p>{state.error && <button onClick={reload}>重试</button>}</section>
    const library = catalog[mode] ?? catalog.standard
    const group = library.categories.find(item => item.id === groupId) ?? library.categories[0]
    const prompt = group?.prompts.find(item => item.id === promptId) ?? group?.prompts[0]
    const groupIndex = library.categories.indexOf(group), promptIndex = group?.prompts.indexOf(prompt) ?? -1
    const edit = callback => update(copy => callback(copy[mode], copy[mode].categories[groupIndex], copy[mode].categories[groupIndex]?.prompts[promptIndex]))
    const commit = async () => {
      setBusy(true)
      try { await save(editing); setEditing(null); report('已保存') }
      catch (error) { report(error.message) } finally { setBusy(false) }
    }
    return <section className="nf-prompt-settings"><h2>提示词预设</h2><label>Agent 模式<select value={mode} onChange={event => { setMode(event.target.value); selectGroup(''); selectPrompt('') }}>{options.map(id => <option key={id} value={id}>{modeNames[id] || id}</option>)}</select></label>
      {!Object.hasOwn(catalog, mode) ? <div>当前沿用标准模式。 <button onClick={() => update(copy => { copy[mode] = structuredClone(copy.standard) })}>建立独立配置</button></div> : <fieldset disabled={busy}><legend>类型与提示词</legend>
        <label>类型<select value={group?.id ?? ''} onChange={event => { selectGroup(event.target.value); selectPrompt('') }}>{library.categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div><button onClick={() => { const id = crypto.randomUUID(); edit(lib => lib.categories.push({ id, name: '新类型', prompts: [] })); selectGroup(id) }}>添加类型</button></div>
        {group && <><label>类型名称<input maxLength={100} value={group.name} onChange={event => edit((_lib, item) => { item.name = event.target.value })} /></label><OrderButtons list={library.categories} index={groupIndex} change={step => edit(lib => move(lib.categories, groupIndex, step))} remove={() => edit(lib => { lib.categories.splice(groupIndex, 1); lib.featured = lib.featured.filter(id => !group.prompts.some(item => item.id === id)) })} />
          <label>提示词<select value={prompt?.id ?? ''} onChange={event => selectPrompt(event.target.value)}>{group.prompts.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          <div><button onClick={() => { const id = crypto.randomUUID(); edit((_lib, item) => item.prompts.push({ id, title: '新提示词', body: '' })); selectPrompt(id) }}>添加提示词</button></div>
          {prompt && <><label>按钮标题<input maxLength={200} value={prompt.title} onChange={event => edit((_lib, _group, item) => { item.title = event.target.value })} /></label><label>完整正文<textarea maxLength={32000} value={prompt.body} onChange={event => edit((_lib, _group, item) => { item.body = event.target.value })} /></label><OrderButtons list={group.prompts} index={promptIndex} change={step => edit((_lib, item) => move(item.prompts, promptIndex, step))} remove={() => edit((lib, item) => { item.prompts.splice(promptIndex, 1); lib.featured = lib.featured.filter(id => id !== prompt.id) })} />
            <div><button disabled={library.featured.includes(prompt.id) || library.featured.length >= 4} onClick={() => edit(lib => lib.featured.push(prompt.id))}>加入首页推荐</button></div></>}
        </>}
        <h3>首页推荐（{library.featured.length}/4）</h3><ol>{library.featured.map((id, index) => <li key={id}>{library.categories.flatMap(item => item.prompts).find(item => item.id === id)?.title}<OrderButtons list={library.featured} index={index} change={step => edit(lib => move(lib.featured, index, step))} remove={() => edit(lib => lib.featured.splice(index, 1))} /></li>)}</ol>
      </fieldset>}
      <div className="nf-prompt-actions"><button disabled={!editing || busy} onClick={commit}>保存</button><button disabled={busy || !editing} onClick={() => { setEditing(null); report(''); void reload() }}>放弃修改并重新载入</button></div><p role="status">{message || state.error}</p></section>
  }

  return { inject: ['slots', 'remote', 'remote.agentPresets'], apply(ctx) {
    let state = { names: {}, defaultMode: 'standard' }
    const listeners = new Set()
    const publish = patch => { state = { ...state, ...patch }; for (const listener of listeners) listener() }
    const source = { getSnapshot: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) } }
    let generation = 0
    const reload = async () => {
      const ticket = ++generation
      try { const result = await request({ action: 'read' }); if (ticket === generation) publish({ ...result, error: '' }) }
      catch (error) { if (ticket === generation) publish({ error: error.message }) }
    }
    const save = async data => {
      if (Object.values(data.catalog).some(lib => lib.categories.some(group => !group.name.trim() || group.prompts.some(item => !item.title.trim() || !item.body.trim())))) throw new Error('请填写类型名称、按钮标题和正文。')
      const result = await request({ action: 'save', ...data }); ++generation; publish({ ...result, error: '' })
    }
    ctx.effect(() => {
      const style = document.createElement('style'); style.textContent = '__PROMPT_STYLES__'; document.head.append(style)
      void reload()
      void ctx.remote.agentPresets.list().then(result => { if (result.ok) { const rows = result.value.presets.filter(item => !item.broken); publish({ names: Object.fromEntries(rows.map(row => [row.id, names[row.id] || row.name || row.id])), defaultMode: rows.find(row => row.isDefault)?.id }) } }).catch(() => {})
      return () => { style.remove(); ++generation }
    })
    const inject = () => ({ hooks: { library: source }, save, reload })
    ctx.slots.inject('conversation.hero.frame', () => ctx.slots.register({ name: 'conversation.hero.frame', id: 'novaflow-prompt-presets', inject }, Home))
    ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'novaflow-prompt-binding' }, Connector))
    ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'novaflow-prompt-presets', order: 21, label: '提示词预设', inject }, Settings))
  } }
} })

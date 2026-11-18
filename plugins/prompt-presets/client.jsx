window.__ModuleLoader__.load({ id: 'novaflow-dsh-prompt-presets', factory(require) {
  const React = require('react')
  const { useState, useEffect, useLayoutEffect, useRef, useContext } = React
  const { createPortal } = require('react-dom')
  const { Modal, Button } = require('@deepseek-ai/dsh-client-ui-primitives')
  const Binding = React.createContext(null)
  const HeroSelection = React.createContext(null)
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

  function Selection({ presetId }) {
    const publish = useContext(HeroSelection)
    useLayoutEffect(() => {
      if (!publish) return
      publish(presetId)
      return () => publish(null)
    }, [publish, presetId])
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
    const [selection, setSelection] = useState(null)
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
    const mode = selection || binding?.mode || state.defaultMode || 'standard'
    const library = state.catalog?.[mode] ?? state.catalog?.standard
    return <div style={{ display: 'contents' }} ref={root}><Binding.Provider value={hero ? bind : null}><HeroSelection.Provider value={hero ? setSelection : null}>{children}</HeroSelection.Provider></Binding.Provider>
      {hero && targets && library && <Suggestions key={`${binding?.sessionId ?? ''}:${mode}`} targets={targets} binding={binding} library={library} />}</div>
  }

  function Reorder({ label, index, count, onMove }) {
    return <span className="nf-order">{[-1, 1].map(step => {
      const action = `${step < 0 ? '上移' : '下移'}${label}`
      return <button type="button" key={step} title={action} aria-label={action} disabled={index + step < 0 || index + step >= count} onClick={() => onMove(step)}>{step < 0 ? '↑' : '↓'}</button>
    })}</span>
  }

  function Settings({ useLibrary, setDraft, save, reload }) {
    const state = useLibrary(item => item)
    const [mode, setMode] = useState(state.defaultMode || 'standard')
    const [groupId, selectGroup] = useState(''), [promptId, selectPrompt] = useState('')
    const [view, setView] = useState('library'), [dialog, setDialog] = useState(null)
    const [feedback, report] = useState('')
    const titleField = useRef(null), bodyField = useRef(null)
    const editing = state.draft, catalog = editing?.catalog ?? state.catalog
    const busy = state.saving || state.reloading
    const modeNames = { ...names, ...state.names }
    const options = [...new Set([...Object.keys(modeNames), ...Object.keys(catalog ?? {})])]
    const update = callback => {
      const copy = { ...catalog, ...(catalog[mode] && { [mode]: structuredClone(catalog[mode]) }) }
      callback(copy)
      setDraft({ catalog: copy, revision: editing?.revision ?? state.revision }); report('')
    }
    if (!catalog) return <section className="nf-prompt-settings"><h2>提示词预设</h2><p role="status">{state.error || '正在加载提示词…'}</p>{state.error && <button onClick={() => reload()}>重试</button>}</section>
    const library = catalog[mode] ?? catalog.standard
    const group = library.categories.find(item => item.id === groupId) ?? library.categories[0]
    const prompt = group?.prompts.find(item => item.id === promptId) ?? group?.prompts[0]
    const groupIndex = library.categories.indexOf(group), promptIndex = group?.prompts.indexOf(prompt) ?? -1
    const edit = callback => update(copy => callback(copy[mode], copy[mode].categories[groupIndex], copy[mode].categories[groupIndex]?.prompts[promptIndex]))
    const all = library.categories.flatMap(category => category.prompts.map(item => ({ category, item })))
    const featured = library.featured.map(id => all.find(row => row.item.id === id))
    const select = (categoryId, itemId = '') => { selectGroup(categoryId); selectPrompt(itemId); setView('library') }
    const addPrompt = () => {
      const id = crypto.randomUUID()
      edit((_lib, category) => category.prompts.push({ id, title: '', body: '' }))
      selectPrompt(id); requestAnimationFrame(() => titleField.current?.focus())
    }
    const close = () => setDialog(null)
    const toggleFeatured = () => {
      if (library.featured.includes(prompt.id)) edit(lib => { lib.featured = lib.featured.filter(id => id !== prompt.id) })
      else if (featured.length === 4) setDialog('replace')
      else edit(lib => lib.featured.push(prompt.id))
    }
    const commit = async () => {
      for (const [modeId, lib] of Object.entries(catalog)) for (const category of lib.categories) {
        const incomplete = category.prompts.find(item => !item.title.trim() || !item.body.trim())
        if (!incomplete) continue
        setMode(modeId); select(category.id, incomplete.id)
        const field = !incomplete.title.trim() ? titleField : bodyField
        report(!incomplete.title.trim() ? '请填写提示词标题。' : '请填写提示词正文。')
        requestAnimationFrame(() => field.current?.focus()); return
      }
      try { await save(editing); report('已保存') } catch (error) { report(error.message) }
    }
    const addGroup = () => setDialog({ kind: 'group', name: '', isNew: true })
    const confirmGroup = () => {
      const name = dialog.name.trim()
      if (!name) return
      if (dialog.isNew) {
        const id = crypto.randomUUID()
        edit(lib => lib.categories.push({ id, name, prompts: [] })); select(id)
      } else {
        selectGroup(group.id)
        edit((lib, category) => { category.name = name; move(lib.categories, groupIndex, dialog.position - groupIndex) })
      }
      close()
    }
    const remove = () => {
      if (dialog === 'deleteGroup') {
        edit(lib => { lib.categories.splice(groupIndex, 1); lib.featured = lib.featured.filter(id => !group.prompts.some(item => item.id === id)) })
        select(library.categories[groupIndex + 1]?.id ?? library.categories[groupIndex - 1]?.id ?? '')
      } else {
        edit((lib, category) => { category.prompts.splice(promptIndex, 1); lib.featured = lib.featured.filter(id => id !== prompt.id) })
        selectPrompt(group.prompts[promptIndex + 1]?.id ?? group.prompts[promptIndex - 1]?.id ?? '')
      }
      close()
    }
    return <section className="nf-prompt-settings" aria-label="提示词预设">
      <header className="nf-preset-heading"><h2>提示词预设</h2><label>模式<select disabled={busy} value={mode} onChange={event => { setMode(event.target.value); selectGroup(''); selectPrompt(''); report('') }}>{options.map(id => <option key={id} value={id}>{modeNames[id] || id}</option>)}</select></label></header>
      {!Object.hasOwn(catalog, mode) ? <div className="nf-empty"><p>当前沿用标准模式的提示词和首页推荐。</p><button disabled={busy} onClick={() => update(copy => { copy[mode] = structuredClone(copy.standard) })}>建立独立配置</button></div> : <fieldset disabled={busy} className="nf-preset-workspace" aria-label="预设配置">
        <nav aria-label="配置视图" className="nf-preset-nav">{[['library','提示词库',all.length],['featured','首页推荐',`${featured.length}/4`]].map(([key,label,count]) => <button key={key} aria-pressed={view === key} onClick={() => setView(key)}>{label}<small>{count}</small></button>)}</nav>
        {view === 'library' ? <>
          <div className="nf-categories" aria-label="提示词分类">{library.categories.map(category => <button key={category.id} aria-pressed={category === group} onClick={() => select(category.id)}>{category.name}</button>)}<button className="nf-add" onClick={addGroup}>＋ 分类</button></div>
          {group ? <div className="nf-preset-grid">
            <aside className="nf-preset-index"><div className="nf-panel-heading"><h3>{group.name}</h3><button onClick={() => setDialog({ kind: 'group', name: group.name, isNew: false, position:groupIndex })}>管理分类</button></div>
              <div className="nf-preset-rows" aria-label="分类提示词">{group.prompts.map(item => <button key={item.id} aria-pressed={item === prompt} onClick={() => selectPrompt(item.id)}><span>{item.title || '未命名提示词'}</span>{library.featured.includes(item.id) && <small aria-label="已推荐" title="首页推荐">★</small>}</button>)}</div>
              <button className="nf-add" onClick={addPrompt}>＋ 添加提示词</button>
            </aside>
            {prompt ? <div className="nf-preset-editor"><div className="nf-panel-heading"><h3>编辑提示词</h3><Reorder label="提示词" index={promptIndex} count={group.prompts.length} onMove={step => { selectPrompt(prompt.id); edit((_lib, category) => move(category.prompts, promptIndex, step)) }} /></div>
              <label>标题<input ref={titleField} maxLength={200} placeholder="首页按钮显示的标题" value={prompt.title} onChange={event => edit((_lib, _category, item) => { item.title = event.target.value })}/></label>
              <label>提示词正文<textarea ref={bodyField} maxLength={32000} placeholder="写下要填入新会话的提示词…" value={prompt.body} onChange={event => edit((_lib, _category, item) => { item.body = event.target.value })}/></label>
              <div className="nf-panel-heading"><button className="nf-feature-toggle" aria-pressed={library.featured.includes(prompt.id)} onClick={toggleFeatured}>{library.featured.includes(prompt.id) ? '★ 已加入首页推荐' : '☆ 加入首页推荐'}</button><button className="nf-danger" onClick={() => setDialog('deletePrompt')}>删除提示词</button></div>
            </div> : <p className="nf-empty">这个分类还没有提示词。</p>}
          </div> : <p className="nf-empty">先添加一个分类，再写入提示词。</p>}
        </> : <div className="nf-featured"><p>新会话首页按以下顺序展示，最多 4 条。</p>{featured.length ? <ol>{featured.map(({ item, category }, index) => <li key={item.id}><button className="nf-feature-link" onClick={() => select(category.id, item.id)}><small>{category.name}</small><strong>{item.title || '未命名提示词'}</strong></button><Reorder label="推荐" count={featured.length} index={index} onMove={step => edit(lib => move(lib.featured,index,step))}/><button onClick={() => edit(lib => lib.featured.splice(index,1))}>移除</button></li>)}</ol> : <p className="nf-empty">还没有首页推荐。打开一条提示词即可加入。</p>}</div>}
      </fieldset>}
      <footer className="nf-preset-footer"><span role="status">{feedback || state.error || (editing ? '有未保存的修改' : '')}</span><div><button disabled={!editing || busy} onClick={() => setDialog('discard')}>放弃修改</button><Button variant="primary" disabled={!editing || busy} onClick={commit}>{state.saving ? '保存中…' : '保存修改'}</Button></div></footer>
      {dialog?.kind === 'group' && <Modal open title={dialog.isNew ? '添加分类' : '管理分类'} closeLabel="关闭" onClose={close} footer={<><Button onClick={close}>取消</Button><Button variant="primary" disabled={!dialog.name.trim()} onClick={confirmGroup}>确定</Button></>}><div className="nf-preset-dialog"><label>分类名称<input data-modal-autofocus maxLength={100} value={dialog.name} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) confirmGroup() }} onChange={event => setDialog({...dialog, name:event.target.value})}/></label>{!dialog.isNew && <div className="nf-panel-heading"><span>位置 {dialog.position + 1} / {library.categories.length}</span><Reorder label="分类" index={dialog.position} count={library.categories.length} onMove={step => setDialog({...dialog, position:dialog.position + step})}/><button className="nf-danger" onClick={() => setDialog('deleteGroup')}>删除分类</button></div>}</div></Modal>}
      {dialog === 'replace' && <Modal open title="替换首页推荐" description="推荐位已满，选择要替换的一条。" closeLabel="取消" onClose={close}><div className="nf-replace-list">{featured.map(({ item }, index) => <button key={item.id} onClick={() => { edit(lib => { lib.featured[index] = prompt.id }); close() }}>{item.title || '未命名提示词'}</button>)}</div></Modal>}
      {(dialog === 'deleteGroup' || dialog === 'deletePrompt') && <Modal open title={dialog === 'deleteGroup' ? `删除「${group.name}」？` : `删除「${prompt.title || '未命名提示词'}」？`} description={dialog === 'deleteGroup' ? `其中的 ${group.prompts.length} 条提示词及对应首页推荐也会移除。保存后生效。` : '对应的首页推荐也会移除。保存后生效。'} closeLabel="取消" onClose={close} footer={<><Button onClick={close}>取消</Button><Button onClick={remove}>确认删除</Button></>}/>}
      {dialog === 'discard' && <Modal open title="放弃所有未保存的修改？" description="将重新载入所有模式最近保存的配置。" closeLabel="取消" onClose={close} footer={<><Button onClick={close}>继续编辑</Button><Button onClick={async () => { close(); report(''); await reload(true) }}>放弃并重新载入</Button></>}/>}
    </section>
  }

  return { inject: ['slots', 'remote', 'remote.agentPresets'], apply(ctx) {
    let state = { names: {}, defaultMode: 'standard' }
    const listeners = new Set()
    const publish = patch => { state = { ...state, ...patch }; for (const listener of listeners) listener() }
    const source = { getSnapshot: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) } }
    let generation = 0
    const setDraft = draft => publish({ draft, error: '' })
    const reload = async (discard = false) => {
      const ticket = ++generation
      publish({ reloading: true })
      try { const result = await request({ action: 'read' }); if (ticket === generation) publish({ ...result, ...(discard && {draft:null}), reloading:false, error: '' }) }
      catch (error) { if (ticket === generation) publish({ reloading:false, error: error.message }) }
    }
    const save = async data => {
      if (Object.values(data.catalog).some(lib => lib.categories.some(group => !group.name.trim() || group.prompts.some(item => !item.title.trim() || !item.body.trim())))) throw new Error('请填写类型名称、按钮标题和正文。')
      publish({ saving: true })
      try { const result = await request({ action: 'save', ...data }); ++generation; publish({ ...result, draft:null, error: '' }) }
      finally { publish({ saving: false }) }
    }
    ctx.effect(() => {
      const style = document.createElement('style'); style.textContent = '__PROMPT_STYLES__'; document.head.append(style)
      void reload()
      void ctx.remote.agentPresets.list().then(result => { if (result.ok) { const rows = result.value.presets.filter(item => !item.broken); publish({ names: Object.fromEntries(rows.map(row => [row.id, names[row.id] || row.name || row.id])), defaultMode: rows.find(row => row.isDefault)?.id }) } }).catch(() => {})
      return () => { style.remove(); ++generation }
    })
    const inject = () => ({ hooks: { library: source }, setDraft, save, reload })
    ctx.slots.inject('conversation.hero.frame', () => ctx.slots.register({ name: 'conversation.hero.frame', id: 'novaflow-prompt-presets', inject }, Home))
    ctx.slots.inject('conversation.hero.agentPreset.selection', () => ctx.slots.register({ name: 'conversation.hero.agentPreset.selection', id: 'novaflow-prompt-presets' }, Selection))
    ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'novaflow-prompt-binding' }, Connector))
    ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'novaflow-prompt-presets', order: 21, label: '提示词预设', inject }, Settings))
  } }
} })

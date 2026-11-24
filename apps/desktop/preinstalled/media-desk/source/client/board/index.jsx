// 无限画布页：复用灵感页的相机（平移、缩放、惯性、网格），加上节点、连线、选择、排列和画布助手。
import React from 'react'
import { useCamera } from '../canvas.jsx'
import { setDesk, useDesk } from '../desk.js'
import { t } from '../i18n.js'
import { Dialog, DockAddButton, DockBar, Icon, IconButton } from '../ui.jsx'
import { call, fileUrl, NODE_INFO, report, toast, uid, uploadFile } from './api.js'
import { BoardChat } from './chat.jsx'
import { createHistory, record, restore, snapshot, step } from './history.js'
import { arrangeAll, arrangeSelection, availablePosition, boundsOf, expandParentFrames, frameMembers, portPoint, resizedNode, settleGroupDrop, sizeOf } from '../../src/board-layout.js'
import { allowsVideoMode, appendConnection, isVideoImageUse, resolveConnection, VIDEO_IMAGE_USE_KEY } from './connections.js'
import { BoardNode, NodeEditor } from './node.jsx'
import { canvasDocument } from './document.js'
import { imagePromptSource } from '../../src/board-schema.js'

const ZOOM_STEP = 1.05
const SNAP = 16
const ADDABLE = ['text', 'image', 'video', 'imageGen', 'videoGen', 'group']

function NodeChoices({ onChoose }) {
  return ADDABLE.map(type => <button type="button" key={type} onClick={() => onChoose(type)}>{t(NODE_INFO[type].label)}</button>)
}

function canPreview(node) {
  return node?.data.src && ['image', 'video', 'imageGen', 'videoGen'].includes(node.type)
}

function usePopover() {
  const ref = React.useRef(null)
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    if (!open) return
    const dismiss = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const escape = e => { if (e.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus({ preventScroll: true }) } }
    document.addEventListener('pointerdown', dismiss, true)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', dismiss, true); document.removeEventListener('keydown', escape) }
  }, [open])
  return { ref, open, setOpen }
}

function curve(a, b) {
  const dx = Math.max(40, Math.abs(b.x - a.x) / 2)
  return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`
}

function CanvasPicker({ list, current, onOpen, onCreate, onRename, onDelete }) {
  const { ref, open, setOpen } = usePopover()
  const [query, setQuery] = React.useState('')
  const shown = list.filter(row => !query || row.name.includes(query) || (row.folder ?? '').includes(query))
  const folders = [...new Set(shown.map(row => row.folder ?? ''))]
  return (
    <div ref={ref} className="md-board-picker" onPointerDown={e => e.stopPropagation()}>
      <button type="button" className="md-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{current?.name ?? t('选择画布')}</span><Icon name="chevD" size={14} />
      </button>
      {open ? (
        <div className="md-board-menu" role="dialog" aria-label={t('画布列表')}>
          <div className="md-board-menu-head">
            <input value={query} placeholder={t('搜索画布')} onChange={e => setQuery(e.target.value)} />
            <IconButton icon="plus" label={t('新增画布')} onClick={() => { setOpen(false); onCreate() }} />
          </div>
          {folders.map(folder => (
            <div key={folder} className="md-board-folder">
              {folder ? <p className="md-board-folder-name"><Icon name="folder" size={13} />{folder}</p> : null}
              {shown.filter(row => (row.folder ?? '') === folder).map(row => (
                <div key={row.id} className={`md-board-row${row.id === current?.id ? ' is-on' : ''}`}>
                  <button type="button" onClick={() => { setOpen(false); onOpen(row.id) }}>{row.name}<small>{t('{n} 个节点', { n: row.nodeCount })}</small></button>
                  <IconButton icon="edit" label={t('重命名')} onClick={() => { setOpen(false); onRename(row) }} />
                  <IconButton icon="trash" label={t('删除画布')} onClick={() => { setOpen(false); onDelete(row) }} />
                </div>
              ))}
            </div>
          ))}
          {shown.length ? null : <p className="md-muted">{t('还没有画布')}</p>}
        </div>
      ) : null}
    </div>
  )
}

function MiniMap({ canvas, cam, stageRef, flyTo }) {
  const box = boundsOf(canvas.nodes)
  if (!box) return null
  const scale = Math.min(180 / Math.max(box.w, 1), 120 / Math.max(box.h, 1))
  const stage = stageRef.current
  const c = cam.current
  const view = stage ? { x: (-c.x / c.s - box.x) * scale, y: (-c.y / c.s - box.y) * scale, w: stage.clientWidth / c.s * scale, h: stage.clientHeight / c.s * scale } : null
  return (
    <div className="md-minimap" onPointerDown={(event) => {
      event.stopPropagation()
      const rect = event.currentTarget.getBoundingClientRect()
      const x = (event.clientX - rect.left - 8) / scale + box.x
      const y = (event.clientY - rect.top - 8) / scale + box.y
      flyTo({ x: stage.clientWidth / 2 - x * c.s, y: stage.clientHeight / 2 - y * c.s, s: c.s })
    }}>
      <svg width={box.w * scale + 16} height={box.h * scale + 16}>
        <g transform="translate(8,8)">
          {canvas.nodes.map(node => { const s = sizeOf(node); return <rect key={node.id} x={(node.position.x - box.x) * scale} y={(node.position.y - box.y) * scale} width={s.w * scale} height={s.h * scale} rx="2" /> })}
          {view ? <rect className="md-minimap-view" x={view.x} y={view.y} width={view.w} height={view.h} /> : null}
        </g>
      </svg>
    </div>
  )
}

function NodeSearch({ canvas, onPick, onClose }) {
  const [query, setQuery] = React.useState('')
  const rows = canvas.nodes.filter(node => !query || `${node.data.label ?? ''} ${t(NODE_INFO[node.type].label)} ${node.data.text ?? ''} ${node.data.prompt ?? ''}`.includes(query)).slice(0, 50)
  return (
    <Dialog title={t('画布节点搜索')} onClose={onClose} width={480}>
      <div className="md-form">
        <label className="md-field"><input autoFocus value={query} placeholder={t('按名称、类型或内容搜索')} onChange={e => setQuery(e.target.value)} /></label>
        <div className="md-board-search">
          {rows.map(node => <button type="button" key={node.id} onClick={() => onPick(node)}><b>{node.data.label || t('未命名')}</b><small>{t(NODE_INFO[node.type].label)}</small></button>)}
          {rows.length ? null : <p className="md-muted">{t('没有匹配的节点')}</p>}
        </div>
      </div>
    </Dialog>
  )
}

function HistoryDialog({ node, onPick, onClose }) {
  return (
    <Dialog title={t('生成历史')} onClose={onClose} width={560}>
      <div className="md-board-history">
        {[...(node.data.history ?? [])].reverse().map(row => (
          <button type="button" key={row.src} onClick={() => onPick(row.src)}>
            {node.type === 'videoGen' ? <video src={fileUrl(row.src)} preload="metadata" /> : <img src={fileUrl(row.src)} alt="" />}
          </button>
        ))}
      </div>
    </Dialog>
  )
}

function Board({ canvas, setCanvas, onSaved }) {
  const stageRef = React.useRef(null)
  const worldRef = React.useRef(null)
  const panelRef = React.useRef(null)
  const activeNode = React.useRef(null)
  const positionEditor = React.useCallback(c => {
    const panel = panelRef.current
    const node = activeNode.current
    const stage = stageRef.current
    if (!panel || !node || !stage) return
    const { w, h } = sizeOf(node)
    const left = c.x + (node.position.x + w / 2) * c.s - panel.offsetWidth / 2
    const top = c.y + node.position.y * c.s
    const below = top + h * c.s + 12
    // Prefer below the preview. Flip when necessary and keep controls inside the canvas pane.
    const bottom = stage.clientHeight - (stage.clientWidth <= 360 ? 130 : 80) - panel.offsetHeight
    const y = below > bottom && top - 36 - panel.offsetHeight >= 12 ? top - 36 - panel.offsetHeight : below
    panel.style.left = `${Math.max(8, Math.min(left, stage.clientWidth - panel.offsetWidth - 8))}px`
    panel.style.top = `${Math.max(8, Math.min(y, bottom))}px`
  }, [])
  const { cam, flyTo, halt } = useCamera(stageRef, worldRef, positionEditor)
  const [selected, setSelected] = React.useState(() => new Set())
  const [sizePreview, setSizePreview] = React.useState(null)
  const [editingId, setEditingId] = React.useState(null)
  const editor = selected.size === 1 && selected.has(editingId) ? canvas.nodes.find(n => n.id === editingId) : null
  React.useLayoutEffect(() => {
    activeNode.current = editor
    if (!editor || !panelRef.current) return
    const update = () => positionEditor(cam.current)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(stageRef.current)
    observer.observe(panelRef.current)
    return () => observer.disconnect()
  }, [editor, cam, positionEditor])
  const additions = usePopover()
  const contextMenu = usePopover()
  const [menuPoint, setMenuPoint] = React.useState(null)
  const [previewId, setPreviewId] = React.useState(null)
  React.useLayoutEffect(() => {
    const menu = contextMenu.ref.current, stage = stageRef.current
    if (!menu || !contextMenu.open || !menuPoint) return
    menu.style.left = `${Math.max(0, Math.min(menuPoint.x, stage.clientWidth - menu.offsetWidth))}px`
    menu.style.top = `${Math.max(0, Math.min(menuPoint.y, stage.clientHeight - menu.offsetHeight))}px`
    menu.querySelector('button')?.focus({ preventScroll: true })
  }, [contextMenu.open, contextMenu.ref, menuPoint])
  const addMenuId = React.useId()
  const views = usePopover()
  const [linking, setLinking] = React.useState(null)
  const [lasso, setLasso] = React.useState(null)
  const [busy, setBusy] = React.useState(() => new Set())
  const [pointerTool, setPointerTool] = React.useState('pan')
  const [options, setOptions] = React.useState({ snap: false, edges: true, map: false })
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [historyNode, setHistoryNode] = React.useState(null)
  const [zoom, setZoom] = React.useState(1)
  const [models, setModels] = React.useState({})
  React.useEffect(() => {
    let active = true
    const refresh = () => call('canvas/models').then(result => { if (active) setModels(result) }).catch(report)
    refresh()
    window.addEventListener('focus', refresh)
    return () => { active = false; window.removeEventListener('focus', refresh) }
  }, [])
  const history = React.useRef(createHistory())
  React.useEffect(() => onSaved.onRemoteEdit(before => record(history.current, snapshot(before))), [onSaved])
  const clipboard = React.useRef(null)
  const latest = React.useRef(canvas)
  latest.current = canvas

  React.useLayoutEffect(() => {
    const v = canvas.viewport ?? { x: 0, y: 0, zoom: 1 }
    const el = stageRef.current
    flyTo(canvas.nodes.length || v.x || v.y || v.zoom !== 1 ? { x: v.x, y: v.y, s: v.zoom } : { x: (el?.clientWidth ?? 800) / 2, y: (el?.clientHeight ?? 600) / 3, s: 1 }, { instant: true })
    setZoom(cam.current.s)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas.id])

  const toWorld = React.useCallback((clientX, clientY) => {
    const rect = stageRef.current.getBoundingClientRect()
    const c = cam.current
    return { x: (clientX - rect.left - c.x) / c.s, y: (clientY - rect.top - c.y) / c.s }
  }, [cam])

  /** 结构变化：先记撤销点，再改；保存由外层防抖。 */
  const change = React.useCallback((mutate, { structural = true } = {}) => {
    const current = onSaved.snapshot()
    if (structural) record(history.current, snapshot(current))
    const next = mutate(structuredClone(current))
    if (next) { latest.current = next; setCanvas(next) }
  }, [setCanvas, onSaved])

  const patchNode = (id, data, structural = false) => change((draft) => {
    const node = draft.nodes.find(n => n.id === id)
    if (node) node.data = { ...node.data, ...data }
    return draft
  }, { structural })

  const addNode = (type, at) => {
    if (!at && type === 'group' && chosenCards.length && chosenGroups.length <= 1) return group()
    const info = NODE_INFO[type]
    const center = at ?? toWorld(stageRef.current.getBoundingClientRect().left + stageRef.current.clientWidth / 2, stageRef.current.getBoundingClientRect().top + stageRef.current.clientHeight / 2)
    const position = at ?? availablePosition(latest.current.nodes, type, center)
    const node = { id: uid('n'), type, position, data: type === 'imageGen' ? { tier: '2K', ratio: '16:9' } : type === 'videoGen' ? { ratio: '16:9' } : {} }
    change((draft) => { draft.nodes.push(node); return draft })
    setEditingId(null)
    setSelected(new Set([node.id]))
    const c = cam.current, stage = stageRef.current
    if (!at && (position.x * c.s + c.x < 8 || (position.x + info.w) * c.s + c.x > stage.clientWidth - 8 || position.y * c.s + c.y < 90 || (position.y + info.h) * c.s + c.y > stage.clientHeight - 64)) {
      flyTo({ x: stage.clientWidth / 2 - (position.x + info.w / 2) * c.s, y: stage.clientHeight / 2 - (position.y + info.h / 2) * c.s, s: c.s })
    }
    return node
  }

  const removeSelected = () => {
    if (!selected.size) return
    change((draft) => {
      draft.nodes = draft.nodes.filter(n => !selected.has(n.id) && !selected.has(n.parentId))
      const alive = new Set(draft.nodes.map(n => n.id))
      draft.edges = draft.edges.filter(e => alive.has(e.source) && alive.has(e.target))
      return draft
    })
    setSelected(new Set())
  }

  const copySelected = () => {
    const nodes = latest.current.nodes.filter(n => selected.has(n.id) || selected.has(n.parentId))
    if (!nodes.length) return
    const ids = new Set(nodes.map(n => n.id))
    clipboard.current = { nodes, edges: latest.current.edges.filter(e => ids.has(e.source) && ids.has(e.target)) }
    toast(t('已复制 {n} 个节点', { n: nodes.length }))
  }

  const paste = () => {
    const data = clipboard.current
    if (!data) return
    const map = new Map(data.nodes.map(n => [n.id, uid('n')]))
    const nodes = data.nodes.map(n => ({ ...structuredClone(n), id: map.get(n.id), parentId: map.get(n.parentId), position: { x: n.position.x + 40, y: n.position.y + 40 }, data: { ...structuredClone(n.data), job: undefined } }))
    const edges = data.edges.map(e => ({ ...e, id: uid('e'), source: map.get(e.source), target: map.get(e.target) }))
    change((draft) => { draft.nodes.push(...nodes); draft.edges.push(...edges); return draft })
    setSelected(new Set(nodes.map(n => n.id)))
  }

  const group = () => {
    if (!chosenCards.length || chosenGroups.length > 1) return
    const id = chosenGroups[0]?.id ?? uid('n')
    change((draft) => {
      const members = draft.nodes.filter(n => selected.has(n.id) && n.type !== 'group')
      let frame = draft.nodes.find(n => n.id === id)
      if (!frame) {
        frame = { id, type: 'group', position: members[0].position, width: 0, height: 0, data: { label: t('分组') } }
        draft.nodes.unshift(frame)
      }
      frameMembers(frame, members)
      for (const node of members) node.parentId = id
      return draft
    })
    setEditingId(null)
    setSelected(new Set([id]))
  }

  const ungroup = () => {
    const groups = new Set(chosenGroups.map(n => n.id))
    if (!groups.size && !chosenCards.some(n => n.parentId)) return
    const released = new Set()
    change(draft => {
      draft.nodes = draft.nodes.filter(n => !groups.has(n.id))
      for (const node of draft.nodes) {
        if (groups.has(node.parentId) || (!groups.size && selected.has(node.id))) {
          delete node.parentId
          released.add(node.id)
        }
      }
      return draft
    })
    setSelected(released)
  }

  const applyMoves = moves => change((draft) => {
    const origins = new Map(draft.nodes.map(n => [n.id, n.position]))
    for (const node of draft.nodes) {
      const parent = origins.get(node.parentId)
      if (parent && moves[node.parentId]) node.position = { x: node.position.x + moves[node.parentId].x - parent.x, y: node.position.y + moves[node.parentId].y - parent.y }
      else if (moves[node.id]) node.position = moves[node.id]
    }
    expandParentFrames(draft.nodes, new Set(Object.keys(moves)))
    return draft
  })

  const resize = (node, dx, dy, commit, keyboard = false) => {
    if (!node) { setSizePreview(null); return }
    const scale = keyboard ? 1 : cam.current.s
    const size = resizedNode(node, dx / scale, dy / scale, latest.current.nodes)
    setEditingId(null)
    if (!commit) { setSizePreview({ id: node.id, ...size }); return }
    setSizePreview(null)
    const old = sizeOf(node)
    if (size.width === old.w && size.height === old.h) return
    change(draft => {
      const target = draft.nodes.find(n => n.id === node.id)
      if (target) { Object.assign(target, size); expandParentFrames(draft.nodes, new Set([target.id])) }
      return draft
    })
  }

  const fit = React.useCallback((nodes = latest.current.nodes) => {
    const box = boundsOf(nodes)
    const el = stageRef.current
    if (!box || !el) return
    const s = Math.max(0.2, Math.min(1.4, Math.min((el.clientWidth - 160) / box.w, (el.clientHeight - 200) / box.h)))
    flyTo({ x: el.clientWidth / 2 - (box.x + box.w / 2) * s, y: el.clientHeight / 2 - (box.y + box.h / 2) * s, s })
    setTimeout(() => setZoom(cam.current.s), 400)
  }, [cam, flyTo])

  const lastFitRequest = React.useRef(canvas.fitRequest)
  React.useEffect(() => {
    if (canvas.fitRequest && canvas.fitRequest !== lastFitRequest.current) fit()
    lastFitRequest.current = canvas.fitRequest
  }, [canvas.fitRequest, fit])

  const undo = (direction) => {
    const target = step(history.current, latest.current, direction)
    if (target) setCanvas(restore(latest.current, target))
  }

  const pan = React.useRef(null)
  const startPan = event => {
    if (pan.current || event.target.closest('.md-board-chrome,.md-dialog-mask')) return
    const leftPan = event.button === 0 && pointerTool === 'pan' && !event.target.closest('[data-bnode],.md-board-edge,input,textarea,select,button')
    if (!leftPan && event.button !== 1) return
    event.preventDefault()
    event.stopPropagation()
    halt()
    const stage = stageRef.current
    stage.setPointerCapture(event.pointerId)
    pan.current = { id: event.pointerId, leftPan, moved: false, x: cam.current.x, y: cam.current.y, startX: event.clientX, startY: event.clientY }
    stage.classList.add('is-panning')
  }
  const endPan = event => {
    if (pan.current?.id !== event.pointerId) return
    if (event.type === 'pointerup' && pan.current.leftPan && !pan.current.moved) {
      setEditingId(null)
      setLinking(null)
      setSelected(new Set())
    }
    pan.current = null
    stageRef.current.classList.remove('is-panning')
    if (stageRef.current.hasPointerCapture(event.pointerId)) stageRef.current.releasePointerCapture(event.pointerId)
  }

  const onPointerDown = (event) => {
    if (event.button !== 0 || pan.current) return
    if (event.target.closest('input,textarea,select,button,video[controls],.md-board-chrome,.md-dialog-mask')) return
    setEditingId(null)
    setLinking(null)
    const nodeEl = event.target.closest('[data-bnode]')
    const c = cam.current
    const start = { x: event.clientX, y: event.clientY }
    halt()
    const selectInFrame = nodeEl?.classList.contains('is-group') && event.shiftKey && !event.target.closest('.md-bnode-caption')
    if (nodeEl && !selectInFrame && event.button === 0) {
      const id = nodeEl.dataset.bnode
      const additive = event.shiftKey || event.metaKey || event.ctrlKey
      let ids = selected
      if (additive) {
        ids = new Set(selected)
        ids.has(id) ? ids.delete(id) : ids.add(id)
      } else if (!selected.has(id)) ids = new Set([id])
      setSelected(ids)
      const moving = new Set(ids)
      for (const node of latest.current.nodes) if (moving.has(node.parentId)) moving.add(node.id)
      const origin = new Map(latest.current.nodes.filter(n => moving.has(n.id)).map(n => [n.id, n.position]))
      const before = snapshot(latest.current)
      let moved = false
      const onMove = (e) => {
        let dx = (e.clientX - start.x) / c.s
        let dy = (e.clientY - start.y) / c.s
        if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 4) return
        moved = true
        nodeEl.classList.add('is-dragging')
        const anchor = origin.get(id)
        if (options.snap && anchor) {
          dx = Math.round((anchor.x + dx) / SNAP) * SNAP - anchor.x
          dy = Math.round((anchor.y + dy) / SNAP) * SNAP - anchor.y
        }
        setCanvas((current) => ({
          ...current,
          nodes: current.nodes.map((node) => {
            const from = origin.get(node.id)
            if (!from) return node
            return { ...node, position: { x: from.x + dx, y: from.y + dy } }
          }),
        }))
      }
      const onUp = (e) => {
        nodeEl.classList.remove('is-dragging')
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        if (moved) {
          if (e.type === 'pointerup' && latest.current.nodes.some(n => n.type === 'group')) {
            change(draft => { settleGroupDrop(draft.nodes, moving); return draft }, { structural: false })
          }
          record(history.current, before)
        }
        else if (e.type === 'pointerup' && !additive && nodeEl.contains(document.elementFromPoint(e.clientX, e.clientY))) {
          setSelected(new Set([id]))
          setEditingId(id)
        }
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
      return
    }
    const from = toWorld(event.clientX, event.clientY)
    const onMove = (e) => setLasso({ from, to: toWorld(e.clientX, e.clientY) })
    const onUp = (e) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      setLasso(null)
      if (e.type === 'pointercancel') return
      const to = toWorld(e.clientX, e.clientY)
      if (selectInFrame && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 4) {
        const ids = new Set(event.shiftKey ? selected : [])
        const id = nodeEl.dataset.bnode
        if (ids.has(id)) ids.delete(id); else ids.add(id)
        setSelected(ids)
        return
      }
      const box = { x1: Math.min(from.x, to.x), y1: Math.min(from.y, to.y), x2: Math.max(from.x, to.x), y2: Math.max(from.y, to.y) }
      setSelected(new Set(latest.current.nodes.filter((n) => {
        if (n.type === 'group') return false
        const s = sizeOf(n)
        return n.position.x < box.x2 && n.position.x + s.w > box.x1 && n.position.y < box.y2 && n.position.y + s.h > box.y1
      }).map(n => n.id)))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const editNode = (node, data) => {
    if (node.type !== 'videoGen' || !Object.hasOwn(data, 'mode')) return patchNode(node.id, data)
    const mode = data.mode
    const imageInputs = latest.current.edges.filter(edge => edge.target === node.id && isVideoImageUse(edge.targetHandle))
    if (!allowsVideoMode(imageInputs.length, mode)) return
    change(draft => {
      draft.nodes.find(n => n.id === node.id).data.mode = mode
      if (imageInputs.length === 1 && isVideoImageUse(mode)) {
        draft.edges.find(edge => edge.id === imageInputs[0].id).targetHandle = mode
      }
      return draft
    })
    if (isVideoImageUse(mode)) localStorage.setItem(VIDEO_IMAGE_USE_KEY, mode)
  }

  const finishLink = (start, targetId, side) => {
    setLinking(null)
    if (!targetId || !side || side === start.side) return
    const [from, to] = start.side === 'source' ? [start.node, targetId] : [targetId, start.node]
    const edge = resolveConnection(latest.current, from, to, models.video?.capabilities?.modes, localStorage.getItem(VIDEO_IMAGE_USE_KEY))
    if (!edge) { toast(t('这两个端口不能连接'), { error: true }); return }
    change(draft => { appendConnection(draft, { ...edge, id: uid('e') }); return draft })
  }

  const onPortDown = (event, node, side) => {
    if (event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    setEditingId(null)
    const from = portPoint(node, side)
    setLinking({ node: node.id, side, from, to: from, pointerId: event.pointerId })
    stageRef.current.setPointerCapture(event.pointerId)
  }

  const onPortKey = (node, side) => {
    if (linking) return finishLink(linking, node.id, side)
    const from = portPoint(node, side)
    setEditingId(null)
    setLinking({ node: node.id, side, from, to: from })
  }

  const moveLink = event => {
    if (!linking || linking.pointerId !== event.pointerId) return
    setLinking({ ...linking, to: toWorld(event.clientX, event.clientY) })
  }

  const dropLink = event => {
    if (!linking || linking.pointerId !== event.pointerId) return
    const socket = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-socket]')
    if (!socket || !stageRef.current.contains(socket)) { setLinking(null); return }
    finishLink(linking, socket.closest('[data-bnode]').dataset.bnode, socket.dataset.socket)
  }

  const removeEdge = id => change((draft) => { draft.edges = draft.edges.filter(e => e.id !== id); return draft })

  const run = async (node) => {
    setBusy(b => new Set(b).add(node.id))
    try {
      await onSaved.flush()
      const data = await call('canvas/generate', { id: canvas.id, nodeId: node.id })
      onSaved.replace(data.canvas)
      if (data.job?.status === 'failed') toast(t('生成失败：{error}', { error: data.job.error ?? '' }), { error: true })
    } catch (err) {
      report(err)
    } finally {
      setBusy((b) => { const next = new Set(b); next.delete(node.id); return next })
    }
  }

  const status = async (node) => {
    try {
      await onSaved.flush()
      const data = await call('canvas/generation/status', { id: canvas.id, nodeId: node.id })
      onSaved.replace(data.canvas)
    } catch (err) {
      report(err)
    }
  }

  // 运行中的视频任务自动查进度
  React.useEffect(() => {
    const pending = canvas.nodes.filter(n => n.data.job?.status === 'running')
    if (!pending.length) return undefined
    const timer = setTimeout(() => { for (const node of pending) status(node) }, 8000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas])

  const upload = async (node, file) => {
    try {
      const { src } = await uploadFile(file, canvas.id)
      patchNode(node.id, { src })
    } catch (err) {
      report(err)
    }
  }

  const dropFiles = async (event) => {
    event.preventDefault()
    const files = [...(event.dataTransfer?.files ?? [])].filter(f => /^(image|video)\//.test(f.type))
    const at = toWorld(event.clientX, event.clientY)
    for (const file of files) {
      try {
        const { src, kind } = await uploadFile(file, canvas.id)
        const type = kind === 'video' ? 'video' : 'image'
        const node = { id: uid('n'), type, position: availablePosition(latest.current.nodes, type, at), data: { src, label: file.name.replace(/\.[^.]+$/, '').slice(0, 60) } }
        change((draft) => { draft.nodes.push(node); return draft })
      } catch (err) {
        report(err)
      }
    }
  }

  // Scale around the pointer; normalize wheel units before applying a fine zoom step.
  React.useEffect(() => {
    const el = stageRef.current
    if (!el) return undefined
    const onWheel = (event) => {
      if (event.target.closest('textarea,.md-board-chrome,.md-dialog-mask')) return
      contextMenu.setOpen(false)
      event.preventDefault()
      const c = cam.current
      const rect = el.getBoundingClientRect()
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1
      const ticks = Math.max(-1, Math.min(1, event.deltaY * unit / 100))
      const s = Math.max(0.2, Math.min(8, c.s * ZOOM_STEP ** -ticks))
      if (s === c.s) return
      const k = s / c.s
      const cx = event.clientX - rect.left, cy = event.clientY - rect.top
      flyTo({ x: cx - (cx - c.x) * k, y: cy - (cy - c.y) * k, s }, { instant: true })
      setZoom(s)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [cam, flyTo, contextMenu.setOpen])

  // 视口跟着画布一起保存
  React.useEffect(() => {
    const timer = setInterval(() => {
      const c = cam.current
      const v = latest.current.viewport ?? {}
      if (Math.abs((v.x ?? 0) - c.x) > 1 || Math.abs((v.y ?? 0) - c.y) > 1 || Math.abs((v.zoom ?? 1) - c.s) > 0.01) {
        setCanvas(current => ({ ...current, viewport: { x: Math.round(c.x), y: Math.round(c.y), zoom: Math.round(c.s * 100) / 100 } }))
      }
    }, 750)
    return () => {
      clearInterval(timer)
      const { tx: x, ty: y, ts: zoom } = cam.current
      const saved = onSaved.snapshot()?.viewport
      if (saved && (Math.abs(saved.x - x) > 1 || Math.abs(saved.y - y) > 1 || Math.abs(saved.zoom - zoom) > 0.01)) {
        setCanvas(current => ({ ...current, viewport: { x, y, zoom } }))
        onSaved.flush().catch(report)
      }
    }
  }, [cam, setCanvas, onSaved])

  React.useEffect(() => {
    const onKey = (event) => {
      if (event.defaultPrevented || document.querySelector('.md-root [aria-modal="true"]') || event.target.closest?.('.md-board-chrome:not(.md-board-selection), .md-dock')) return
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable) return
      const mod = event.metaKey || event.ctrlKey
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelected() }
      else if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(event.shiftKey ? 'redo' : 'undo') }
      else if (mod && event.key === 'y') { event.preventDefault(); undo('redo') }
      else if (mod && event.key === 'c') copySelected()
      else if (mod && event.key === 'v') paste()
      else if (mod && event.key === 'a') { event.preventDefault(); setSelected(new Set(latest.current.nodes.map(n => n.id))) }
      else if (mod && event.key.toLowerCase() === 'g') { event.preventDefault(); event.shiftKey ? ungroup() : group() }
      else if (mod && event.key === 'f') { event.preventDefault(); setSearchOpen(true) }
      else if (event.key === 'Escape') { setEditingId(null); setLinking(null); setSelected(new Set()) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const displayedNodes = sizePreview ? canvas.nodes.map(n => n.id === sizePreview.id ? { ...n, ...sizePreview } : n) : canvas.nodes
  const byId = new Map(displayedNodes.map(n => [n.id, n]))
  const preview = byId.get(previewId)
  const chosen = canvas.nodes.filter(n => selected.has(n.id))
  const chosenCards = chosen.filter(n => n.type !== 'group')
  const chosenGroups = chosen.filter(n => n.type === 'group')
  const canRelease = chosenGroups.length > 0 || chosenCards.some(n => n.parentId)
  const arrangeable = chosen.filter(n => !selected.has(n.parentId))
  const zoomTo = (s) => {
    const el = stageRef.current
    const c = cam.current
    const k = s / c.ts
    flyTo({ x: el.clientWidth / 2 - (el.clientWidth / 2 - c.tx) * k, y: el.clientHeight / 2 - (el.clientHeight / 2 - c.ty) * k, s })
    setZoom(s)
  }

  return (
    <div className="md-stage md-flow-stage" data-pointer-tool={pointerTool} ref={stageRef} onPointerDownCapture={startPan} onPointerDown={onPointerDown}
      onContextMenu={event => {
        if (event.target.closest('.md-board-chrome,.md-dialog-mask,input,textarea,select')) return
        event.preventDefault()
        halt()
        setEditingId(null)
        setLinking(null)
        additions.setOpen(false)
        views.setOpen(false)
        const rect = stageRef.current.getBoundingClientRect()
        setMenuPoint({ x: event.clientX - rect.left, y: event.clientY - rect.top, world: toWorld(event.clientX, event.clientY) })
        contextMenu.setOpen(true)
      }}
      onPointerMove={e => {
        const drag = pan.current
        if (drag && drag.id === e.pointerId) {
          const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY
          if (dx || dy) drag.moved = true
          flyTo({ x: drag.x + dx, y: drag.y + dy, s: cam.current.s }, { instant: true })
        } else moveLink(e)
      }}
      onPointerUp={e => { if (pan.current) endPan(e); else dropLink(e) }} onPointerCancel={endPan}
      onLostPointerCapture={e => { endPan(e); if (e.target === stageRef.current && linking?.pointerId === e.pointerId) setLinking(null) }}
      onDragOver={e => e.preventDefault()} onDrop={dropFiles}>
      <div className="md-world" ref={worldRef}>
        {options.edges || linking ? (
          <svg className="md-links md-board-links">
            {options.edges && canvas.edges.map((edge) => {
              const source = byId.get(edge.source)
              const target = byId.get(edge.target)
              if (!source || !target) return null
              const d = curve(portPoint(source, 'source'), portPoint(target, 'target'))
              return (
                <g key={edge.id} className="md-board-edge">
                  <path d={d} />
                  <path d={d} className="md-board-edge-hit" onPointerDown={(e) => { e.stopPropagation(); if (e.button === 0) removeEdge(edge.id) }}><title>{t('点击断开连接')}</title></path>
                </g>
              )
            })}
            {linking ? <path className="md-board-edge-draft" d={linking.side === 'source' ? curve(linking.from, linking.to) : curve(linking.to, linking.from)} /> : null}
          </svg>
        ) : null}
        {displayedNodes.map(node => (
          <BoardNode
            key={node.id}
            node={node}
            selected={selected.has(node.id)}
            editing={editor?.id === node.id}
            resize={resize}
            onPreview={canPreview(node) ? () => setPreviewId(node.id) : undefined}
            onOpen={() => { setSelected(new Set([node.id])); setEditingId(node.id) }}
            onPortDown={onPortDown}
            onPortKey={onPortKey}
          />
        ))}
        {lasso ? <div className="md-board-lasso" style={{ left: Math.min(lasso.from.x, lasso.to.x), top: Math.min(lasso.from.y, lasso.to.y), width: Math.abs(lasso.to.x - lasso.from.x), height: Math.abs(lasso.to.y - lasso.from.y) }} /> : null}
      </div>

      {editor && <NodeEditor key={editor.id} panelRef={panelRef} node={editor} busy={busy.has(editor.id)} model={models[editor.type === 'videoGen' ? 'video' : 'image']}
        promptSource={imagePromptSource(canvas, editor)} onPreview={canPreview(editor) ? () => setPreviewId(editor.id) : undefined}
        imageInputCount={canvas.edges.filter(edge => edge.target === editor.id && isVideoImageUse(edge.targetHandle)).length}
        onClose={() => { setEditingId(null); stageRef.current.querySelector(`[data-bnode="${editor.id}"] .md-bnode-face`)?.focus({ preventScroll: true }) }}
        onChange={data => editNode(editor, data)} onRun={() => run(editor)} onStatus={() => status(editor)} onUpload={file => upload(editor, file)} onHistory={() => setHistoryNode(editor.id)} />}

      {canvas.nodes.length ? null : (
        <div className="md-board-empty md-board-chrome">
          <h2>{t('从一个节点开始')}</h2>
          <p className="md-muted">{t('写脚本、放参考图，再接到图片或视频生成节点。也可以让右边的助手帮你搭好。')}</p>
          <div className="md-board-empty-row">{['text', 'image', 'imageGen', 'videoGen'].map(type => <button type="button" key={type} className="md-btn" onClick={() => addNode(type)}>{t(NODE_INFO[type].label)}</button>)}</div>
        </div>
      )}

      {chosen.length > 1 || canRelease ? (
        <div className="md-toolrow md-board-selection md-board-chrome" onPointerDown={e => e.stopPropagation()}>
          <span className="md-muted">{t('已选 {n} 个', { n: chosen.length })}</span>
          {arrangeable.length > 1 && <>
            <IconButton icon="list" label={t('水平排列')} onClick={() => applyMoves(arrangeSelection(arrangeable, 'horizontal'))} />
            <IconButton icon="wall" label={t('垂直排列')} onClick={() => applyMoves(arrangeSelection(arrangeable, 'vertical'))} />
            <IconButton icon="scatter" label={t('宫格排列')} onClick={() => applyMoves(arrangeSelection(arrangeable, 'grid'))} />
          </>}
          {chosenCards.length > 0 && chosenGroups.length <= 1 && <button type="button" className="md-btn" onClick={group}>{chosenGroups.length ? t('加入分组') : t('将所选节点分组')}</button>}
          {canRelease && <button type="button" className="md-btn" onClick={ungroup}>{chosenGroups.length ? t('解散分组') : t('移出分组')}</button>}
          <IconButton icon="copy" label={t('复制')} onClick={copySelected} />
          <IconButton icon="trash" label={t('删除')} onClick={removeSelected} />
        </div>
      ) : null}

      <DockBar label={t('画布视图')} className="md-flow-view md-board-chrome">
        <div ref={views.ref} className="md-flow-menu-anchor">
          <IconButton icon="more" label={t('画布工具')} aria-expanded={views.open} active={views.open} onClick={() => views.setOpen(!views.open)} />
          {views.open && <div className="md-flow-menu" onClick={() => views.setOpen(false)}>
            {[
              ['undo', t('撤销'), () => undo('undo')], ['refresh', t('重做'), () => undo('redo')],
              ['branch', t('整理画布'), () => applyMoves(arrangeAll(canvas.nodes, canvas.edges))],
              ['image', options.map ? t('隐藏地图') : t('显示地图'), () => setOptions(o => ({ ...o, map: !o.map }))],
              ['pin', options.snap ? t('关闭网格吸附') : t('开启网格吸附'), () => setOptions(o => ({ ...o, snap: !o.snap }))],
              ['link', options.edges ? t('隐藏连线') : t('显示连线'), () => setOptions(o => ({ ...o, edges: !o.edges }))],
            ].map(([icon, label, act]) => <button key={icon} type="button" onClick={act}><Icon name={icon} />{label}</button>)}
          </div>}
        </div>
        <IconButton icon="expand" label={t('适应视图')} onClick={() => fit()} />
        <IconButton icon="zoomOut" label={t('缩小')} onClick={() => zoomTo(Math.max(0.2, cam.current.ts / ZOOM_STEP))} />
        <button type="button" className="md-board-zoom" title={t('重置缩放')} onClick={() => zoomTo(1)}>{Math.round(zoom * 100)}%</button>
        <IconButton icon="zoomIn" label={t('放大')} onClick={() => zoomTo(Math.min(8, cam.current.ts * ZOOM_STEP))} />
      </DockBar>

      <DockBar label={t('节点操作')} className="md-flow-actions md-board-chrome" addAction={
        <div className="md-flow-menu-anchor" ref={additions.ref}>
          <DockAddButton label={t('添加节点')} aria-expanded={additions.open} aria-controls={additions.open ? addMenuId : undefined} onClick={() => additions.setOpen(!additions.open)} />
          {additions.open && <div id={addMenuId} className="md-flow-menu" role="group" aria-label={t('添加节点')}><NodeChoices onChoose={type => {
            additions.ref.current?.querySelector('button')?.focus({ preventScroll: true })
            additions.setOpen(false)
            addNode(type)
          }} /></div>}
        </div>
      }>
        <div className="md-flow-node-tools">
          <IconButton icon="hand" label={t('拖动')} active={pointerTool === 'pan'} aria-pressed={pointerTool === 'pan'} onClick={() => setPointerTool('pan')} />
          <IconButton icon="marquee" label={t('框选')} active={pointerTool === 'select'} aria-pressed={pointerTool === 'select'} onClick={() => setPointerTool('select')} />
          <IconButton icon="search" label={t('搜索节点')} onClick={() => setSearchOpen(true)} />
        </div>
        <span className="md-dockbar-sep md-flow-shortcuts" aria-hidden="true" />
        <div className="md-chips md-flow-shortcuts">
          {['text', 'imageGen', 'videoGen'].map(type => <button type="button" key={type} aria-label={t('添加{type}节点', { type: t(NODE_INFO[type].label) })} onClick={() => addNode(type)}>{t(NODE_INFO[type].label)}</button>)}
        </div>
      </DockBar>

      {options.map ? <div className="md-board-chrome"><MiniMap canvas={canvas} cam={cam} stageRef={stageRef} flyTo={flyTo} /></div> : null}
      {contextMenu.open && menuPoint && <div ref={contextMenu.ref} className="md-flow-menu md-context-menu md-board-chrome" role="group" aria-label={t('添加节点')}>
        <NodeChoices onChoose={type => { contextMenu.setOpen(false); addNode(type, menuPoint.world) }} />
      </div>}
      {canPreview(preview) && <Dialog title={preview.data.label || t(NODE_INFO[preview.type].label)} width={1000} onClose={() => {
        setPreviewId(null)
        stageRef.current?.querySelector(`[data-bnode="${preview.id}"] .md-bnode-face`)?.focus({ preventScroll: true })
      }}>
        {['video', 'videoGen'].includes(preview.type)
          ? <video className="md-expanded-media" src={fileUrl(preview.data.src)} controls playsInline autoFocus />
          : <img className="md-expanded-media" src={fileUrl(preview.data.src)} alt={preview.data.label || t('图片')} />}
      </Dialog>}
      {searchOpen ? <NodeSearch canvas={canvas} onClose={() => setSearchOpen(false)} onPick={(node) => { setSearchOpen(false); setEditingId(null); setSelected(new Set([node.id])); fit([node]) }} /> : null}
      {historyNode && byId.get(historyNode) ? <HistoryDialog node={byId.get(historyNode)} onClose={() => setHistoryNode(null)} onPick={(src) => { patchNode(historyNode, { src }); setHistoryNode(null) }} /> : null}
    </div>
  )
}

function useCanvasSync(id) {
  const doc = React.useMemo(() => canvasDocument(id, call, () => toast(t('画布已在别处修改，已合并最新内容'))), [id])
  const canvas = React.useSyncExternalStore(doc.subscribe, doc.snapshot)
  const [error, setError] = React.useState(null)
  React.useEffect(() => {
    if (!id) return
    let mounted = true
    const view = crypto.randomUUID()
    const presence = closed => call('canvas/presence', { id, view, closed }).catch(err => { if (mounted) report(err) })
    setError(null)
    doc.refresh().then(() => { if (mounted) presence(false) }).catch(err => { if (mounted) setError(err.message) })
    const timer = setInterval(() => presence(false), 25_000)
    return () => { mounted = false; clearInterval(timer); presence(true); doc.flush().catch(report) }
  }, [id, doc])
  const edit = React.useCallback(next => doc.edit(next, report), [doc])
  return { canvas, error, setCanvas: edit, saver: doc, reload: doc.refresh }
}

export function CanvasView() {
  const [openError, setOpenError] = React.useState(null)
  const [openAttempt, retryOpen] = React.useReducer(attempt => attempt + 1, 0)
  const [list, setList] = React.useState(null)
  const [currentId, setCurrentId] = React.useState(null)
  const dockOpen = useDesk(s => s.dockOpen)
  const refresh = async () => {
    const { canvases } = await call('canvas/list')
    setList(canvases)
    return canvases
  }
  React.useEffect(() => {
    let active = true
    setOpenError(null)
    call('canvas/open', {}).then(({ canvases }) => {
      if (!active) return
      const previousId = localStorage.getItem('novaflow-media-desk:canvas')
      setList(canvases)
      setCurrentId(canvases.find(row => row.id === previousId)?.id ?? canvases[0]?.id ?? null)
    }).catch(err => { if (active) setOpenError(err.message) })
    return () => { active = false }
  }, [openAttempt])
  React.useEffect(() => { if (currentId) localStorage.setItem('novaflow-media-desk:canvas', currentId) }, [currentId])
  const { canvas, error, setCanvas, saver, reload } = useCanvasSync(currentId)

  const create = async ({ name, folder }) => {
    try {
      await saver.flush()
      const data = await call('canvas/create', { name, folder })
      await refresh()
      setCurrentId(data.canvas.id)
    } catch (err) {
      report(err)
    }
  }
  const rename = async (row, { name, folder }) => {
    try {
      await saver.flush()
      const fresh = (await call(`canvas/get?id=${encodeURIComponent(row.id)}`)).canvas
      const renamed = (await call('canvas/rename', { id: row.id, revision: fresh.revision, name })).canvas
      if (folder !== null && folder !== (row.folder ?? '')) await call('canvas/move', { id: row.id, revision: renamed.revision, folder })
      await refresh()
      if (row.id === currentId) reload()
    } catch (err) {
      report(err)
    }
  }
  const editDetails = row => setDesk({ dialog: {
    title: t(row ? '重命名' : '新增画布'), initial: { name: row?.name ?? t('未命名画布'), folder: row?.folder ?? '' },
    fields: [{ name: 'name', label: t('画布名称'), required: true }, { name: 'folder', label: t('文件夹（可留空）') }],
    onSubmit: values => row ? rename(row, values) : create(values),
  } })
  const remove = async row => {
    try {
      await saver.flush()
      const { assets, revision } = await call(`canvas/delete-preview?id=${encodeURIComponent(row.id)}`)
      setDesk({
    dialog: {
      title: t('删除画布'),
      submitLabel: t('删除'),
      fields: [{ type: 'hidden', name: 'confirm', label: t('确定删除画布「{name}」吗？', { name: row.name }) }, ...(assets.length ? [{ type: 'checkbox', name: 'removeAssets', label: t('同时删除本画布独占的 {n} 个文件', { n: assets.length }) }, { type: 'hidden', name: 'files', label: assets.map(src => src.split('/').pop()).join('、') }] : [])],
      onSubmit: async ({ removeAssets }) => {
        try {
          await call('canvas/delete', { id: row.id, revision, assets: removeAssets ? assets : [] })
          const rows = await refresh()
          if (row.id === currentId) setCurrentId(rows[0]?.id ?? null)
        } catch (err) {
          report(err)
        }
      },
    },
      })
    } catch (err) { report(err) }
  }

  const current = list?.find(row => row.id === currentId) ?? (canvas ? { id: canvas.id, name: canvas.name } : null)
  return (
    <div className="md-home md-flow-page">
      <div className="md-board-area">
        {canvas ? <Board key={canvas.id} canvas={canvas} setCanvas={setCanvas} onSaved={saver} /> : (
          <div className="md-board-empty">
            {openError ? <><p className="md-msg-error" role="alert">{openError}</p><button type="button" className="md-btn" onClick={retryOpen}>{t('重试')}</button></> : error ? <p className="md-msg-error">{error}</p> : list && !list.length ? (
              <>
                <h2>{t('新建你的第一张画布')}</h2>
                <p className="md-muted">{t('把脚本、参考图和生成节点连起来，一张画布管住一条片子。')}</p>
                <button type="button" className="md-btn is-primary" onClick={() => editDetails()}><Icon name="plus" size={15} />{t('新增画布')}</button>
              </>
            ) : <span className="md-shimmer">{t('正在打开画布…')}</span>}
          </div>
        )}
        {list ? <div className="md-board-top md-board-chrome"><CanvasPicker list={list} current={current} onOpen={id => saver.flush().then(() => setCurrentId(id)).catch(report)} onCreate={() => editDetails()} onRename={editDetails} onDelete={remove} /></div> : null}
      </div>
      {dockOpen && canvas ? <BoardChat key={canvas.id} canvas={canvas} beforeSend={saver.flush} onCanvasChanged={reload} /> : null}
    </div>
  )
}

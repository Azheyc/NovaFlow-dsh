// /media-desk/canvas/* 接口。鉴权和同源检查在 host.js 的 route() 之前已经做过。
import { randomUUID } from 'node:crypto'
import { CanvasStore } from './canvas.js'
import { CanvasGenerator, generatorKind } from './canvas-generate.js'
import { CANVAS_GUIDE, CanvasSessions, createCanvasTools } from './canvas-agent.js'
import { tr } from './i18n.js'

const UPLOAD_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov' }
const MAX_UPLOAD = 250_000_000
const fail = (message, status = 400) => Object.assign(new Error(message), { status })

export function createCanvasDesk(ctx, { storage, root, store }) {
  const canvases = new CanvasStore(storage, () => store.read())
  const generator = new CanvasGenerator({ ctx, storage, media: () => ctx.get('novaflowMedia') })
  const sessions = new CanvasSessions(root)
  const running = new Map()
  const views = new Map()
  const open = id => [...views.values()].some(view => view.id === id && view.until > Date.now())

  async function writeResult(canvasId, nodeId, patch) {
    return canvases.update(canvasId, undefined, (canvas) => {
      const node = canvas.nodes.find(row => row.id === nodeId)
      if (node) patch(node)
      return canvas
    })
  }

  function applyJob(node, view) {
    node.data.job = { id: view.id, status: view.status, rootId: view.rootId, kind: view.kind ?? node.data.job?.kind, ...(view.error ? { error: view.error } : {}) }
    const file = view.files?.[0]
    if (view.status === 'completed' && file && node.data.src !== file) {
      if (node.data.src) node.data.history = [...(node.data.history ?? []), { src: node.data.src, at: new Date().toISOString() }].slice(-20)
      node.data.src = file
    }
  }

  async function generate(canvasId, nodeId, signal) {
    const key = `${canvasId}:${nodeId}`
    if (running.has(key)) throw fail(tr('这个节点正在生成'), 409)
    running.set(key, true)
    try {
      const canvas = await canvases.get(canvasId)
      const node = canvas.nodes.find(row => row.id === nodeId)
      const kind = node && generatorKind(node)
      if (!kind) throw fail(tr('这个节点不能生成'))
      if (['running', 'unknown'].includes(node.data.job?.status)) throw fail(tr('上一次生成还没有结果，请先查看状态，避免重复扣费'), 409)
      if (kind === 'text') {
        const { text } = await generator.text(canvas, node, signal)
        await writeResult(canvasId, nodeId, (row) => { row.data.text = text })
        return { status: 'completed', kind }
      }
      const prepared = (id, rootId) => canvases.update(canvasId, canvas.revision, current => {
        applyJob(current.nodes.find(row => row.id === nodeId), { id, rootId, kind, status: 'running' })
        return current
      })
      const view = await generator[kind](canvas, node, prepared)
      await writeResult(canvasId, nodeId, row => applyJob(row, view))
      return view
    } finally {
      running.delete(key)
    }
  }

  generate.status = async (canvasId, nodeId) => {
    const canvas = await canvases.get(canvasId)
    const node = canvas.nodes.find(row => row.id === nodeId)
    if (!node?.data.job?.id) throw fail(tr('这个节点还没有生成任务'))
    if (node.data.job.status !== 'running' || running.has(`${canvasId}:${nodeId}`)) return node.data.job
    const view = await generator.status(node.data.job.id, node.data.job.rootId)
    view.kind = node.data.job.kind
    if (view.status !== 'running') await writeResult(canvasId, nodeId, row => { if (row.data.job?.id === view.id) applyJob(row, view) })
    return view
  }

  const { tools, when } = createCanvasTools({ canvases, generate, sessions, open })
  for (const tool of tools) ctx.effect(() => ctx.tools.register(tool, { when }), `media-desk: ${tool.name}`)
  ctx.systemPrompt.section({ name: 'media-desk:canvas', order: ctx.systemPrompt.getSectionOrder('HARNESS_IDENTITY') + 20,
    text: ({ scope }) => sessions.canvasOf(scope?.session?.id) ? CANVAS_GUIDE : '' })

  /** 画布会话由 DSH 的 sessionController 创建和驱动，聊天记录、技能和工具调用都在会话里。 */
  async function bindSession(canvasId) {
    await sessions.load()
    const existing = await sessions.session(canvasId)
    if (existing) return existing
    const controller = ctx.get('sessionController')
    if (!controller) throw fail(tr('会话服务不可用'), 503)
    const created = await controller.create({ cwd: (await storage.current()).path, agentPreset: 'standard' })
    await sessions.set(canvasId, created.sessionId)
    try {
      await controller.rename({ sessionId: created.sessionId, title: tr('画布：{name}', { name: (await canvases.get(canvasId)).name }) })
    } catch { /* 标题只是方便在会话列表里识别 */ }
    return created.sessionId
  }

  async function chat(canvasId, message, requestId = randomUUID()) {
    const text = String(message ?? '').trim()
    if (!text) throw fail(tr('消息为空'))
    if (typeof requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(requestId)) throw fail('Invalid request ID')
    await canvases.get(canvasId)
    const sessionId = await canvases.serial('session-bindings', () => bindSession(canvasId))
    await ctx.get('sessionController').prompt({ requestId, sessionId, mode: 'queue', content: [{ type: 'text', text }] }, AbortSignal.timeout(30_000))
    return { sessionId }
  }

  async function transcript(canvasId) {
    const { revision } = await canvases.get(canvasId)
    const sessionId = await sessions.session(canvasId)
    if (!sessionId) return { sessionId: null, running: false, messages: [], revision }
    const controller = ctx.get('sessionController')
    const restored = await controller.resolveAgent(sessionId)
    if (restored.error) throw restored.error
    const agent = restored.agent
    const messages = (agent?.session.deriveMessages() ?? [])
      .filter(row => (row.role === 'user' && row.source?.kind === 'user') || row.role === 'assistant')
      .map(row => ({ id: row.id, role: row.role, text: row.content.filter(block => block.type === 'text').map(block => block.text).join('\n').trim() }))
      .filter(row => row.text)
    const end = agent.session.snapshotEvents().findLast(event => event.type === 'turn/end')?.data.reason
    const error = end?.kind === 'error' ? end.error?.message ?? tr('助手运行失败') : undefined
    return { sessionId, running: agent.status === 'running', messages: messages.slice(-200), revision, error }
  }

  async function upload(req, readBuffer, id) {
    await canvases.get(id)
    const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
    const ext = UPLOAD_EXT[type]
    if (!ext) throw fail(tr('不支持这种文件：{type}', { type: type || tr('未知') }), 415)
    const buffer = await readBuffer(req, MAX_UPLOAD)
    const { src } = await storage.write('assets', `${id}-${randomUUID()}${ext}`, buffer)
    return { src, kind: type.startsWith('video/') ? 'video' : 'image' }
  }

  /**
   * @returns {Promise<object|undefined>} 响应体；不是画布接口时返回 undefined。
   */
  async function handle(method, path, url, body, req, readBuffer) {
    if (!path.startsWith('canvas')) return undefined
    if (method === 'GET') {
      if (path === 'canvas/models') return ctx.get('novaflowMedia').selections()
      if (path === 'canvas/list') return { canvases: await canvases.list() }
      if (path === 'canvas/get') return { canvas: await canvases.get(url.searchParams.get('id') ?? '') }
      if (path === 'canvas/delete-preview') return canvases.deletionPreview(url.searchParams.get('id') ?? '')
      if (path === 'canvas/chat') return transcript(url.searchParams.get('id') ?? '')
      return undefined
    }
    if (path === 'canvas/asset/upload') return upload(req, readBuffer, url.searchParams.get('id'))
    const payload = await body()
    switch (path) {
      case 'canvas/open': return { canvases: await canvases.open() }
      case 'canvas/presence': {
        if (typeof payload.view !== 'string' || !/^[a-f0-9-]{36}$/.test(payload.view)) throw fail('Invalid view')
        for (const [key, view] of views) if (view.until <= Date.now()) views.delete(key)
        if (payload.closed) views.delete(payload.view)
        else { await canvases.get(payload.id); views.set(payload.view, { id: payload.id, until: Date.now() + 90_000 }) }
        return { ok: true }
      }
      case 'canvas/create': return { canvas: await canvases.create(payload) }
      case 'canvas/save': return { canvas: await canvases.save(String(payload.id), payload.revision, payload) }
      case 'canvas/rename': return { canvas: await canvases.rename(String(payload.id), payload.revision, payload.name) }
      case 'canvas/move': return { canvas: await canvases.move(String(payload.id), payload.revision, payload.folder) }
      case 'canvas/delete': return canvases.remove(String(payload.id), payload.revision, payload.assets ?? [])
      case 'canvas/generate': return { job: await generate(String(payload.id), String(payload.nodeId)), canvas: await canvases.get(String(payload.id)) }
      case 'canvas/generation/status': return { job: await generate.status(String(payload.id), String(payload.nodeId)), canvas: await canvases.get(String(payload.id)) }
      case 'canvas/chat': return chat(String(payload.id), payload.message, payload.requestId)
      case 'canvas/chat/cancel': {
        const sessionId = await sessions.session(String(payload.id))
        if (sessionId) await ctx.get('sessionController')?.cancel({ sessionId })
        return { ok: true }
      }
      default: throw fail(tr('接口不存在'), 404)
    }
  }

  return { handle }
}

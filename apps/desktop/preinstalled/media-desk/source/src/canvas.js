// 无限画布：每张画布一个 JSON 文件，存在用户选择的存储位置下的「画布」目录。
// 写入按画布串行，revision 不一致时拒绝，防止旧页面覆盖新内容。
import { randomUUID } from 'node:crypto'
import { lstat, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { checkedFolder, FILE_REF } from './storage.js'
import { join } from 'node:path'
import { tr } from './i18n.js'

import { IMAGE_TIERS, RATIOS as IMAGE_RATIOS, NODE_TYPES, PORTS } from './board-schema.js'
export { NODE_TYPES, PORTS }

const ID = /^[A-Za-z0-9_-]{1,64}$/
const fail = (message, status = 400) => Object.assign(new Error(message), { status })

/** 1K/2K 按比例换算成 16 的倍数，长边分别约 1024 和 2048。没有 4K。 */
export function imagePixels(tier, ratio = '1:1') {
  if (!Object.hasOwn(IMAGE_TIERS, tier)) throw fail(tr('图片分辨率只支持 1K 和 2K'))
  const edge = IMAGE_TIERS[tier]
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(ratio)
  if (!match || !IMAGE_RATIOS.includes(ratio)) throw fail(tr('不支持这个画面比例'))
  const w = Number(match[1])
  const h = Number(match[2])
  const scale = edge / Math.max(w, h)
  const round = value => Math.max(16, Math.round(value * scale / 16) * 16)
  return `${round(w)}x${round(h)}`
}

function text(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : fallback
}

/** 画布来自浏览器和模型工具，都不可信：只保留认识的字段。 */
export function normalizeNode(node) {
  if (!node || typeof node.id !== 'string' || !ID.test(node.id) || !NODE_TYPES.includes(node.type)) throw fail(tr('节点数据无效'))
  const data = node.data && typeof node.data === 'object' ? node.data : {}
  if (node.type === 'imageGen' && data.tier !== undefined && !Object.hasOwn(IMAGE_TIERS, data.tier)) throw fail(tr('图片分辨率只支持 1K 和 2K'))
  const isMedia = src => FILE_REF.test(src) || /^media-desk\/files\/[\w-]+\.(png|jpe?g|gif|webp|mp4|mov|webm)$/i.test(src)
  if (data.src && !isMedia(data.src)) throw fail(tr('素材引用无效'))
  const clean = {
    label: text(data.label, 80),
    text: text(data.text, 200_000),
    prompt: text(data.prompt, 32_000),
    src: text(data.src, 600),
    kind: text(data.kind, 16),
    tier: data.tier === '1K' ? '1K' : '2K',
    ratio: IMAGE_RATIOS.includes(data.ratio) ? data.ratio : '16:9',
    seconds: Number.isInteger(data.seconds) ? Math.max(1, Math.min(60, data.seconds)) : undefined,
    mode: ['text', 'firstFrame', 'reference'].includes(data.mode) ? data.mode : undefined,
    color: text(data.color, 32),
    history: Array.isArray(data.history) ? data.history.filter(row => typeof row?.src === 'string' && isMedia(row.src)).slice(-20).map(row => ({ src: text(row.src, 600), at: text(row.at, 40) })) : [],
    referenceOrder: data.referenceOrder && typeof data.referenceOrder === 'object' ? Object.fromEntries(Object.entries(data.referenceOrder).slice(0, 8).map(([key, list]) => [text(key, 40), Array.isArray(list) ? list.filter(id => typeof id === 'string').slice(0, 16) : []])) : undefined,
  }
  for (const key of Object.keys(clean)) if (clean[key] === undefined || clean[key] === '') delete clean[key]
  const sizeLimit = node.type === 'group' ? Number.MAX_SAFE_INTEGER : 4000
  return {
    id: node.id,
    type: node.type,
    position: { x: finite(node.position?.x), y: finite(node.position?.y) },
    ...(node.width ? { width: Math.max(80, Math.min(sizeLimit, finite(node.width, 320))) } : {}),
    ...(node.height ? { height: Math.max(60, Math.min(sizeLimit, finite(node.height, 240))) } : {}),
    ...(node.parentId && ID.test(node.parentId) ? { parentId: node.parentId } : {}),
    data: clean,
  }
}

export function portOf(type, id, direction) {
  return PORTS[type]?.[direction === 'source' ? 'outputs' : 'inputs'].find(port => port.id === id)
}

/** 校验一条连线：两端节点存在、端口存在且类型一致，单输入端口只接一条。 */
export function checkEdge(nodes, edges, edge) {
  const source = nodes.find(node => node.id === edge.source)
  const target = nodes.find(node => node.id === edge.target)
  if (!source || !target || source.id === target.id) throw fail(tr('连线的节点不存在'))
  const out = portOf(source.type, edge.sourceHandle, 'source')
  const input = portOf(target.type, edge.targetHandle, 'target')
  if (!out || !input) throw fail(tr('连线的端口不存在'))
  if (out.type !== input.type) throw fail(tr('{from} 不能连到 {to}', { from: out.type, to: input.type }))
  if (edges.some(row => row.id === edge.id || (row.target === edge.target && row.targetHandle === edge.targetHandle && (!input.multiple || row.source === edge.source && row.sourceHandle === edge.sourceHandle)))) {
    throw fail(tr('这个输入只能接一条连线'))
  }
}

export function normalizeCanvas(input, previous) {
  if (!Array.isArray(input.nodes) || !Array.isArray(input.edges)) throw fail(tr('画布数据无效'))
  const nodes = input.nodes.map(normalizeNode)
  const prior = new Map(previous.nodes.map(node => [node.id, node]))
  for (const node of nodes) {
    const existing = prior.get(node.id)
    if (existing?.data.job && node.type === existing.type) node.data.job = existing.data.job
  }
  for (const node of previous.nodes) if (node.data.job?.status === 'running' && !nodes.some(item => item.id === node.id && item.type === node.type)) throw fail(tr('生成中的节点需要保留到任务结束'), 409)
  if (new Set(nodes.map(node => node.id)).size !== nodes.length) throw fail(tr('节点编号重复'))
  const edges = []
  for (const raw of input.edges) {
    const edge = { id: ID.test(raw?.id) ? raw.id : `e_${randomUUID()}`, source: raw?.source, sourceHandle: raw?.sourceHandle, target: raw?.target, targetHandle: raw?.targetHandle }
    checkEdge(nodes, edges, edge)
    edges.push(edge)
  }
  const viewport = { x: finite(input.viewport?.x), y: finite(input.viewport?.y), zoom: Math.max(0.2, Math.min(8, finite(input.viewport?.zoom, 1))) }
  return { ...previous, nodes, edges, viewport }
}

export class CanvasStore {
  /** @param {{folder: () => Promise<{dir: string}>}} storage - 当前存储位置。 */
  constructor(storage, deskState = async () => null) {
    this.storage = storage
    this.deskState = deskState
    this.queues = new Map()
  }

  async dir() {
    return (await this.storage.folder('canvases')).dir
  }

  async file(id) {
    if (typeof id !== 'string' || !/^c_[0-9a-f]{16}$/.test(id)) throw fail(tr('画布不存在'), 404)
    for (const dir of await this.directories()) {
      const file = join(dir, `${id}.json`)
      const info = await lstat(file).catch(error => { if (error.code !== 'ENOENT') throw error })
      if (info?.isFile()) return file
      if (info) throw fail(tr('画布文件无效'))
    }
    throw fail(tr('画布不存在'), 404)
  }

  async directories() {
    const current = await this.storage.folder('canvases')
    const directories = [current.dir]
    for (const path of Object.values((await this.storage.roots.read()).roots)) {
      if (path === current.path) continue
      try { directories.push(await checkedFolder(path, '画布')) }
      catch (error) { if (error.code !== 'ENOENT') throw error }
    }
    return directories
  }

  serial(id, task) {
    const previous = this.queues.get(id) ?? Promise.resolve()
    const next = previous.then(task, task)
    this.queues.set(id, next)
    const release = () => { if (this.queues.get(id) === next) this.queues.delete(id) }
    next.then(release, release)
    return next
  }

  async list() {
    const files = []
    for (const dir of await this.directories()) for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isFile() && /^c_[0-9a-f]{16}\.json$/.test(entry.name)) files.push(join(dir, entry.name))
    }
    const rows = await Promise.all(files.map(async (file) => {
      try {
        const canvas = JSON.parse(await readFile(file, 'utf8'))
        if (!canvas?.novaflowCanvas) return null
        return { id: canvas.id, name: canvas.name, folder: canvas.folder ?? '', nodeCount: canvas.nodes?.length ?? 0, updatedAt: canvas.updatedAt, revision: canvas.revision }
      } catch {
        return null
      }
    }))
    return rows.filter(Boolean).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  }

  async get(id) {
    try {
      const canvas = JSON.parse(await readFile(await this.file(id), 'utf8'))
      if (!canvas?.novaflowCanvas || canvas.id !== id) throw new Error('marker')
      return canvas
    } catch (error) {
      if (error.status) throw error
      throw fail(tr('画布不存在'), 404)
    }
  }

  async write(canvas) {
    const file = await this.file(canvas.id)
    const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`
    await writeFile(tmp, JSON.stringify(canvas))
    await rename(tmp, file)
    return canvas
  }

  open() {
    return this.serial('documents', async () => {
      const canvases = await this.list()
      if (canvases.length) return canvases
      await this.createDocument({ name: tr('未命名') })
      return this.list()
    })
  }

  create(options) {
    return this.serial('documents', () => this.createDocument(options))
  }

  async createDocument({ name, folder } = {}) {
    const now = new Date().toISOString()
    const id = `c_${randomUUID().replace(/-/g, '').slice(0, 16)}`
    const canvas = { novaflowCanvas: 1, id, name: text(name, 60).trim() || tr('未命名画布'), folder: text(folder, 60).trim(), revision: 1, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, createdAt: now, updatedAt: now }
    await writeFile(join(await this.dir(), `${id}.json`), JSON.stringify(canvas), { flag: 'wx' })
    return canvas
  }

  /** 按 revision 乐观并发：调用方拿到的版本必须是当前版本。 */
  update(id, revision, mutate) {
    return this.serial('documents', async () => {
      const current = await this.get(id)
      if (revision !== undefined && revision !== current.revision) throw Object.assign(fail(tr('画布已在别处修改，请刷新后再试'), 409), { code: 'CANVAS_CONFLICT', current })
      const next = await mutate(structuredClone(current))
      next.revision = current.revision + 1
      next.updatedAt = new Date().toISOString()
      return this.write(next)
    })
  }

  save(id, revision, body) {
    if (!Number.isSafeInteger(revision)) throw fail(tr('缺少画布版本'))
    return this.update(id, revision, current => normalizeCanvas(body, current))
  }

  rename(id, revision, name) {
    return this.update(id, revision, (current) => {
      current.name = text(name, 60).trim() || current.name
      return current
    })
  }

  move(id, revision, folder) {
    return this.update(id, revision, (current) => {
      current.folder = text(folder, 60).trim()
      return current
    })
  }

  async deletionPreview(id) {
    const canvas = await this.get(id)
    if (canvas.nodes.some(node => node.data.job?.status === 'running')) throw fail(tr('请在生成任务结束后删除画布'), 409)
    const refs = new Set(canvas.nodes.flatMap(node => [node.data.src, ...(node.data.history ?? []).map(row => row.src)]).filter(src => FILE_REF.test(src) && src.split('/').pop().startsWith(`${id}-`)))
    for (const dir of await this.directories()) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (!/^c_[0-9a-f]{16}\.json$/.test(entry.name) || entry.name === `${id}.json`) continue
        if (!entry.isFile()) throw fail(tr('无法核对其他画布的素材引用'))
        const serialized = JSON.stringify(JSON.parse(await readFile(join(dir, entry.name), 'utf8')))
        for (const src of refs) if (serialized.includes(JSON.stringify(src))) refs.delete(src)
      }
    }
    const state = JSON.stringify(await this.deskState())
    return { revision: canvas.revision, assets: [...refs].filter(src => !state.includes(JSON.stringify(src))) }
  }

  remove(id, revision, requested) {
    return this.serial('documents', async () => {
      const preview = await this.deletionPreview(id)
      if (revision !== preview.revision) throw fail(tr('画布已变更，请重新确认'), 409)
      if (!Array.isArray(requested) || requested.some(src => !preview.assets.includes(src))) throw fail(tr('素材引用已变更，请重新确认'), 409)
      for (const src of requested) {
        const path = await this.storage.resolve(src)
        if (path) await rm(path)
      }
      await rm(await this.file(id))
      return { id }
    })
  }
}

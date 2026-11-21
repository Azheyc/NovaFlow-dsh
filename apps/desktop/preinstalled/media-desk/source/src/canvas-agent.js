// 画布助手：每张画布绑一个 DSH 会话。会话、模型、技能目录和 skill 加载都由 DSH 负责，
// 这里只注册只在画布会话里生效的画布工具，并把用户消息送进会话。
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { checkEdge, NODE_TYPES, normalizeNode, PORTS } from './canvas.js'
import { arrangeAll, boundsOf } from './board-layout.js'
import { tr } from './i18n.js'

const BATCH = 64
const PAGE = 100
const fail = message => Object.assign(new Error(message), { status: 400 })

export const CANVAS_GUIDE = `你在 NovaFlow 内容工作台的无限画布会话里。画布由节点和连线组成：
- 节点类型：text（文本，输出 TEXT）、image（图片素材，输出 IMAGE）、video（视频素材，输出 VIDEO）、imageGen（图片生成，输入 prompt:TEXT、reference:IMAGE 多张，输出 IMAGE）、videoGen（视频生成，输入 prompt:TEXT、firstFrame:IMAGE、reference:IMAGE 多张，输出 VIDEO）、group（分组）。
- 用 canvas_read 查看画布，用 canvas_edit 新增、修改、移动、删除节点和连线，用 canvas_generate 让生成节点出图或出视频，用 canvas_generation_status 查进度。
- 图片生成只支持 1K 和 2K（tier 字段），不支持 4K；比例用 ratio，例如 16:9。视频比例和时长以 NovaFlow 当前视频模型能力为准。
- 先连好真实的参考素材再生成。生成会消耗算力：一次方案统一确认，结果不明时先查状态，不要重复提交。
- 需要专业流程（剧本、分镜、角色、场景）时，按会话技能目录调用对应技能，画布工具只负责落地。`

function pick(node, fields) {
  const row = { id: node.id, type: node.type, label: node.data.label ?? '' }
  if (fields.includes('position')) row.position = node.position
  if (fields.includes('data')) {
    const { text, prompt, ...rest } = node.data
    row.data = { ...rest, ...(prompt ? { prompt: prompt.slice(0, 4000), promptLength: prompt.length } : {}), ...(text ? { text: text.slice(0, 4000), textLength: text.length } : {}) }
  }
  if (fields.includes('ports')) row.ports = PORTS[node.type]
  return row
}

/** 画布会话的绑定记录：canvasId → sessionId，存在插件状态目录。 */
export class CanvasSessions {
  constructor(root) {
    this.file = join(root, 'canvas-sessions.json')
    this.bindings = null
  }

  async load() {
    if (this.bindings) return this.bindings
    try {
      this.bindings = JSON.parse(await readFile(this.file, 'utf8'))
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      this.bindings = {}
    }
    return this.bindings
  }

  async set(canvasId, sessionId) {
    const bindings = await this.load()
    bindings[canvasId] = sessionId
    await mkdir(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(bindings, null, 2))
    await rename(tmp, this.file)
  }

  async session(canvasId) {
    return (await this.load())[canvasId]
  }

  canvasOf(sessionId) {
    return Object.entries(this.bindings ?? {}).find(([, id]) => id === sessionId)?.[0]
  }
}

export function createCanvasTools({ canvases, generate, sessions, open }) {
  const canvasFor = (exec) => {
    const id = exec.agent && sessions.canvasOf(exec.agent.session.id)
    if (!id) throw fail(tr('这个会话没有绑定画布'))
    if (!open(id)) throw fail(tr('画布未打开'))
    return id
  }
  const result = value => ({ ok: true, value })
  const output = { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] }
  const when = ({ agent }) => open(sessions.canvasOf(agent.session.id))

  const read = {
    name: 'canvas_read',
    description: 'Read the bound canvas by pages. Set kind to nodes or edges. Filter by IDs, types or query. With fields ["data"], text and prompts are returned in 4000-character portions using offset.',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        nodeIds: { type: 'array', items: { type: 'string' } },
        types: { type: 'array', items: { type: 'string', enum: NODE_TYPES } },
        query: { type: 'string' },
        fields: { type: 'array', items: { type: 'string', enum: ['position', 'data', 'ports'] } },
        cursor: { type: 'integer' },
        offset: { type: 'integer' }, kind: { type: 'string', enum: ['nodes', 'edges'] },
      },
    },
    output,
    execute: async (args, exec) => {
      if (args.cursor < 0 || args.nodeIds?.length > 20) throw fail('Invalid page or too many node IDs')
      const canvas = await canvases.get(canvasFor(exec))
      const fields = args.fields ?? ['position']
      let nodes = canvas.nodes
      if (args.nodeIds?.length) nodes = nodes.filter(node => args.nodeIds.includes(node.id))
      if (args.types?.length) nodes = nodes.filter(node => args.types.includes(node.type))
      if (args.query) nodes = nodes.filter(node => `${node.data.label ?? ''} ${node.data.text ?? ''} ${node.data.prompt ?? ''}`.includes(args.query))
      const start = args.cursor ?? 0
      const ids = new Set(nodes.map(node => node.id))
      const rows = args.kind === 'edges' ? canvas.edges.filter(edge => ids.has(edge.source) || ids.has(edge.target)) : nodes
      const page = []
      let bytes = 0
      for (const item of rows.slice(start, start + PAGE)) {
        const value = args.kind === 'edges' ? item : pick(item, fields)
        if (value.data && args.offset) for (const key of ['text', 'prompt']) if (item.data[key]) value.data[key] = item.data[key].slice(args.offset, args.offset + 4000)
        const length = Buffer.byteLength(JSON.stringify(value))
        if (page.length && bytes + length > 60_000) break
        page.push(value); bytes += length
      }
      return result({
        canvas: { id: canvas.id, name: canvas.name, revision: canvas.revision, totalNodes: canvas.nodes.length, totalEdges: canvas.edges.length },
        [args.kind === 'edges' ? 'edges' : 'nodes']: page,
        ...(start + page.length < rows.length ? { nextCursor: start + page.length } : {}),
      })
    },
  }

  const edit = {
    name: 'canvas_edit',
    description: 'Apply up to 64 structural changes to the bound NovaFlow canvas in one atomic step: add/update/move/delete nodes, connect or delete edges. Pass the revision from canvas_read; a stale revision is rejected. Image generation nodes accept tier "1K" or "2K" only.',
    parameters: {
      type: 'object', additionalProperties: false, required: ['revision', 'operations'],
      properties: {
        revision: { type: 'integer' },
        operations: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false, required: ['op'],
            properties: {
              op: { type: 'string', enum: ['addNode', 'updateNode', 'moveNode', 'deleteNode', 'connect', 'deleteEdge', 'arrangeCanvas', 'fitCanvas'] },
              id: { type: 'string' },
              type: { type: 'string', enum: NODE_TYPES },
              position: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'], additionalProperties: false },
              data: { type: 'object', additionalProperties: true },
              source: { type: 'string' }, sourceHandle: { type: 'string' },
              target: { type: 'string' }, targetHandle: { type: 'string' },
            },
          },
        },
      },
    },
    output,
    execute: async (args, exec) => {
      const id = canvasFor(exec)
      const created = []
      if (!args.operations.length || args.operations.length > BATCH) throw fail('Supply 1–64 operations')
      const next = await canvases.update(id, args.revision, (canvas) => {
        for (const op of args.operations) applyOperation(canvas, op, created)
        return canvas
      })
      return result({ revision: next.revision, created, nodeCount: next.nodes.length, edgeCount: next.edges.length })
    },
  }

  const run = {
    name: 'canvas_generate',
    description: 'Run one text, imageGen or videoGen node on the bound canvas. Image and video generation are billed: confirm the plan with the user first, and never resubmit a node whose job is running or unknown.',
    parameters: { type: 'object', additionalProperties: false, required: ['nodeId'], properties: { nodeId: { type: 'string' } } },
    output,
    execute: async (args, exec) => result(await generate(canvasFor(exec), args.nodeId, exec.signal)),
  }

  const status = {
    name: 'canvas_generation_status',
    description: 'Check the generation job of a node on the bound canvas and write finished files back to it.',
    parameters: { type: 'object', additionalProperties: false, required: ['nodeId'], properties: { nodeId: { type: 'string' } } },
    output,
    execute: async (args, exec) => result(await generate.status(canvasFor(exec), args.nodeId)),
  }

  return { tools: [read, edit, run, status], when }
}

export function applyOperation(canvas, op, created) {
  const find = id => canvas.nodes.find(node => node.id === id)
  switch (op.op) {
    case 'addNode': {
      if (!NODE_TYPES.includes(op.type)) throw fail(tr('节点类型无效'))
      const node = normalizeNode({ id: `n_${randomUUID().slice(0, 12)}`, type: op.type, position: op.position ?? { x: 0, y: 0 }, data: op.data ?? {} })
      canvas.nodes.push(node)
      created.push(node.id)
      return
    }
    case 'updateNode': {
      const node = find(op.id)
      if (!node) throw fail(tr('节点不存在：{id}', { id: op.id }))
      const { src, history, job, ...data } = op.data ?? {}
      const updated = normalizeNode({ ...node, data: { ...node.data, ...data } })
      if (node.data.job) updated.data.job = node.data.job
      Object.assign(node, updated)
      return
    }
    case 'moveNode': {
      const node = find(op.id)
      if (!node || !op.position) throw fail(tr('节点不存在：{id}', { id: op.id }))
      node.position = normalizeNode({ ...node, position: op.position }).position
      return
    }
    case 'deleteNode':
      if (find(op.id)?.data.job?.status === 'running') throw fail(tr('生成中的节点需要保留到任务结束'))
      canvas.nodes = canvas.nodes.filter(node => node.id !== op.id)
      canvas.edges = canvas.edges.filter(edge => edge.source !== op.id && edge.target !== op.id)
      return
    case 'connect': {
      const edge = { id: `e_${randomUUID().slice(0, 12)}`, source: op.source, sourceHandle: op.sourceHandle, target: op.target, targetHandle: op.targetHandle }
      checkEdge(canvas.nodes, canvas.edges, edge)
      canvas.edges.push(edge)
      created.push(edge.id)
      return
    }
    case 'deleteEdge':
      canvas.edges = canvas.edges.filter(edge => edge.id !== op.id)
      return
    case 'arrangeCanvas': {
      const positions = arrangeAll(canvas.nodes, canvas.edges)
      for (const node of canvas.nodes) if (positions[node.id]) node.position = positions[node.id]
      return
    }
    case 'fitCanvas':
      if (boundsOf(canvas.nodes)) canvas.fitRequest = randomUUID()
      return
    default:
      throw fail(tr('不支持的画布操作'))
  }
}

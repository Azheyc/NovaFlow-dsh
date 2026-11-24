// 画布节点生成：文本走 DSH 当前模型，图片和视频走 NovaFlow「设置 → 模型」选中的模型和分组。
// 产出的文件都写到存储位置的「生成」目录，节点里只记录文件引用和任务编号。
import { randomUUID } from 'node:crypto'
import { copyFile } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, sep } from 'node:path'
import { callModel } from './ai.js'
import { imagePixels, PORTS } from './canvas.js'
import { tr } from './i18n.js'
import { checkedFolder, rootId } from './storage.js'
import { imagePromptSource } from './board-schema.js'

const VIDEO_SIZES = { '16:9': '1280x720', '9:16': '720x1280', '1:1': '960x960', '4:3': '960x720', '3:4': '720x960', '21:9': '1680x720' }
const fail = (message, status = 400) => Object.assign(new Error(message), { status })

/** 按实际连线和 referenceOrder 取输入；排序规则和创作工作台一致。 */
export function inputsOf(canvas, nodeId, handle) {
  const node = canvas.nodes.find(row => row.id === nodeId)
  const order = node?.data?.referenceOrder?.[handle] ?? []
  const rank = id => {
    const at = order.indexOf(id)
    return at < 0 ? Number.MAX_SAFE_INTEGER : at
  }
  return canvas.edges
    .map((edge, index) => ({ edge, index }))
    .filter(({ edge }) => edge.target === nodeId && edge.targetHandle === handle)
    .sort((a, b) => rank(a.edge.source) - rank(b.edge.source) || a.index - b.index)
    .map(({ edge }) => canvas.nodes.find(row => row.id === edge.source))
    .filter(Boolean)
}

function textOf(node) {
  return node?.type === 'text' ? node.data.text ?? '' : ''
}

export function promptOf(canvas, node) {
  const source = imagePromptSource(canvas, node)
  if (source) return textOf(source).trim()
  const linked = inputsOf(canvas, node.id, 'prompt').map(textOf).filter(Boolean)
  return [node.data.prompt, ...linked].map(value => String(value ?? '').trim()).filter(Boolean).join('\n\n')
}

export function mediaSrc(node) {
  return node?.data?.src || null
}

export class CanvasGenerator {
  constructor({ ctx, storage, media }) {
    this.ctx = ctx
    this.storage = storage
    this.media = media
  }

  requireMedia() {
    const media = this.media()
    if (!media) throw fail(tr('NovaFlow 媒体服务不可用，请先登录 NovaFlow'), 503)
    return media
  }

  async parameters(kind, choices) {
    const model = (await this.requireMedia().selections())[kind]
    if (!model) throw fail(tr('请在 NovaFlow「设置 → 模型」中选择对应的媒体模型'))
    for (const [key, value] of Object.entries(choices)) {
      if (value !== undefined && model.capabilities?.[key] && !model.capabilities[key].includes(value)) throw fail(tr('当前模型不支持这个生成参数'))
    }
    return { model: model.id, group: model.group }
  }

  /** 生成服务只读当前存储位置里的文件；旧位置的参考图先复制到「素材」。 */
  async referencePath(src, root) {
    const file = await this.storage.resolve(src)
    if (!file) throw fail(tr('参考图不存在：{src}', { src }))
    const rel = relative(root.path, file)
    if (rel && !isAbsolute(rel) && !rel.startsWith(`..${sep}`) && rel !== '..') return rel.split(sep).join('/')
    const dir = await checkedFolder(root.path, '素材', true)
    const name = `ref_${randomUUID().slice(0, 12)}${extname(file)}`
    await copyFile(file, join(dir, name))
    return `素材/${name}`
  }

  toSrc(root, file) {
    const rel = relative(root.path, file).split(sep).join('/')
    return `media-desk/files/${rootId(root.path)}/${rel}`
  }

  async text(canvas, node, signal) {
    const prompt = promptOf(canvas, node)
    if (!prompt) throw fail(tr('请先填写提示词，或连接文本节点'))
    const { text, model } = await callModel(this.ctx, {
      system: '你是 NovaFlow 内容工作台画布里的文本节点。根据要求直接写出可用的正文，使用 Markdown，不要解释你在做什么。',
      user: prompt,
      maxTokens: 6000,
      useDefault: true,
      signal,
    })
    return { text: text.trim(), model }
  }

  async image(canvas, node, prepared) {
    const prompt = promptOf(canvas, node)
    if (!prompt && imagePromptSource(canvas, node)) throw fail(tr('请在已连接的文本节点中填写提示词'))
    if (!prompt) throw fail(tr('请先填写提示词，或连接文本节点'))
    const root = await this.storage.current()
    const references = []
    for (const ref of inputsOf(canvas, node.id, 'reference')) {
      const src = mediaSrc(ref)
      if (!src) throw fail(tr('参考图「{label}」还没有图片', { label: ref.data.label || ref.id }))
      references.push(await this.referencePath(src, root))
    }
    const asksFor4K = /(?<![a-z\d])(?:4\s*k|uhd|2160p)(?![a-z\d])|(?:3840|4096)\s*[×x*]|[×x*]\s*(?:3840|4096)/i.test(prompt.normalize('NFKC'))
    const tier = asksFor4K ? '2K' : node.data.tier ?? '2K'
    const ratio = node.data.ratio ?? '16:9'
    const size = imagePixels(tier, ratio)
    const selection = await this.parameters('image', { tiers: tier, ratios: ratio })
    const job = await this.requireMedia().generateImage({
      ...selection, prompt, size, n: 1,
      path: `生成/图片/${canvas.id}-${randomUUID()}`,
      ...(references.length ? { reference_images: references } : {}),
    }, root.path, id => prepared(id, root.id))
    return this.view(job, root, 'image')
  }

  async video(canvas, node, prepared) {
    const prompt = promptOf(canvas, node)
    if (!prompt) throw fail(tr('请先填写提示词，或连接文本节点'))
    const root = await this.storage.current()
    const first = inputsOf(canvas, node.id, 'firstFrame')[0]
    const refs = inputsOf(canvas, node.id, 'reference')
    const mode = node.data.mode ?? (first ? 'firstFrame' : refs.length ? 'reference' : 'text')
    const selection = await this.parameters('video', { modes: mode, durations: node.data.seconds, ratios: node.data.ratio ?? '16:9' })
    const args = { ...selection, prompt, path: `生成/视频/${canvas.id}-${randomUUID()}` }
    if (node.data.seconds) args.seconds = node.data.seconds
    args.size = VIDEO_SIZES[node.data.ratio ?? '16:9']
    if (!args.size) throw fail(tr('不支持这个视频比例'))
    if ((mode !== 'firstFrame' && first) || (mode !== 'reference' && refs.length)) throw fail(tr('生成方式与参考图连线不一致'))
    if (mode === 'firstFrame') {
      if (!mediaSrc(first)) throw fail(tr('首帧模式需要连接一张已有图片'))
      args.image = await this.referencePath(mediaSrc(first), root)
    } else if (mode === 'reference') {
      if (!refs.length) throw fail(tr('参考模式需要至少连接一张图片'))
      args.reference_images = []
      for (const ref of refs) {
        if (!mediaSrc(ref)) throw fail(tr('参考图「{label}」还没有图片', { label: ref.data.label || ref.id }))
        args.reference_images.push(await this.referencePath(mediaSrc(ref), root))
      }
    }
    const job = await this.requireMedia().generateVideo(args, root.path, id => prepared(id, root.id))
    return this.view(job, root, 'video')
  }

  async status(jobId, id) {
    const path = await this.storage.roots.path(id)
    if (!path) throw fail(tr('找不到任务的存储位置'))
    const root = { path }
    const job = await this.requireMedia().result(jobId, root.path)
    return this.view(job, root)
  }

  view(job, root, kind) {
    return {
      id: job.id,
      kind,
      status: job.status,
      ...(job.error ? { error: job.error } : {}),
      rootId: rootId(root.path),
      files: (job.files ?? []).map(file => this.toSrc(root, file)),
    }
  }
}

export function generatorKind(node) {
  if (node.type === 'text') return 'text'
  if (node.type === 'imageGen') return 'image'
  if (node.type === 'videoGen') return 'video'
  return null
}

export { PORTS }

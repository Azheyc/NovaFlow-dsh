// 画布的浏览器侧请求和本地状态：编辑立刻反映到界面，防抖后带 revision 保存。
import { report, toast } from '../desk.js'
import { lang, t } from '../i18n.js'

const BASE = 'media-desk/'

export async function call(path, body) {
  const init = body === undefined
    ? { headers: { 'x-media-desk-lang': lang() } }
    : { method: 'POST', headers: { 'content-type': 'application/json', 'x-media-desk-lang': lang() }, body: JSON.stringify(body) }
  const res = await fetch(BASE + path, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || t('请求失败（{status}）', { status: res.status })), { status: res.status, code: data.code })
  return data
}

export async function uploadFile(file, canvasId) {
  const res = await fetch(`${BASE}canvas/asset/upload?id=${encodeURIComponent(canvasId)}`, { method: 'POST', headers: { 'content-type': file.type, 'x-media-desk-lang': lang() }, body: file })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || t('上传失败'))
  return data
}

export { PORTS, NODE_INFO, RATIOS, TIERS } from '../../src/board-schema.js'

export function uid(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
}

export function fileUrl(src) {
  return src ? src.replace(/^media-desk\//, BASE) : ''
}

export { report, toast }

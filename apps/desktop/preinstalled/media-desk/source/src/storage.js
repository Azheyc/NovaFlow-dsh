// NovaFlow 存储位置：默认使用插件数据目录，可在设置中选择其他目录。
// 状态文件只记录根目录编号，旧文件在更换目录后仍从原目录读取。
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { access, lstat, mkdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { tr } from './i18n.js'

export const STORAGE_FOLDERS = { assets: '素材', images: '生成/图片', videos: '生成/视频', exports: '成稿', canvases: '画布' }
export const FILE_REF = /^media-desk\/files\/(r[0-9a-f]{12})\/((?:素材|生成\/(?:图片|视频))\/[\w-]+\.(?:png|jpg|jpeg|gif|webp|mp4|mov|webm))$/i

const fail = message => Object.assign(new Error(message), { status: 400 })
const inside = rel => rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)

export function rootId(path) {
  return `r${createHash('sha256').update(path).digest('hex').slice(0, 12)}`
}

/** 校验目录是用户可写的绝对路径，并返回解析符号链接后的路径。 */
export async function validateRoot(value, prepare = true) {
  const path = typeof value === 'string' ? value.trim() : ''
  if (!path || path.includes('\0') || !isAbsolute(path)) throw fail(tr('请选择一个文件夹作为存储位置'))
  if (process.platform === 'win32' && !/^(?:[a-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+)/i.test(path)) throw fail(tr('请选择一个文件夹作为存储位置'))
  let info
  try {
    info = await stat(path)
  } catch {
    throw fail(tr('存储位置不存在，请重新选择'))
  }
  if (!info.isDirectory()) throw fail(tr('存储位置必须是文件夹'))
  try {
    await access(path, constants.R_OK | constants.W_OK)
  } catch {
    throw fail(tr('没有权限写入这个文件夹，请换一个位置'))
  }
  const canonical = await realpath(path)
  if (prepare) for (const folder of Object.values(STORAGE_FOLDERS)) await checkedFolder(canonical, folder, true)
  return canonical
}

export async function checkedFolder(root, folder, create = false) {
  let path = root
  if (await realpath(root) !== root) throw fail(tr('存储路径已变更'))
  for (const segment of folder.split('/')) {
    path = join(path, segment)
    if (create) await mkdir(path).catch(error => { if (error.code !== 'EEXIST') throw error })
    if (!(await lstat(path)).isDirectory()) throw fail(tr('存储目录不能是链接或文件'))
  }
  return path
}

export class StorageRoots {
  constructor(file) {
    this.file = file
    this.writing = Promise.resolve()
  }

  async read() {
    try {
      const saved = JSON.parse(await readFile(this.file, 'utf8'))
      return saved && typeof saved.roots === 'object' ? saved : { roots: {} }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      return { roots: {} }
    }
  }

  async register(path) {
    const work = this.writing.then(() => this.saveRoot(path))
    this.writing = work.catch(() => {})
    return work
  }

  async saveRoot(path) {
    const saved = await this.read()
    const id = rootId(path)
    if (saved.roots[id] === path) return id
    saved.roots[id] = path
    const tmp = `${this.file}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(saved, null, 2), { mode: 0o600 })
    await rename(tmp, this.file)
    return id
  }

  async path(id) {
    return (await this.read()).roots[id]
  }
}

export class Storage {
  constructor({ settings, roots, filesDir }) {
    this.settings = settings
    this.roots = roots
    this.filesDir = filesDir
  }

  async status() {
    const { exportDir } = await this.settings.read()
    const location = exportDir || this.filesDir
    try {
      if (!exportDir) await mkdir(location, { recursive: true, mode: 0o700 })
      const path = await validateRoot(location, false)
      return { configured: true, path, id: await this.roots.register(path) }
    } catch (error) {
      return { configured: false, path: location, error: error.message }
    }
  }

  async current() {
    const status = await this.status()
    if (!status.configured) throw Object.assign(new Error(status.error || tr('请先在设置中选择存储位置')), { status: 409, code: 'STORAGE_REQUIRED' })
    return status
  }

  async folder(kind) {
    const root = await this.current()
    const folder = STORAGE_FOLDERS[kind]
    const path = await checkedFolder(root.path, folder, true)
    return { ...root, folder, dir: path }
  }

  /** 写入一个新文件，返回界面和状态里使用的引用。 */
  async write(kind, name, buffer) {
    if (!/^[\w.-]+$/.test(name)) throw fail(tr('文件名无效'))
    const target = await this.folder(kind)
    const file = join(target.dir, name)
    await writeFile(file, buffer, { flag: 'wx' })
    return { file, src: `media-desk/files/${target.id}/${target.folder}/${name}` }
  }

  /** 只解析登记过的存储根目录，拒绝路径穿越和指向目录外的符号链接。 */
  async resolve(src) {
    const legacy = /^media-desk\/files\/([\w-]+\.(?:png|jpeg|jpg|gif|webp|mp4|mov|webm))$/i.exec(src ?? '')
    if (legacy) {
      const path = join(this.filesDir, legacy[1])
      return (await lstat(path).catch(() => null))?.isFile() && (await lstat(this.filesDir)).isDirectory() ? path : null
    }
    const match = FILE_REF.exec(src ?? '')
    if (!match) return null
    const root = await this.roots.path(match[1])
    if (!root) return null
    await checkedFolder(root, match[2].slice(0, match[2].lastIndexOf('/')))
    const file = resolve(root, ...match[2].split('/'))
    if (!inside(relative(root, file))) return null
    const info = await lstat(file).catch(() => null)
    if (!info?.isFile()) return null
    const canonical = await realpath(file)
    const canonicalRoot = await realpath(root)
    return inside(relative(canonicalRoot, canonical)) ? canonical : null
  }
}

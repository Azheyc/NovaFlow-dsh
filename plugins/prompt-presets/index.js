import { createHash, randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { defaults } from './catalog.js'

const text = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit
const validId = value => text(value, 200) && !Object.hasOwn(Object.prototype, value) && value !== 'prototype'

export function validCatalog(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, 'standard')) return false
  return Object.entries(value).every(([mode, catalog]) => {
    if (!validId(mode) || !Array.isArray(catalog?.categories) || !Array.isArray(catalog.featured)) return false
    const groups = new Set(), prompts = new Set()
    for (const group of catalog.categories) {
      if (!validId(group?.id) || groups.has(group.id) || !text(group.name, 100) || !Array.isArray(group.prompts)) return false
      groups.add(group.id)
      for (const prompt of group.prompts) {
        if (!validId(prompt?.id) || prompts.has(prompt.id) || !text(prompt.title, 200) || !text(prompt.body, 32000)) return false
        prompts.add(prompt.id)
      }
    }
    return catalog.featured.length <= 4 && new Set(catalog.featured).size === catalog.featured.length && catalog.featured.every(id => prompts.has(id))
  })
}

export const name = 'novaflow-prompt-presets'
export const inject = ['profileContext', 'connection']
export function apply(ctx) {
  const path = join(ctx.profileContext.dir, '.novaflow-prompt-presets.json')
  const read = async () => {
    let catalog
    try { catalog = JSON.parse(await readFile(path, 'utf8')) }
    catch (error) { if (error.code !== 'ENOENT') throw error; catalog = defaults }
    if (!validCatalog(catalog)) throw new Error('提示词库格式无效')
    return { catalog, revision: createHash('sha256').update(JSON.stringify(catalog)).digest('hex') }
  }
  const reply = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
  let writing = Promise.resolve()
  ctx.effect(() => ctx.connection.fetch.register({ path: '/api/novaflow-prompt-presets', methods: ['POST'], requestBody: 'buffered', async fetch(request) {
    const admission = ctx.connection.admit({ headers: request.headers })
    if ('rejection' in admission || admission.peer.principal.kind !== 'owner' || admission.peer.interactions !== 'answer') return reply({}, 403)
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({}, 415)
    const raw = await request.text()
    if (raw.length > 2_000_000) return reply({}, 413)
    let input
    try { input = JSON.parse(raw) } catch { return reply({}, 400) }
    try {
      if (input?.action === 'read') return reply(await read())
      if (input?.action !== 'save' || !validCatalog(input.catalog)) return reply({}, 400)
      const save = writing.then(async () => {
        if ((await read()).revision !== input.revision) return reply({}, 409)
        const temporary = `${path}.${randomUUID()}.tmp`
        try {
          await writeFile(temporary, JSON.stringify(input.catalog), { mode: 0o600, flag: 'wx' })
          await rename(temporary, path)
        } finally { await rm(temporary, { force: true }) }
        return reply(await read())
      })
      writing = save.then(() => {}, () => {})
      return await save
    } catch { return reply({}, 503) }
  } }))
}

import { createHash, randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { builtIn } from './catalog.js'

const text = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const emptyLibrary = () => ({ categories: [], featured: [] })
const legacyDefaults = new Set(`
c9ae68e04762f7ee23ca e6b437c46b9534014308 b5acd205903ef32daab1 5f42d77a507370070cbb 5738776f887044f7aadb aaea696565a6ed4ae45e 6db3f0ecc630d6e76e91 94cc81c020ece98bc12b
a98e6dd8e15b967c2a58 57eb94d8aadb6489c7ca 4c7a8a416f7dd821b0be 1d3eaa2d1bc53e7a1386 a5243031345e8b2819e4 44257cd697b611c14a5f 1a8e5728e9eb5ce7f55a eb6203e978a6ca5ca76c
debea8d2da68c8cb2eb8 b6cdb06345f0586dcb22 be8908c176a6fc2573bb 6dcab6035444f22d1085 692ec2a45ec66e0d369c dd7b0f43495974146bd5 bec10abe6aaa3dab1f57 58f40a5a03b0f42b2703
f0bda6e78c1a464813f7 4fed45fdd22f40efce75 4c764f30d470c05fd81b d7ec62e7b252dbff346e 90629d351fa40b6facb7 3bb5cff23f38d212178a e3f013d0f69e9cda032b 1da41486feea2f71443f
e9464d6395077702c2c7 8690e639b5c77e5d7d15 eacd56a95db1a5b084f5 26784f928cf43d10fe8c b3728dceb3dc276ca25f e0f7b1f5cfcdef289698 a4842c094300d15d7607 b94e84b9612de6235281
4773652b9bec9796a738 ce37c327d413543c461e e6523e90084ad101722c 781ee66d70a93523ebbc 16e6d83c07c1575b67aa 3c1f5f0ccfa39949962d dde2b31ee33521348493 82543a27457463cba7a1
fce4df169d1f401a14ce b4124f8ab8148691ba99 e4321d02c515dc1db060 41b8d6d59cb547a7e272 a962cb2ef44b71bb56bd d3cd3430452ed74fd088 455454878b0f74c858dd 81665c5eba7af5d95a5b
46695dec5fea62a98573 d73c14a9bee716bf5a61 a159cb6846008da49822 b1eb69cea8cb4ef96c85 c6bc7ced3167841f05df 713e1442d079a898eea1 a759a6f113da0b0501a1 dee7ce687cd9364f3bb1
f7e21cc97ebddae3b2d3 909b2a054586aa5345fd 4196c2c6c3870d7ecd0d b75294a1d390ea7caa51 0777e2a9efc182451cf4 df525ec63a5e0f78e29c 73d61defe96b2a52da79 09685e23dfd32712e1d0
16d546d7584f8c07448a 943128a26b30f87a1b71 28345236307555643c53 15b382869278cb60bdee d1f8b46c46e2457e43e9 5f586d701927a1bacd72 9fac2135123ffe846f71 2530d21c365402374aee
04418c3148801e81f640 083d76173bc9bd4cb0e5 2383f188e466a008ef2a 25c5b654299e3d52558b 3f8be07b8a582bf19ae2 aad0c22de408400dc3e0 bb771048766b082e8825 f05454d1d208b10484a2
`.trim().split(/\s+/))

function validLibrary(library, legacy = false) {
  if (!Array.isArray(library?.categories) || !Array.isArray(library.featured)) return false
  const groups = new Set(), prompts = new Set()
  const validId = id => text(id, 200) && (legacy || !id.startsWith('builtin:'))
  for (const group of library.categories) {
    if (!validId(group?.id) || groups.has(group.id) || !text(group.name, 100) || !Array.isArray(group.prompts)) return false
    groups.add(group.id)
    for (const prompt of group.prompts) {
      if (!validId(prompt?.id) || prompts.has(prompt.id) || !text(prompt.title, 200) || !text(prompt.body, 32000)) return false
      prompts.add(prompt.id)
    }
  }
  return library.featured.length <= 4 && new Set(library.featured).size === library.featured.length && library.featured.every(id => prompts.has(id))
}

function migrateLegacy(catalog) {
  if (!catalog?.standard || !Object.values(catalog).every(lib => validLibrary(lib, true))) throw new Error('旧提示词库格式无效')
  const custom = emptyLibrary(), groups = new Map()
  for (const lib of Object.values(catalog)) {
    const ids = new Map()
    for (const group of lib.categories) {
      const key = fingerprint([group.id, group.name])
      const migrated = []
      for (const prompt of group.prompts) {
        const signature = fingerprint([group.id, group.name, prompt.id, prompt.title, prompt.body])
        if (legacyDefaults.has(signature.slice(0, 20))) continue
        migrated.push({ id: signature, title: prompt.title, body: prompt.body })
        ids.set(prompt.id, signature)
      }
      if (migrated.length === 0 && group.prompts.length > 0) continue
      if (!groups.has(key)) {
        const target = { id: key, name: group.name, prompts: [] }
        groups.set(key, target); custom.categories.push(target)
      }
      const target = groups.get(key)
      const seen = new Set(target.prompts.map(prompt => prompt.id))
      target.prompts.push(...migrated.filter(prompt => !seen.has(prompt.id)))
    }
    for (const id of lib.featured) {
      const mapped = ids.get(id)
      if (mapped && custom.featured.length < 4 && !custom.featured.includes(mapped)) custom.featured.push(mapped)
    }
  }
  return custom
}

export const name = 'novaflow-prompt-presets'
export const inject = ['profileContext', 'connection']
export function apply(ctx) {
  const path = join(ctx.profileContext.dir, '.novaflow-prompt-presets.json')
  const read = async () => {
    let custom
    try {
      const stored = JSON.parse(await readFile(path, 'utf8'))
      custom = stored?.version === 2 ? stored.custom : migrateLegacy(stored)
    } catch (error) { if (error.code !== 'ENOENT') throw error; custom = emptyLibrary() }
    if (!validLibrary(custom)) throw new Error('提示词库格式无效')
    return { builtIn, custom, revision: fingerprint(custom) }
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
      if (input?.action !== 'save' || 'builtIn' in input || 'catalog' in input || !validLibrary(input.custom)) return reply({}, 400)
      const save = writing.then(async () => {
        if ((await read()).revision !== input.revision) return reply({}, 409)
        const temporary = `${path}.${randomUUID()}.tmp`
        try {
          await writeFile(temporary, JSON.stringify({ version: 2, custom: input.custom }), { mode: 0o600, flag: 'wx' })
          await rename(temporary, path)
        } finally { await rm(temporary, { force: true }) }
        return reply(await read())
      })
      writing = save.then(() => {}, () => {})
      return await save
    } catch { return reply({}, 503) }
  } }))
}

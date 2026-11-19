/** NovaFlow modes are ordinary isolated presets, independent of account login or package installation. */
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { writeFileAtomic, withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { modes, composeModes } from './modes.js'

export const name = 'novaflow-modes'
export const inject = ['agentPresets', 'profileContext', 'connection', 'systemPrompt', 'webServer']
export async function apply(ctx) {
  ctx.on('webserver/index-inject', table => {
    table.push({ kind: 'global', name: '__DSH_HIDDEN_PRESET_CHOICES__', value: ['cordis', 'ops-ptc'] })
  })
  ctx.systemPrompt.section({
    name: 'novaflow:client-identity',
    order: ctx.systemPrompt.getSectionOrder('HARNESS_IDENTITY') + 1,
    text: '用户正在 NovaFlow 客户端中与你对话。提及当前应用或会话时，使用「NovaFlow 客户端」或「当前 NovaFlow 客户端会话」，其他语言使用对应的自然表达。DeepSeek Harness（DSH）是底层框架。讲解底层实现、引用文档或给出操作步骤时，保留 `dsh-doc`、`dsh`、包名、命令和路径的原名。',
  })
  const require = createRequire(import.meta.url)
  const template = yaml.load(await readFile(require.resolve('@deepseek-ai/dsh-web-app/presets/standard.patch.yml'), 'utf8'), { schema: entryListSchema })
  const standard = template.flatMap(patch => patch.insert ?? []).find(row => row.config?.id === 'standard')?.config
  if (!standard) throw new Error('NovaFlow modes: standard preset template is unavailable')
  for (const mode of composeModes(standard.plugins)) {
    // The preset registry audits isolation and exposes missing or failed modules as a broken mode.
    const dispose = await ctx.agentPresets.register(mode)
    ctx.effect(() => dispose)
  }
  const statePath = join(ctx.profileContext.dir, '.novaflow-mode-guide.json')
  const response = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store, private' } })
  const readState = async () => {
    try { return JSON.parse(await readFile(statePath, 'utf8')) }
    catch (error) { if (error.code === 'ENOENT') return { version: 1, seen: true }; throw error }
  }
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/novaflow-modes', methods: ['POST'], requestBody: 'buffered',
    fetch: async request => {
      const admitted = ctx.connection.admit({ headers: request.headers })
      if ('rejection' in admitted || admitted.peer.principal.kind !== 'owner' || admitted.peer.interactions !== 'answer') return response({ error: 'FORBIDDEN' }, 403)
      if (!request.headers.get('content-type')?.startsWith('application/json')) return response({ error: 'INVALID_REQUEST' }, 415)
      try {
        const body = await request.text()
        if (body.length > 256) return response({ error: 'INVALID_REQUEST' }, 400)
        const input = JSON.parse(body)
        if (!input || !['state', 'dismiss'].includes(input.action) || Object.keys(input).length !== 1) return response({ error: 'UNSUPPORTED_ACTION' }, 400)
        if (input.action === 'dismiss') await withFileLock(statePath, async () => {
          await writeFileAtomic(statePath, JSON.stringify({ version: 1, seen: true }), { mode: 0o600 })
        })
        const state = await readState()
        const roster = await ctx.agentPresets.list()
        return response({ seen: state.seen === true, ready: modes.every(mode => roster.some(row => row.id === mode.id && !row.broken)) })
      } catch { return response({ error: 'MODE_GUIDE_UNAVAILABLE' }, 503) }
    },
  }))
}

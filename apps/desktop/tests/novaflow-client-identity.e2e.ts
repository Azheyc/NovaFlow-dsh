import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { isSeq, parseDocument } from 'yaml'
import { DesktopHostProcess } from '../src/host-process.ts'
import { authenticateWebHost } from '../src/web-document.ts'
import { prepareDesktopHome } from './harness.ts'

const skillsQuestion = '当我让你配置你的 skills 技能或者插件时你会读取哪些内置技能'
const frameworkQuestion = 'NovaFlow 基于什么框架？请保留技能、命令和路径的原名。'
const identity = '用户正在 NovaFlow 客户端中与你对话。'

interface ModelRequest {
  system: string
  messages: { role: string; content: { type: string; text?: string; content?: unknown }[] }[]
  tools?: unknown[]
}

afterEach(() => vi.unstubAllEnvs())

it('delivers the client identity across presets, skill reads and resumed sessions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novaflow-identity-'))
  const requests: ModelRequest[] = []
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString()) as ModelRequest
      const last = body.messages.at(-1)
      const isAgent = Boolean(body.tools?.length)
      if (isAgent) requests.push(body)
      const readSkill = isAgent && last?.content.some(block => block.text === skillsQuestion)
      const events = [
        { type: 'message_start', message: { id: randomUUID(), model: 'deepseek-flash', usage: { input_tokens: 5, output_tokens: 0 } } },
        { type: 'content_block_start', index: 0, content_block: readSkill ? { type: 'tool_use', id: randomUUID(), name: 'skill', input: {} } : { type: 'text', text: 'OK' } },
        ...(readSkill ? [{ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"name":"dsh-doc"}' } }] : []),
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: readSkill ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 1 } },
        { type: 'message_stop' },
      ]
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.end(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''))
    })
  })
  let host: DesktopHostProcess | undefined
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing test model port')
    const { project, paths } = await prepareDesktopHome(root)
    const restart = async () => {
      await host?.stop()
      host = new DesktopHostProcess(process.execPath, project, paths.profile, undefined, {
        ...process.env, DSH_AGENTS_HOME: join(root, 'agents'), DEEPSEEK_API_KEY: 'identity-fixture', DEEPSEEK_BASE_URL: `http://127.0.0.1:${address.port}`,
      })
      const { url } = await host.start()
      const cookie = await authenticateWebHost(url)
      return async <Value>(method: string, request: object): Promise<Value> => {
        const response = await fetch(new URL(`/api/${method}`, url), {
          method: 'POST', headers: { cookie, 'content-type': 'application/json' },
          body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { args: { request } } }),
        })
        const { result } = await response.json() as { result: { ok: boolean; value: Value } }
        expect(result.ok, method).toBe(true)
        return result.value
      }
    }
    const skillFile = new URL('../../../packages/preset/agent-preset/skills/dsh-doc/SKILL.md', import.meta.url)
    const skillHeading = (await readFile(skillFile, 'utf8')).match(/^# .+$/m)?.[0]
    if (!skillHeading) throw new Error('Expected dsh-doc to have a heading')
    const patchPath = join(paths.profile, 'cordis.patch.yml')
    const patch = parseDocument(await readFile(patchPath, 'utf8'))
    if (!isSeq(patch.contents)) throw new Error('Expected a profile patch sequence')
    patch.contents.flow = false
    patch.add({ id: 'agent-preset-registry', config: { default: 'standard', selectedDefault: 'novaflow-modeling' } })
    const upgradedPatch = String(patch)
    patch.add({ id: 'novaflow-modes', disabled: true })
    const template = await readFile(new URL('../../../packages/bundle/web-app/presets/standard.patch.yml', import.meta.url), 'utf8')
    const legacyPreset = template.replace('id: preset-standard', 'id: legacy-modeling').replace('id: standard\n', 'id: novaflow-modeling\n')
    await writeFile(patchPath, String(patch) + legacyPreset)
    let rpc = await restart()
    const prompt = (sessionId: string, text: string) => rpc('session/prompt', {
      sessionId, requestId: randomUUID(), mode: 'queue', content: [{ type: 'text', text }],
    })
    const create = (agentPreset?: string) => rpc<{ agentPreset: string; sessionId: string }>('session/create', {
      cwd: root, ...(agentPreset !== undefined ? { agentPreset } : {}),
    })
    const legacy = await create()
    expect(legacy.agentPreset).toBe('novaflow-modeling')
    await prompt(legacy.sessionId, skillsQuestion)
    await expect.poll(() => requests.length, { timeout: 15000 }).toBe(2)
    await host?.stop()
    host = undefined
    requests.length = 0
    await writeFile(patchPath, upgradedPatch)
    rpc = await restart()
    expect(await rpc('session/projections', { sessionId: legacy.sessionId })).toMatchObject({
      kind: 'sequenced', values: { agentPreset: 'standard' },
    })
    const sessions: string[] = [legacy.sessionId]
    for (const agentPreset of ['standard', 'novaflow-media-creation']) {
      const created = await create(agentPreset === 'standard' ? undefined : agentPreset)
      expect(created.agentPreset).toBe(agentPreset)
      sessions.push(created.sessionId)
      const before = requests.length
      await prompt(created.sessionId, skillsQuestion)
      await expect.poll(() => requests.length, { timeout: 15000 }).toBe(before + 2)
      expect(JSON.stringify(requests[before + 1]?.messages.flatMap(message => message.content).filter(block => block.type === 'tool_result'))).toContain(skillHeading)
    }
    rpc = await restart()
    let legacyRequest: ModelRequest | undefined
    for (const sessionId of sessions) {
      const before = requests.length
      await prompt(sessionId, frameworkQuestion)
      await expect.poll(() => requests.length, { timeout: 15000 }).toBe(before + 1)
      expect(JSON.stringify(requests[before]?.messages)).toContain(skillsQuestion)
      expect(JSON.stringify(requests[before]?.messages)).toContain(frameworkQuestion)
      if (sessionId === legacy.sessionId) legacyRequest = requests[before]
    }
    // The legacy fixture predates the NovaFlow system prompt and retains its original prefix.
    for (const request of requests.filter(request => request !== legacyRequest)) {
      expect(request.system.split(identity)).toHaveLength(2)
      expect(request.system).toContain(`You are an AI agent powered by DeepSeek Harness.\n\n${identity}`)
      expect(request.system).toContain('DeepSeek Harness（DSH）是底层框架')
      expect(request.system).toContain('`dsh-doc`、`dsh`')
    }
  } finally {
    await host?.stop()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    await rm(root, { recursive: true, force: true })
  }
})

import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
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
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(chunk)
    const body: ModelRequest = JSON.parse(Buffer.concat(chunks).toString())
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
      return async (method: string, request: object) => {
        const response = await fetch(new URL(`/api/${method}`, url), {
          method: 'POST', headers: { cookie, 'content-type': 'application/json' },
          body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { args: { request } } }),
        })
        const { result } = await response.json()
        expect(result.ok, method).toBe(true)
        return result.value
      }
    }
    const skillFile = new URL('../../../packages/preset/agent-preset/skills/dsh-doc/SKILL.md', import.meta.url)
    const skillHeading = (await readFile(skillFile, 'utf8')).match(/^# .+$/m)?.[0]
    if (!skillHeading) throw new Error('Expected dsh-doc to have a heading')
    let rpc = await restart()
    const prompt = (sessionId: string, text: string) => rpc('session/prompt', {
      sessionId, requestId: randomUUID(), mode: 'queue', content: [{ type: 'text', text }],
    })
    const sessions: string[] = []
    for (const agentPreset of ['standard', 'novaflow-modeling', 'novaflow-media-creation']) {
      const created = await rpc('session/create', { agentPreset, cwd: root })
      expect(created.agentPreset).toBe(agentPreset)
      sessions.push(created.sessionId)
      const before = requests.length
      await prompt(created.sessionId, skillsQuestion)
      await expect.poll(() => requests.length, { timeout: 15000 }).toBe(before + 2)
      expect(JSON.stringify(requests[before + 1]?.messages.flatMap(message => message.content).filter(block => block.type === 'tool_result'))).toContain(skillHeading)
    }
    rpc = await restart()
    for (const sessionId of sessions) {
      const before = requests.length
      await prompt(sessionId, frameworkQuestion)
      await expect.poll(() => requests.length, { timeout: 15000 }).toBe(before + 1)
      expect(JSON.stringify(requests[before]?.messages)).toContain(skillsQuestion)
      expect(JSON.stringify(requests[before]?.messages)).toContain(frameworkQuestion)
    }
    for (const request of requests) {
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

import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { DesktopHostProcess } from '../src/host-process.ts'
import { authenticateWebHost } from '../src/web-document.ts'
import { prepareDesktopHome } from './harness.ts'

it('lets a real canvas session edit its board and restores its conversation after Host restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novaflow-board-'))
  const toolsSeen = new Set<string>()
  const model = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk as Buffer)
    const body = JSON.parse(Buffer.concat(chunks).toString()) as {
      tools?: { name: string }[]
      messages: { content: { type: string }[] }[]
    }
    for (const tool of body.tools ?? []) toolsSeen.add(tool.name)
    const edit = body.tools?.some(tool => tool.name === 'canvas_edit') && !body.messages.at(-1)?.content.some(block => block.type === 'tool_result')
    const events = [
      { type: 'message_start', message: { id: randomUUID(), model: 'deepseek-flash', usage: { input_tokens: 8, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: edit ? { type: 'tool_use', id: randomUUID(), name: 'canvas_edit', input: {} } : { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: edit ? { type: 'input_json_delta', partial_json: JSON.stringify({ revision: 1, operations: [{ op: 'addNode', type: 'text', data: { label: '脚本', text: '第一幕' } }] }) } : { type: 'text_delta', text: '已完成' } },
      { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: edit ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 4 } }, { type: 'message_stop' },
    ]
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.end(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''))
  })
  let host: DesktopHostProcess | undefined
  try {
    await new Promise<void>(resolve => model.listen(0, '127.0.0.1', resolve))
    const address = model.address()
    if (!address || typeof address === 'string') throw new Error('Missing mock port')
    const modelBase = `http://127.0.0.1:${address.port}`
    const { home, paths, project } = await prepareDesktopHome(root)
    async function start() {
      await host?.stop()
      host = new DesktopHostProcess(process.execPath, project, paths.profile, undefined, { ...process.env, DSH_AGENTS_HOME: join(root, 'agents'), DEEPSEEK_BASE_URL: modelBase, DEEPSEEK_API_KEY: 'fixture' })
      const { url } = await host.start()
      const cookie = await authenticateWebHost(url)
      return async (route: string, body?: object) => {
        const response = await fetch(new URL(`/media-desk/${route}`, url), { headers: { cookie, 'content-type': 'application/json' }, ...(body && { method: 'POST', body: JSON.stringify(body) }) })
        const data = await response.json()
        expect(response.status, JSON.stringify(data)).toBe(200)
        return data
      }
    }
    let desk = await start()
    const storageDir = join(await realpath(home), 'media-desk', 'files')
    expect(await desk('settings')).toMatchObject({ exportDir: '', storage: { configured: true, path: storageDir } })
    expect(await desk('state')).toMatchObject({ state: { items: expect.any(Array) } })
    const [initial, concurrent] = await Promise.all([desk('canvas/open', {}), desk('canvas/open', {})])
    expect(initial.canvases).toHaveLength(1)
    expect(concurrent).toEqual(initial)
    const canvas = initial.canvases[0]
    expect(canvas).toMatchObject({ name: '未命名', nodeCount: 0 })
    expect(JSON.parse(await readFile(join(storageDir, '画布', `${canvas.id}.json`), 'utf8'))).toMatchObject({ id: canvas.id, name: '未命名' })
    await desk('canvas/presence', { id: canvas.id, view: randomUUID() })
    const { sessionId } = await desk('canvas/chat', { id: canvas.id, message: '添加一个文本节点' })
    await expect.poll(async () => (await desk(`canvas/get?id=${canvas.id}`)).canvas.nodes, { timeout: 20000 }).toMatchObject([{ type: 'text', data: { text: '第一幕' } }])
    expect(toolsSeen.has('skill')).toBe(true)
    await expect.poll(async () => (await desk(`canvas/chat?id=${canvas.id}`)).messages).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'assistant', text: '已完成' })]))
    desk = await start()
    expect(await desk('canvas/open', {})).toMatchObject({ canvases: [{ id: canvas.id, name: '未命名', nodeCount: 1 }] })
    expect((await desk('canvas/list')).canvases).toHaveLength(1)
    expect(await desk(`canvas/chat?id=${canvas.id}`)).toMatchObject({ sessionId, messages: expect.arrayContaining([expect.objectContaining({ role: 'user', text: '添加一个文本节点' })]) })
    expect(await desk('settings', { exportDir: root })).toMatchObject({ storage: { configured: true, path: await realpath(root) } })
    expect(await desk('settings', { exportDir: '' })).toMatchObject({ exportDir: '', storage: { configured: true, path: storageDir } })
  } finally {
    await host?.stop()
    model.closeAllConnections()
    await new Promise<void>(resolve => model.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
    vi.unstubAllEnvs()
  }
}, 90000)

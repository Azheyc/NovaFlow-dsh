/** Exercise phone-to-team routing without a live IM credential or external messages. */
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { DesktopHostProcess } from '../src/host-process.ts'
import { authenticateWebHost } from '../src/web-document.ts'
import { builtHost, prepareDesktopHome } from './harness.ts'

it.skipIf(!existsSync(builtHost))('binds a phone private chat to a desktop-owned team Bot and releases it', async () => {
  const root = mkdtempSync(join(tmpdir(), 'novaflow-phone-partner-'))
  let host: DesktopHostProcess | undefined
  try {
    const { home, project, paths } = await prepareDesktopHome(root)
    const accountId = 'fixture-weixin'
    const digest = createHash('sha256').update(accountId).digest('hex').slice(0, 24)
    const botId = `wx_${digest}`
    const channel = join(home, 'integrations', 'dsh-weixin')
    const account = join(channel, 'accounts', botId)
    const conversationKey = 'p2p:fixture-user'
    mkdirSync(account, { recursive: true })
    writeFileSync(join(channel, 'config.json'), JSON.stringify({ version: 1, accounts: [{ accountId, botId,
      tokenRef: `DSH_WEIXIN_BOT_TOKEN_${digest.toUpperCase()}`, ownerUserId: 'fixture-user', baseUrl: 'https://ilinkai.weixin.qq.com/',
    }] }))
    const state = join(account, 'state.json')
    writeFileSync(state, JSON.stringify({ version: 1, sessions: { [conversationKey]: randomUUID() } }))
    host = new DesktopHostProcess(process.execPath, project, paths.profile, undefined, process.env)
    const { url } = await host.start()
    const origin = new URL(url).origin
    const headers = { cookie: await authenticateWebHost(url), origin, 'content-type': 'application/json' }
    const rpc = async (method: string, payload: Record<string, string>, endpoint = 'dsh-im/dsh-im-delivery') => {
      const response = await fetch(`${origin}/api/${endpoint}`, { method: 'POST', headers, body: JSON.stringify({
        type: 'client-request', rpcId: randomUUID(), method: endpoint, payload: { method, payload },
      }) })
      expect(response.status).toBe(200)
      const { result } = await response.json()
      expect(result.ok, JSON.stringify(result.error)).toBe(true)
      return result.value
    }
    const setup = (method: string, payload: Record<string, string>) => rpc(method, payload, 'dsh-im/novaflow-partner')
    const beforePairing = await setup('get', { channel: 'feishu' })
    expect(beforePairing.selected).toBe('')
    expect(beforePairing.bots[0]).toEqual({ id: expect.any(String), name: expect.any(String) })
    const chosenId = beforePairing.bots[0].id
    await setup('set', { channel: 'feishu', id: chosenId })
    expect((await setup('get', { channel: 'feishu' })).selected).toBe(chosenId)
    expect((await setup('get', { channel: 'weixin' })).selected).toBe('')
    await setup('set', { channel: 'feishu', id: '' })
    expect((await setup('get', { channel: 'feishu' })).selected).toBe('')
    const status = await rpc('ds-bot.status', { botId })
    expect(status.state).toBe('ready')
    expect(status.conversations).toContainEqual(expect.objectContaining({ conversationKey }))
    const dsBotId = status.bots[0].id
    await rpc('ds-bot.bind', { botId, conversationKey, dsBotId })
    const sessions = await rpc('ds-bot.sessions.list', {})
    expect(sessions).toContainEqual(expect.objectContaining({ bot: expect.objectContaining({ id: dsBotId }),
      sessionId: JSON.parse(readFileSync(state, 'utf8')).sessions[conversationKey],
    }))
    await rpc('ds-bot.unbind', { botId, conversationKey })
    expect(await rpc('ds-bot.sessions.list', {})).toEqual([])
    expect(JSON.parse(readFileSync(state, 'utf8')).sessions[conversationKey]).toBeUndefined()
  } finally {
    await host?.stop()
    vi.unstubAllEnvs()
    rmSync(root, { recursive: true, force: true })
  }
}, 60_000)

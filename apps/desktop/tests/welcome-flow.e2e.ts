/** Built Desktop Host acceptance with synthetic NovaFlow authorization; no production requests. */
import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DesktopHostProcess } from '../src/host-process.ts'
import { desktopClientMetadata } from '../src/client-metadata.ts'
import { connectDesktopWelcome, type DesktopWelcomeBackend } from '../src/welcome-backend.ts'
import { authenticateWebHost } from '../src/web-document.ts'
import { builtHost, prepareDesktopHome } from './harness.ts'

afterEach(() => { vi.unstubAllEnvs() })
const issuer = 'https://www.ycnovaflow.vip'
const prefix = '/api/novaflow/v1'
const code = `nfdc_${'c'.repeat(43)}`
const access = `nfds_${'a'.repeat(43)}`

async function mockPlatform() {
  let init: Record<string, string> = {}
  let failExchange = false
  let rejectAuthorization = false
  let exchanged = false
  const server = createServer((req, res) => {
    req.setEncoding('utf8')
    let body = ''
    req.on('data', (chunk: string) => { body += chunk })
    req.on('end', () => {
      const input = (body ? JSON.parse(body) : {}) as Record<string, string>
      let data: unknown
      if (req.url === `${prefix}/desktop/auth/start`) {
        init = input
        exchanged = false
        if (init.client_id !== 'novaflow-creator' || init.code_challenge_method !== 'S256') { res.writeHead(400).end(); return }
        data = { request_id: 'test', authorize_url: `${issuer}/desktop/authorize?request=test`, expires_in: 600 }
      } else if (req.url === `${prefix}/desktop/auth/exchange`) {
        if (failExchange) { res.writeHead(503).end(); return }
        if (exchanged || input.code !== code || input.redirect_uri !== init.redirect_uri
          || createHash('sha256').update(input.code_verifier ?? '').digest('base64url') !== init.code_challenge) {
          res.writeHead(400).end(); return
        }
        exchanged = true
        data = { token_type: 'Bearer', access_token: access, refresh_token: `nfdr_${'r'.repeat(43)}`,
          session_id: `nfdev_${'s'.repeat(43)}`, expires_in: 900, refresh_expires_in: 2592000 }
      } else if (req.url === `${prefix}/desktop/auth/revoke`) {
        // A failed remote revoke must still clear the local device grant.
        res.writeHead(503).end(); return
      } else {
        if (rejectAuthorization || req.headers.authorization !== `Bearer ${access}`) { res.writeHead(401).end(); return }
        if (req.url === `${prefix}/creator/bootstrap`) data = { user_id: 7, display_name: 'Fixture user', identity_scope: 'personal' }
        else if (req.url === `${prefix}/creator/models`) data = { items: [
          { model_id: 'gpt-fixture', group_id: 'Fixture group', kind: 'text', supported_endpoint_types: ['openai-response'] },
          { model_id: 'claude-fixture', group_id: 'Fixture group', kind: 'text', supported_endpoint_types: ['anthropic'] },
        ] }
        else if (req.url === `${prefix}/plugin/usage`) data = { schema_version: 1, account_mode: 'personal',
          personal: { balance: '10', frozen: '0', available: '10', unit: 'CNY' }, limits: null, as_of: new Date().toISOString() }
        else { res.writeHead(404).end(); return }
      }
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ code: 0, data }))
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('missing mock listener')
  return {
    origin: `http://127.0.0.1:${String(address.port)}`,
    failExchange: (value: boolean) => { failExchange = value },
    rejectAuthorization: (value: boolean) => { rejectAuthorization = value },
    callback: () => `${init.redirect_uri}?${new URLSearchParams({ code, state: init.state!, iss: issuer }).toString()}`,
    close: () => new Promise<void>((resolve) => { server.close(() => { resolve() }); server.closeAllConnections() }),
  }
}

describe.skipIf(!existsSync(builtHost))('built NovaFlow Desktop welcome', () => {
  it('authorizes with PKCE, configures models, restores login, and rejects stale callbacks after cancellation', async () => {
    const root = mkdtempSync(join(tmpdir(), 'novaflow-desktop-welcome-'))
    let host: DesktopHostProcess | undefined
    const platform = await mockPlatform()
    try {
      const { project, paths } = await prepareDesktopHome(root)
      // Test-only transport replacement preserves production issuer validation and all Host/plugin code.
      const preload = join(root, 'mock-novaflow.mjs')
      writeFileSync(preload, `process.stderr.write = process.stdout.write.bind(process.stdout);
const original = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(String(input));
  if (url.origin === ${JSON.stringify(issuer)}) return original(${JSON.stringify(platform.origin)} + url.pathname + url.search, init);
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') throw new Error('Test blocks external network');
  return original(input, init);
};\n`)
      const environment = { ...process.env, NODE_OPTIONS: `--import=${pathToFileURL(preload).href}` }
      let backend: DesktopWelcomeBackend
      let hostOrigin = ''
      let cookie = ''
      const rpc = async <T>(method: string, args: Record<string, unknown> = {}): Promise<T> => {
        const rpcId = randomUUID()
        const response = await fetch(`${hostOrigin}/api/${method}`, {
          method: 'POST', headers: { cookie, 'content-type': 'application/json' },
          body: JSON.stringify({ type: 'client-request', rpcId, method, payload: { args } }),
        })
        const envelope = await response.json() as { result: { ok: boolean; value: T } }
        expect(envelope.result.ok, method).toBe(true)
        return envelope.result.value
      }
      const restart = async (): Promise<void> => {
        await host?.stop()
        host = new DesktopHostProcess(process.execPath, project, paths.profile, undefined, environment)
        const { url } = await host.start()
        hostOrigin = new URL(url).origin
        cookie = await authenticateWebHost(url)
        backend = connectDesktopWelcome(url, cookie)
        await expect.poll(async () => {
          const response = await fetch(`${hostOrigin}/api/novaflow-account`, {
            method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{"action":"state"}',
          })
          return response.status
        }, { timeout: 15_000 }).toBe(200)
      }
      await restart()
      const bundles = await rpc<Array<{ name: string; enabled: boolean; installed: boolean; removable: boolean }>>('pluginManager/listBundles')
      for (const name of ['dshmarket', 'dsh-ops', 'dsh-rewind-plugin', '@michengai/dsh-archive-manager', '@michengai/dsh-skills-manager', 'novaflow-dsh-prompt-presets']) {
        expect(bundles.find(row => row.name === name), name).toMatchObject({ enabled: true, installed: true, removable: true })
      }
      expect(bundles.some(row => row.name === '@local/novaflow-dsh-plugin')).toBe(false)
      const roster = await rpc<{ presets: Array<{ id: string; broken?: string; isDefault: boolean }> }>('agentPresets/list')
      for (const id of ['novaflow-modeling', 'novaflow-media-creation']) {
        expect(roster.presets.find(row => row.id === id), id).toMatchObject({ id, isDefault: false })
        expect(roster.presets.find(row => row.id === id)?.broken, id).toBeUndefined()
      }
      const management = await rpc<{ changed: boolean; error?: { code: string } }>('pluginManager/setBundleEnabled', { name: '@local/novaflow-dsh-plugin', enabled: false })
      expect(management.changed).toBe(false)
      expect(management.error).toBeDefined()
      const removal = await rpc<{ changed: boolean; error?: { code: string } }>('pluginManager/removeBundle', { name: '@local/novaflow-dsh-plugin' })
      expect(removal.changed).toBe(false)
      expect(removal.error).toBeDefined()
      const update = await rpc<{ result: { changed: boolean; error?: { code: string } } }>('pluginManager/updateBundle', { name: '@local/novaflow-dsh-plugin', version: '99.0.0' })
      expect(update.result.changed).toBe(false)
      expect(update.result.error).toBeDefined()
      const guide = async (action: string) => (await fetch(`${hostOrigin}/api/novaflow-modes`, {
        method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ action }),
      })).json()
      expect(await guide('state')).toEqual({ seen: false, ready: true })
      expect(await guide('dismiss')).toEqual({ seen: true, ready: true })
      expect(await backend!.read()).toMatchObject({ loggedIn: false, hasApiKey: false })
      const unauthorized = await fetch(`${hostOrigin}/api/novaflow-account`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"action":"state"}',
      })
      expect(unauthorized.ok).toBe(false)
      await backend!.account.start(desktopClientMetadata('en'))
      expect((await backend!.account.state()).attempt?.phase).toBe('waiting-browser')
      expect(new URL(platform.callback()).origin).toBe(hostOrigin)
      const wrongIssuer = new URL(platform.callback())
      wrongIssuer.searchParams.set('iss', 'https://wrong.test')
      expect((await fetch(wrongIssuer)).status).toBe(400)
      platform.failExchange(true)
      expect((await fetch(platform.callback())).status).toBe(400)
      expect(await backend!.read()).toMatchObject({ loggedIn: false, hasApiKey: false })
      platform.failExchange(false)
      await backend!.account.start(desktopClientMetadata('en'))
      expect((await fetch(platform.callback())).status).toBe(200)
      expect(await backend!.read()).toMatchObject({ loggedIn: true, hasApiKey: false })
      const patch = readFileSync(join(paths.profile, 'cordis.patch.yml'), 'utf8')
      expect(patch).toContain('gpt-fixture')
      expect(patch).toContain('claude-fixture')
      expect(patch).toContain('openai-responses')
      expect(patch).toContain('anthropic-messages')
      expect(patch).not.toContain('/novaflow/models/')
      for (const [group, endpoint, api, id] of [
        ['Fixture group', 'openai-responses', 'openai-responses', 'gpt-fixture'],
        ['Fixture group', 'anthropic-messages', 'anthropic-messages', 'claude-fixture'],
      ] as const) {
        const provider = 'novaflow-' + createHash('sha256').update(JSON.stringify([group, endpoint])).digest('hex').slice(0, 20)
        const baseURL = issuer + (api === 'anthropic-messages' ? '' : '/v1')
        const models = await rpc<Array<{ id: string }>>('llm/discoverModels', { settingsNs: 'llm-pi-ai', request: { provider, baseURL, api } })
        expect(models.map(model => model.id)).toEqual([id])
      }
      expect(patch).not.toContain(access)
      const snapshot = await (await fetch(`${hostOrigin}/api/novaflow-account`, {
        method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{"action":"state"}',
      })).text()
      expect(snapshot).not.toContain(access)
      expect(snapshot).not.toContain('pluginSetup')
      expect(snapshot).not.toContain('installFlow')
      await restart()
      expect(await backend!.read()).toMatchObject({ loggedIn: true, hasApiKey: false })
      expect(await guide('state')).toEqual({ seen: true, ready: true })
      platform.rejectAuthorization(true)
      await restart()
      expect(await backend!.read()).toMatchObject({ loggedIn: false, hasApiKey: false })
      expect(await backend!.account.state()).toMatchObject({ status: 'signed-out', attempt: null, requiresSignOut: false })
      platform.rejectAuthorization(false)
      await backend!.account.signOut(desktopClientMetadata('en'))
      expect(await backend!.read()).toMatchObject({ loggedIn: false, hasApiKey: false })
      await backend!.account.start(desktopClientMetadata('en'))
      const waiting = await backend!.account.state()
      const late = platform.callback()
      await backend!.account.cancel(waiting.attempt!.id)
      expect((await fetch(late)).status).toBe(400)
      expect(await backend!.read()).toMatchObject({ loggedIn: false })
    } finally {
      await host?.stop()
      await platform.close()
      rmSync(root, { recursive: true, force: true })
    }
  })
})

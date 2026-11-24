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
  let identityScope = 'personal'
  let exchanged = false
  const imageRequests: Array<{ group: string | undefined; model: string; size: string }> = []
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
        if (req.url?.startsWith('/v1/videos')) {
          if (decodeURIComponent(String(req.headers['x-novaflow-group'])) !== 'Video group') { res.writeHead(403).end(); return }
          if (req.url.endsWith('/content')) { res.writeHead(200, { 'content-type': 'video/mp4' }).end(Buffer.from('000000146674797069736f6d', 'hex')); return }
          res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(req.method === 'POST' ? { id: 'video-job' } : { status: 'completed' })); return
        }
        if (req.url === '/v1/images/generations' && req.method === 'POST') {
          const group = req.headers['x-novaflow-group']
          imageRequests.push({ group: typeof group === 'string' ? decodeURIComponent(group) : undefined, model: input.model!, size: input.size! })
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=' }] }))
          return
        }
        if (req.url === `${prefix}/creator/bootstrap`) data = { user_id: 7, display_name: 'Fixture user', identity_scope: identityScope }
        else if (req.url === `${prefix}/creator/models`) data = { items: [
          { model_id: 'gpt-image-2.6', group_id: 'Image group', kind: 'image', supported_endpoint_types: ['image-generation'] },
          { model_id: 'video-fixture', group_id: 'Video group', kind: 'video', supported_endpoint_types: ['openai-video'] },
          { model_id: 'gpt-fixture', group_id: 'Fixture group', kind: 'text', supported_endpoint_types: ['openai'] },
          { model_id: 'gpt-6.2-sol', group_id: 'Fixture group', kind: 'text', supported_endpoint_types: ['openai-response'] },
          { model_id: 'gpt-6.2-astra', group_id: 'Fixture group', kind: 'text', supported_endpoint_types: ['openai-response'] },
          { model_id: 'claude-fixture', group_id: 'Fixture group', kind: 'text', supported_endpoint_types: ['anthropic'] },
        ] }
        else if (req.url === `${prefix}/plugin/usage`) data = { schema_version: 1, account_mode: identityScope === 'personal' ? 'personal' : 'enterprise',
          [identityScope === 'personal' ? 'personal' : 'company']: { balance: '10', frozen: '0', available: '10', unit: 'CNY' }, limits: identityScope === 'personal' ? null : { daily_mode: 'unlimited', monthly_mode: 'unlimited', daily_used: 0, monthly_used: 0, daily_remaining: null, monthly_remaining: null, daily_limit: null, monthly_limit: null, can_use: true, block_reason: '' }, as_of: new Date().toISOString() }
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
    imageRequests,
    origin: `http://127.0.0.1:${String(address.port)}`,
    setScope: (scope: string) => { identityScope = scope },
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
      const bundles = await rpc<Array<{ name: string; version?: string; update?: string; enabled: boolean; installed: boolean; removable: boolean }>>('pluginManager/listBundles')
      const seedManifest = JSON.parse(readFileSync(join(project, 'novaflow-preinstalled', 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
      expect(seedManifest.dependencies['dsh-auto-memory']).toBeDefined()
      const readMemorySettings = async () => {
        const response = await fetch(`${hostOrigin}/api/auto-memory/config.get`, { headers: { cookie } })
        expect(response.status).toBe(200)
        return response.json()
      }
      const saveMemorySettings = async (patch: Record<string, number | null>) => {
        const response = await fetch(`${hostOrigin}/api/auto-memory/config.set`, {
          method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(patch),
        })
        expect(await response.json()).toMatchObject({ ok: true })
      }
      const companion = { maxBytes: 32768, minImportance: 1 }
      const focus = { maxBytes: 4096, minImportance: 4 }
      expect(await readMemorySettings()).toMatchObject({ effective: companion, overrides: {} })
      await saveMemorySettings(focus)
      expect(await readMemorySettings()).toMatchObject({ effective: focus, overrides: focus })
      expect(seedManifest.dependencies['ds-bot']).toBeDefined()
      const marketListing = await fetch(`${hostOrigin}/dsh-market/installed`, { headers: { cookie } })
      expect(marketListing.status).toBe(200)
      const marketInstalled = (await marketListing.json()).installed
      for (const [name, version] of Object.entries(seedManifest.dependencies)) {
        expect(bundles.some(row => row.name === name), name).toBe(false)
        expect(Object.hasOwn(marketInstalled, name), name).toBe(false)
        const installed = JSON.parse(readFileSync(join(paths.profile, 'node_modules', name, 'package.json'), 'utf8'))
        expect(installed.version, name).toBe(version)
      }
      const refused = await rpc<{ changed: boolean; error?: { code: string } }>('pluginManager/setBundleEnabled', { name: 'ds-bot', enabled: false })
      expect(refused).toMatchObject({ changed: false, error: { code: 'management-required' } })
      const entries = await rpc<Array<{ entryId: string; moduleName: string; fiberPhase: string; readOnlyReason?: string }>>('pluginManager/listPlugins')
      const hindsightPackage = '@vectorize-io/hindsight-coding-agents'
      expect(seedManifest.dependencies[hindsightPackage]).toBeUndefined()
      expect(entries.some(row => row.moduleName === `${hindsightPackage}/dsh`)).toBe(false)
      const bot = entries.find(row => row.moduleName === 'ds-bot')
      expect(bot).toMatchObject({ fiberPhase: 'active', readOnlyReason: 'management-required' })
      const rowChange = await rpc<{ changed: boolean }>('pluginManager/setPluginEnabled', { id: bot!.entryId, enabled: false })
      expect(rowChange.changed).toBe(false)
      for (const operation of ['toggle', 'uninstall']) {
        const response = await fetch(`${hostOrigin}/dsh-market/${operation}`, { method: 'POST',
          headers: { cookie, origin: hostOrigin, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'ds-bot', enabled: false }) })
        expect(response.ok, operation).toBe(false)
      }
      const marketClient = readFileSync(join(paths.profile, 'node_modules', 'dshmarket/client/client.js'), 'utf8')
      expect(marketClient).not.toMatch(/\(SponsorMark\s*,/)
      expect(marketClient).not.toMatch(/t\("updateCheckFailed"\)/)
      expect(seedManifest.dependencies['dsh-mcp-connector']).toBeUndefined()
      expect(entries.some(row => row.moduleName === 'dsh-mcp-connector')).toBe(false)
      expect(bundles.some(row => row.name === 'dsh-media-desk')).toBe(false)
      const deskVersion = await fetch(`${hostOrigin}/media-desk/version`, { headers: { cookie } })
      expect(deskVersion.status).toBe(200)
      await expect(deskVersion.json()).resolves.toMatchObject({ current: seedManifest.dependencies['novaflow-media-desk'], ready: true, updateAvailable: false, failed: false })
      const deskSettings = await fetch(`${hostOrigin}/media-desk/settings`, {
        method: 'POST', headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ exportDir: root, resolution: '2048×1152', imageCount: 1, shotCount: 3, generateImages: false, language: 'en', image: { baseUrl: 'https://example.invalid', apiKey: 'fixture' } }),
      })
      expect(deskSettings.status).toBe(200)
      const savedDeskSettings = await deskSettings.json()
      expect(savedDeskSettings).toMatchObject({ resolution: '2048x1152', imageCount: 1, shotCount: 3, generateImages: false, language: 'auto', imageReady: false })
      expect(savedDeskSettings).not.toHaveProperty('image')
      const drawTest = await fetch(`${hostOrigin}/media-desk/settings/test`, {
        method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}',
      })
      expect(drawTest.status).toBe(404)
      const marketUpdate = await fetch(`${hostOrigin}/dsh-market/update`, {
        method: 'POST', headers: { cookie, origin: hostOrigin, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'dshmarket', restore: true }),
      })
      expect(marketUpdate.status).toBe(400)
      await expect(marketUpdate.json()).resolves.toMatchObject({ error: 'NovaFlow manages the installed market version.' })
      const imClient = readFileSync(join(paths.profile, 'node_modules', '@xmanrui/dsh-im/lib/client.js'), 'utf8')
      expect(imClient).toContain('pageCtx.locale.bind(IM_LOCALE_NAMESPACE)("连接手机")')
      expect(imClient).toContain('h2("p", null, "让NovaFlow触手可及")')
      expect(imClient).toContain('sidebarVisible = true')
      expect(imClient).not.toContain('"im-settings: sidebar visibility"')
      expect(imClient).not.toContain('className: "dim-githubLink"')
      expect(imClient).not.toContain('h2(SidebarSettings, { rpcCall })')
      const imUpdate = await fetch(`${hostOrigin}/dsh-market/update`, {
        method: 'POST', headers: { cookie, origin: hostOrigin, 'content-type': 'application/json' },
        body: JSON.stringify({ name: '@xmanrui/dsh-im', restore: true }),
      })
      expect(imUpdate.status).toBe(400)
      await expect(imUpdate.json()).resolves.toMatchObject({ error: 'NovaFlow manages the installed DSH-IM version.' })
      const providers = await rpc<{ search: Array<{ id: string }> }>('web/listProviders')
      expect(providers.search.map(provider => provider.id)).toContain('exa')
      const settings = await rpc<{ namespaces: Array<{ ns: string; value: unknown }> }>('settings/describe')
      expect(settings.namespaces.find(namespace => namespace.ns === 'web')?.value)
        .toMatchObject({ searchProvider: 'exa', fetchProvider: 'http' })
      expect(bundles.some(row => row.name === '@local/novaflow-dsh-plugin')).toBe(false)
      const roster = await rpc<{ presets: Array<{ id: string; broken?: string; isDefault: boolean }> }>('agentPresets/list')
      expect(roster.presets.find(row => row.id === 'novaflow-modeling')).toBeUndefined()
      expect(roster.presets.find(row => row.id === 'novaflow-media-creation')).toBeUndefined()
      expect(roster.presets.find(row => row.id === 'standard')).toMatchObject({ isDefault: true })
      const promptResponse = await fetch(`${hostOrigin}/api/novaflow-prompt-presets`, {
        method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{"action":"read"}',
      })
      expect(promptResponse.status).toBe(200)
      const { builtIn, custom } = await promptResponse.json() as { builtIn: { categories: { name: string }[] }; custom: unknown }
      expect(builtIn.categories.map(group => group.name)).toEqual(['办公文档', '数据调研', '内容平台', '销售与客户', '采购与合同', '项目管理', '人事行政', 'CAD 与建模'])
      expect(custom).toEqual({ categories: [], featured: [] })
      const skillResponse = await fetch(`${hostOrigin}/api/michengai/dsh-skills-manager/state`, { headers: { cookie } })
      expect(skillResponse.status).toBe(200)
      const { data: { roots } } = await skillResponse.json() as {
        data: { roots: Array<{ key: string; group?: string; skills: Array<{ name: string; declaredName: string }> }> }
      }
      expect(roots.some(root => root.group === '内容平台模式')).toBe(false)
      const globalSkills = roots.find(root => root.key === 'dsh')?.skills
      for (const [name, declaredName] of Object.entries({
        故事创作: 'laotang-storycraft-zh', 故事资产提取: 'laotang-asset-extractor', 角色资产板: 'laotang-character-board',
        全能场景: 'laotang-scene-reference-zh', 'S10 电影级分镜': 'laotang-cinematic-storyboard-s10-free',
      })) {
        expect(globalSkills?.filter(skill => skill.declaredName === declaredName)).toEqual([
          expect.objectContaining({
            name, declaredName, description: expect.stringContaining(name), loadable: true, enabled: true, linked: true,
          }),
        ])
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
      for (const [api, ids] of [
        ['openai-responses', ['gpt-6.2-astra', 'gpt-6.2-sol', 'gpt-fixture']],
        ['anthropic-messages', ['claude-fixture']],
      ] as const) {
        const provider = 'novaflow-' + createHash('sha256').update(JSON.stringify(['Fixture group', api])).digest('hex').slice(0, 20)
        const baseURL = issuer + (api === 'anthropic-messages' ? '' : '/v1')
        const models = await rpc<Array<{ id: string; contextWindow: number; maxTokens: number }>>('llm/discoverModels', { settingsNs: 'llm-pi-ai', request: { provider, baseURL, api } })
        expect(models.map(model => model.id).sort()).toEqual(ids)
        expect(models).toEqual(ids.map(() => expect.objectContaining({ contextWindow: 512_000, maxTokens: 128_000 })))
      }
      expect(patch).not.toContain(access)
      const snapshot = await (await fetch(`${hostOrigin}/api/novaflow-account`, {
        method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{"action":"state"}',
      })).text()
      expect(JSON.parse(snapshot).value.nativeProviders).toHaveLength(2)
      expect(snapshot).not.toContain(access)
      expect(snapshot).not.toContain('pluginSetup')
      expect(snapshot).not.toContain('installFlow')
      const mediaState = async (action = 'state', fields = {}) => (await (await fetch(`${hostOrigin}/api/novaflow-account`, {
        method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ action, ...fields }),
      })).json()).value
      const media = await mediaState()
      const video = { id: 'video-fixture', group: 'Video group' }
      const image = { id: 'gpt-image-2.6', group: 'Image group' }
      expect(media.media.selected).toEqual({ image })
      expect(media.mediaModels).toContainEqual(expect.objectContaining(video))
      const deskRequest = (path: string, body?: object) => fetch(`${hostOrigin}/media-desk/${path}`, {
        headers: { cookie, 'content-type': 'application/json' },
        ...body && { method: 'POST', body: JSON.stringify(body) },
      })
      await expect(deskRequest('settings').then(response => response.json())).resolves.toMatchObject({ imageReady: true })
      expect((await deskRequest('settings', { imageCount: 0, shotCount: 0 })).status).toBe(200)
      const ideaResponse = await deskRequest('ops', { ops: [{ op: 'add_item', kind: 'idea', title: 'NovaFlow fixture cover' }] })
      expect(ideaResponse.status).toBe(200)
      const { state: deskState } = await ideaResponse.json() as { state: { items: Array<{ title: string; id: string }> } }
      const idea = deskState.items.find(item => item.title === 'NovaFlow fixture cover')
      expect(idea).toBeDefined()
      expect((await deskRequest('produce', { id: idea?.id, withImages: true })).status).toBe(200)
      await expect.poll(() => deskRequest(`production?id=${idea?.id}`).then(response => response.json()), { timeout: 15_000 })
        .toMatchObject({ production: { status: 'done', cover: { src: expect.stringMatching(/^media-desk\/files\//) } } })
      expect(platform.imageRequests).toEqual([{ model: image.id, group: image.group, size: '2048x1152' }])
      expect((await mediaState('set_media_model', { kind:'video', model:video.id, group:video.group, owner:media.media.owner })).media.selected.video).toEqual(video)
      const { canvas } = await (await deskRequest('canvas/create', { name: '试拍' })).json()
      const document = { ...canvas, nodes: [{ id: 'picture', type: 'imageGen', data: { prompt: 'test', tier: '1K', ratio: '1:1' } }, { id: 'movie', type: 'videoGen', data: { prompt: 'test' } }] }
      expect((await deskRequest('canvas/save', document)).status).toBe(200)
      const generate = (nodeId: string) => deskRequest('canvas/generate', { id: canvas.id, nodeId }).then(response => response.json())
      expect((await generate('picture')).job).toMatchObject({ status: 'completed' })
      expect(platform.imageRequests.at(-1)).toEqual({ model: image.id, group: image.group, size: '1024x1024' })
      const videoResult = await generate('movie')
      expect(videoResult.job).toMatchObject({ status: 'running' })
      expect((await deskRequest('settings', { exportDir: project })).status).toBe(200)
      await restart()
      expect(await readMemorySettings()).toMatchObject({ effective: focus, overrides: focus })
      await saveMemorySettings({ maxBytes: null, minImportance: null })
      expect(await readMemorySettings()).toMatchObject({ effective: companion, overrides: {} })
      const recovered = await (await deskRequest('canvas/generation/status', { id: canvas.id, nodeId: 'movie' })).json()
      expect(recovered.job).toMatchObject({ id: videoResult.job.id, status: 'completed' })
      const asset = await fetch(`${hostOrigin}/${recovered.job.files[0]}`, { headers: { cookie } })
      expect(asset.status).toBe(200)
      expect(Buffer.from(await asset.arrayBuffer()).toString('ascii', 4, 8)).toBe('ftyp')
      expect(await backend!.read()).toMatchObject({ loggedIn: true, hasApiKey: false })
      expect((await mediaState()).media.selected).toEqual({ image, video })
      await expect.poll(async () => (await mediaState()).media.mcp, { timeout:15000 }).toMatchObject({ state:'connected', toolCount:4 })
      expect(await guide('state')).toEqual({ seen: true, ready: true })
      await backend!.account.signOut(desktopClientMetadata('en'))
      expect(await backend!.read()).toMatchObject({ loggedIn: false, hasApiKey: false })
      expect((await mediaState()).media.selected).toEqual({})
      const savedModels = () => readFileSync(join(paths.profile, 'cordis.patch.yml'), 'utf8')
      expect(savedModels()).not.toContain('gpt-6.2-sol')
      expect(savedModels()).not.toContain('claude-fixture')
      await backend!.account.start(desktopClientMetadata('en'))
      expect((await fetch(platform.callback())).status).toBe(200)
      const providerId = (api: string) => 'novaflow-' + createHash('sha256').update(JSON.stringify(['Fixture group', api])).digest('hex').slice(0, 20)
      const responses = providerId('openai-responses')
      const messages = providerId('anthropic-messages')
      const initialized = savedModels()
      await rpc('settings/mutate', { ns: 'llm-pi-ai', ops: [
        { op: 'unset', path: ['providers', messages] },
        { op: 'set', path: ['providers', responses, 'models'], value: [{ id: 'gpt-fixture', name: 'Edited name' }] },
      ] })
      expect(savedModels()).toContain('Edited name')
      expect(savedModels()).not.toContain('gpt-6.2-sol')
      expect(savedModels()).not.toContain('claude-fixture')
      const refresh = (action: string) => fetch(`${hostOrigin}/api/novaflow-account`, {
        method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ action }),
      })
      expect((await refresh('refresh')).status).toBe(200)
      expect(savedModels()).toContain('Edited name')
      expect(savedModels()).not.toContain('gpt-6.2-sol')
      expect((await refresh('refresh_models')).status).toBe(200)
      expect(savedModels()).toBe(initialized)
      const marketStatus = async () => (await fetch(`${hostOrigin}/dsh-market/installed`, { headers: { cookie } })).status
      const clientOffersMarket = async () => (await (await fetch(hostOrigin, { headers: { cookie } })).text()).includes('"id":"dshmarket"')
      expect(await clientOffersMarket()).toBe(true)
      platform.setScope('enterprise:42')
      expect((await refresh('refresh')).status).toBe(200)
      const checkEnterpriseMarket = async () => {
        await expect.poll(marketStatus).toBe(404)
        await expect.poll(clientOffersMarket).toBe(false)
        const attempt = await fetch(`${hostOrigin}/dsh-market/install`, { method: 'POST', headers: { cookie, origin: hostOrigin, 'content-type': 'application/json' }, body: '{}' })
        expect([404, 405]).toContain(attempt.status)
      }
      await checkEnterpriseMarket()
      await restart()
      expect((await mediaState()).account.role).toBe('enterprise:42')
      await checkEnterpriseMarket()
      await backend!.account.signOut(desktopClientMetadata('en'))
      await backend!.account.start(desktopClientMetadata('en'))
      expect((await fetch(platform.callback())).status).toBe(200)
      await checkEnterpriseMarket()
      await backend!.account.signOut(desktopClientMetadata('en'))
      platform.setScope('personal')
      await backend!.account.start(desktopClientMetadata('en'))
      expect((await fetch(platform.callback())).status).toBe(200)
      await expect.poll(marketStatus).toBe(200)
      await expect.poll(clientOffersMarket).toBe(true)
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

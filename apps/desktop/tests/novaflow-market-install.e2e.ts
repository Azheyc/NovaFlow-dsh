/** The market must return the Host's install result when profile reconciliation remounts it. */
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { DesktopHostProcess } from '../src/host-process.ts'
import { authenticateWebHost } from '../src/web-document.ts'
import { builtHost, prepareDesktopHome, repository } from './harness.ts'

describe.skipIf(!existsSync(builtHost))('bundled NovaFlow market', () => {
  it('settles a successful installation after Host reconciliation unloads the market', async () => {
    const root = mkdtempSync(join(tmpdir(), 'novaflow-market-install-'))
    onTestFinished(() => {
      vi.unstubAllEnvs()
      rmSync(root, { recursive: true, force: true })
    })
    const { project, paths } = await prepareDesktopHome(root)
    // Only the local market is needed. The fixture registry serves no public packages.
    const profileManifest = join(paths.profile, 'package.json')
    const profile = JSON.parse(readFileSync(profileManifest, 'utf8')) as {
      dependencies: Record<string, string>
      dsh: { profile: { bundles: string[] } }
    }
    const market = profile.dependencies.dshmarket
    if (market === undefined) throw new Error('Seeded market is missing')
    profile.dsh.profile.bundles = profile.dsh.profile.bundles.filter(name => name === 'dshmarket' || !Object.hasOwn(profile.dependencies, name))
    profile.dependencies = { dshmarket: market }
    writeFileSync(profileManifest, JSON.stringify(profile))
    // The fresh profile's default Exa selection needs the excluded Exa bundle.
    writeFileSync(join(paths.profile, 'cordis.patch.yml'), '[]\n')
    const name = 'dsh-market-install-fixture'
    const version = `1.0.0-${randomUUID()}`
    const url = `https://github.com/fixture/${name}`
    const manifest = { name, version, type: 'module', main: './index.js', dsh: { bundle: { patch: 'cordis.patch.yml' } } }
    const source = join(root, 'fixture')
    mkdirSync(source)
    writeFileSync(join(source, 'package.json'), JSON.stringify(manifest))
    writeFileSync(join(source, 'index.js'), 'export const name = "market-install-fixture"; export function apply() {}\n')
    writeFileSync(join(source, 'cordis.patch.yml'), `- insert:\n    - id: ${name}\n      name: ${name}\n`)
    const pnpm = join(repository, 'node_modules/pnpm/bin/pnpm.mjs')
    execFileSync(process.execPath, [pnpm, 'pack', '--out', 'fixture.tgz'], { cwd: source })
    const bytes = readFileSync(join(source, 'fixture.tgz'))
    const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
    const marketEntry = join(paths.profile, 'node_modules/dshmarket/lib/index.js')
    let tarballs = 0
    const server = createServer((request, response) => {
      if (request.url === '/fixture.tgz') {
        tarballs++
        // Force the real Host to remount the market while applying this install.
        appendFileSync(marketEntry, '\n// Changed during the fixture package download.\n')
        response.end(bytes)
        return
      }
      response.setHeader('Content-Type', 'application/json')
      if (request.url === '/catalog.json') {
        response.end(JSON.stringify({ plugins: [{ name, url, npm: name, category: ['tools'] }] }))
      } else if (request.url === `/${name}` || request.url === `/${name}/latest`) {
        const release = { ...manifest, dist: { tarball: `http://${request.headers.host}/fixture.tgz`, integrity } }
        response.end(JSON.stringify(request.url.endsWith('/latest') ? release : {
          name, 'dist-tags': { latest: version }, versions: { [version]: release },
          time: { [version]: '2020-01-01T00:00:00Z' },
        }))
      } else response.writeHead(404).end()
    })
    onTestFinished(async () => {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    })
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Fixture registry requires a TCP port')
    const registry = `http://127.0.0.1:${address.port}`
    const host = new DesktopHostProcess(process.execPath, project, paths.profile, undefined, {
      ...process.env, DSHM_REGISTRY_URL: `${registry}/catalog.json`, DSHM_NPM_MIRROR: registry,
    })
    onTestFinished(() => host.stop())
    const { url: launchUrl } = await host.start()
    const origin = new URL(launchUrl).origin
    const cookie = await authenticateWebHost(launchUrl)
    const headers = { cookie, origin, 'content-type': 'application/json' }
    const result = await fetch(`${origin}/dsh-market/install`, {
      method: 'POST', headers, body: JSON.stringify({ url, version, busyPolicy: 'drain' }),
    })
    const outcome: unknown = await result.json()
    const history = join(paths.profile, '.dsh-market', 'log.ndjson')
    expect(result.status, `${JSON.stringify(outcome)}\n${existsSync(history) ? readFileSync(history, 'utf8') : ''}`).toBe(200)
    expect(outcome).toMatchObject({ ok: true, marketReloaded: true, activation: { [name]: { state: 'live' } } })
    expect(tarballs).toBe(1)
    const method = 'pluginManager/listBundles'
    const inventory = await fetch(`${origin}/api/${method}`, {
      method: 'POST', headers, body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { args: {} } }),
    })
    await expect(inventory.json()).resolves.toMatchObject({ result: { ok: true, value: expect.arrayContaining([
      expect.objectContaining({ name, version, installed: true, enabled: true }),
    ]) } })
  }, 90_000)
})

/** Market operations must finish when Host reconciliation remounts the market. */
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
  it('reports successful installs and updates across market remounts', async () => {
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
    const name = `dsh-market-fixture-${randomUUID()}`
    const version = '1.0.0'
    const updatedVersion = '1.1.0'
    const url = `https://github.com/fixture/${name}`
    const manifest = { name, version, type: 'module', main: './index.js', dsh: { bundle: { patch: 'cordis.patch.yml' } } }
    const source = join(root, 'fixture')
    mkdirSync(source)
    writeFileSync(join(source, 'index.js'), 'export const name = "market-install-fixture"; export function apply() {}\n')
    writeFileSync(join(source, 'cordis.patch.yml'), `- insert:\n    - id: ${name}\n      name: ${name}\n`)
    const pnpm = join(repository, 'node_modules/pnpm/bin/pnpm.mjs')
    const builds = new Map([version, updatedVersion].map((releaseVersion) => {
      writeFileSync(join(source, 'package.json'), JSON.stringify({ ...manifest, version: releaseVersion }))
      const file = `${releaseVersion}.tgz`
      execFileSync(process.execPath, [pnpm, 'pack', '--out', file], { cwd: source })
      const bytes = readFileSync(join(source, file))
      return [releaseVersion, { file, bytes, integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}` }]
    }))
    const marketEntry = join(paths.profile, 'node_modules/dshmarket/lib/index.js')
    let latest = version
    const tarballs: string[] = []
    const server = createServer((request, response) => {
      const download = [...builds.values()].find(build => request.url === `/${build.file}`)
      if (download !== undefined) {
        tarballs.push(download.file)
        // Force the real Host to remount the market when reconciling either build.
        appendFileSync(marketEntry, '\n// Changed during fixture download.\n')
        response.end(download.bytes)
        return
      }
      response.setHeader('Content-Type', 'application/json')
      if (request.url === '/catalog.json') {
        response.end(JSON.stringify({ plugins: [{ name, url, npm: name, category: ['tools'] }] }))
      } else if (request.url === `/${name}` || request.url === `/${name}/latest`) {
        const available = latest === version ? [version] : [version, updatedVersion]
        const versions = Object.fromEntries(available.map((releaseVersion) => {
          const build = builds.get(releaseVersion)!
          return [releaseVersion, { ...manifest, version: releaseVersion, dist: { tarball: `http://${request.headers.host}/${build.file}`, integrity: build.integrity } }]
        }))
        response.end(JSON.stringify(request.url.endsWith('/latest') ? versions[latest] : {
          name, 'dist-tags': { latest }, versions,
          time: Object.fromEntries(available.map(releaseVersion => [releaseVersion, '2020-01-01T00:00:00Z'])),
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
    expect(tarballs).toEqual([`${version}.tgz`])
    const method = 'pluginManager/listBundles'
    const inventory = async () => (await fetch(`${origin}/api/${method}`, {
      method: 'POST', headers, body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { args: {} } }),
    })).json()
    const installed = (releaseVersion: string) => ({ result: { ok: true, value: expect.arrayContaining([
      expect.objectContaining({ name, version: releaseVersion, installed: true, enabled: true }),
    ]) } })
    await expect(inventory()).resolves.toMatchObject(installed(version))

    latest = updatedVersion
    const update = (eligibleVersion: string) => fetch(`${origin}/dsh-market/update`, {
      method: 'POST', headers, body: JSON.stringify({ name, eligibleVersion, busyPolicy: 'drain' }),
    })
    const resultUpdate = await update(updatedVersion)
    const updated: unknown = await resultUpdate.json()
    await expect(inventory()).resolves.toMatchObject(installed(updatedVersion))
    expect(resultUpdate.status, `${JSON.stringify(updated)}\n${readFileSync(history, 'utf8')}`).toBe(200)
    expect(updated).toMatchObject({ ok: true, marketReloaded: true, activation: { [name]: { state: expect.any(String) } } })
    const invalid = await update('99.0.0')
    expect(invalid.status).toBe(409)
    await expect(invalid.json()).resolves.toMatchObject({ staleTarget: true })
    expect(tarballs).toEqual([`${version}.tgz`, `${updatedVersion}.tgz`])
  }, 90_000)
})

/** Offline plugin seeding must preserve user-owned package choices across later launches. */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { loadOptionalPatches } from '@deepseek-ai/dsh-app-boot'
import { seedNovaFlowPlugins } from '../src/novaflow-preinstalled.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture(existing = false, name = 'fixture-plugin') {
  const root = mkdtempSync(join(tmpdir(), 'novaflow-seed-'))
  roots.push(root)
  const profile = join(root, 'profile'), runtime = join(root, 'runtime'), seed = join(runtime, 'novaflow-preinstalled')
  mkdirSync(profile, { recursive: true })
  mkdirSync(join(seed, 'node_modules', name, 'native'), { recursive: true })
  writeFileSync(join(seed, 'node_modules', name, 'native', 'payload.bin'), Buffer.from([0, 255, 12, 128]))
  writeFileSync(join(seed, 'package.json'), JSON.stringify({ dependencies: { [name]: '1.0.0' } }))
  writeFileSync(join(seed, 'node_modules', name, 'package.json'), JSON.stringify({ name, version: '1.0.0' }))
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: existing ? { [name]: '2.0.0' } : {}, dsh: { profile: { bundles: [] } } }))
  if (existing) {
    mkdirSync(join(profile, 'node_modules', name), { recursive: true })
    writeFileSync(join(profile, 'node_modules', name, 'package.json'), JSON.stringify({ version: '2.0.0' }))
  }
  const read = () => JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>
    dsh: { profile: { bundles: string[] } }
  }
  return { profile, runtime, read }
}

const exa = '@tonydua/dsh-web-search-exa'

it('defaults a newly seeded Exa bundle while retaining existing fetch settings and patch expressions', () => {
  const f = fixture(false, exa)
  const patch = join(f.profile, 'cordis.patch.yml')
  writeFileSync(patch, '# User settings\n- id: web\n  config:\n    fetchProvider: http\n- id: extra\n  config:\n    value: !!js "process.env.EXAMPLE"\n')
  seedNovaFlowPlugins(f.profile, f.runtime, false)
  expect(f.read().dsh.profile.bundles).toEqual([exa])
  expect(loadOptionalPatches('test', patch)?.[0]).toMatchObject({ id: 'web', config: { fetchProvider: 'http', searchProvider: 'exa' } })
  expect(readFileSync(patch, 'utf8')).toContain('# User settings')
  expect(readFileSync(patch, 'utf8')).toContain('!!js')
  writeFileSync(patch, '[]\n')
  seedNovaFlowPlugins(f.profile, f.runtime, false)
  expect(loadOptionalPatches('test', patch)).toEqual([])
})

it('preserves an explicit search provider when adding Exa', () => {
  const f = fixture(false, exa)
  const patch = join(f.profile, 'cordis.patch.yml')
  const initial = '- id: web\n  config:\n    searchProvider: deepseek\n'
  writeFileSync(patch, initial)
  seedNovaFlowPlugins(f.profile, f.runtime, false)
  expect(f.read().dsh.profile.bundles).toEqual([exa])
  expect(readFileSync(patch, 'utf8')).toBe(initial)
})

it('preserves the installed Exa plugin and avoids conflicts with the official Exa bundle', () => {
  const installed = fixture(true, exa)
  seedNovaFlowPlugins(installed.profile, installed.runtime, false)
  expect(installed.read().dependencies[exa]).toBe('2.0.0')
  expect(installed.read().dsh.profile.bundles).toEqual([])
  expect(existsSync(join(installed.profile, 'cordis.patch.yml'))).toBe(false)

  const official = fixture(false, exa)
  const manifest = official.read()
  manifest.dsh.profile.bundles = ['@deepseek-ai/dsh-web-search-exa']
  writeFileSync(join(official.profile, 'package.json'), JSON.stringify(manifest))
  seedNovaFlowPlugins(official.profile, official.runtime, false)
  expect(official.read()).toEqual(manifest)
})

it('seeds a fresh profile offline and schedules its one-time mode guide', () => {
  const f = fixture()
  seedNovaFlowPlugins(f.profile, f.runtime, true)
  expect(f.read().dependencies).toEqual({ 'fixture-plugin': '1.0.0' })
  expect(f.read().dsh.profile.bundles).toEqual(['fixture-plugin'])
  expect(JSON.parse(readFileSync(join(f.profile, '.novaflow-mode-guide.json'), 'utf8'))).toEqual({ version: 1, seen: false })
  expect(existsSync(join(f.profile, 'node_modules', 'fixture-plugin', 'package.json'))).toBe(true)
  expect(readFileSync(join(f.profile, 'node_modules', 'fixture-plugin', 'native', 'payload.bin'))).toEqual(Buffer.from([0, 255, 12, 128]))
})

it('preserves an upgraded disabled plugin and suppresses first-run guidance on upgrade', () => {
  const f = fixture(true)
  seedNovaFlowPlugins(f.profile, f.runtime, false)
  expect(f.read().dependencies['fixture-plugin']).toBe('2.0.0')
  expect(f.read().dsh.profile.bundles).toEqual([])
  expect(JSON.parse(readFileSync(join(f.profile, 'node_modules/fixture-plugin/package.json'), 'utf8'))).toEqual({ version: '2.0.0' })
  expect(JSON.parse(readFileSync(join(f.profile, '.novaflow-mode-guide.json'), 'utf8'))).toEqual({ version: 1, seen: true })
})

it('does not reinstall a package the user removes after receiving the seed', () => {
  const f = fixture()
  seedNovaFlowPlugins(f.profile, f.runtime, true)
  writeFileSync(join(f.profile, 'package.json'), JSON.stringify({ dependencies: {}, dsh: { profile: { bundles: [] } } }))
  rmSync(join(f.profile, 'node_modules', 'fixture-plugin'), { recursive: true })
  seedNovaFlowPlugins(f.profile, f.runtime, false)
  expect(f.read().dependencies).toEqual({})
  expect(existsSync(join(f.profile, 'node_modules', 'fixture-plugin'))).toBe(false)
})

it('adds only new bundled plugins when upgrading a previously seeded profile', () => {
  const f = fixture()
  seedNovaFlowPlugins(f.profile, f.runtime, true)
  const manifest = join(f.profile, 'package.json')
  const guide = join(f.profile, '.novaflow-mode-guide.json')
  writeFileSync(manifest, JSON.stringify({ dependencies: {}, dsh: { profile: { bundles: [] } } }))
  writeFileSync(guide, JSON.stringify({ version: 1, seen: true }))
  rmSync(join(f.profile, 'node_modules', 'fixture-plugin'), { recursive: true })
  const seed = join(f.runtime, 'novaflow-preinstalled')
  const newPlugin = '@michengai/dsh-skills-manager'
  mkdirSync(join(seed, 'node_modules', newPlugin), { recursive: true })
  writeFileSync(join(seed, 'node_modules', newPlugin, 'package.json'), JSON.stringify({ name: newPlugin, version: '1.4.11' }))
  writeFileSync(join(seed, 'package.json'), JSON.stringify({ dependencies: { 'fixture-plugin': '1.0.0', [newPlugin]: '1.4.11' } }))
  seedNovaFlowPlugins(f.profile, f.runtime, false)
  expect(f.read().dependencies).toEqual({ [newPlugin]: '1.4.11' })
  expect(f.read().dsh.profile.bundles).toEqual([newPlugin])
  expect(existsSync(join(f.profile, 'node_modules', 'fixture-plugin'))).toBe(false)
  expect(existsSync(join(f.profile, 'node_modules', newPlugin, 'package.json'))).toBe(true)
  expect(JSON.parse(readFileSync(guide, 'utf8'))).toEqual({ version: 1, seen: true })
  writeFileSync(manifest, JSON.stringify({ dependencies: { [newPlugin]: '1.4.11' }, dsh: { profile: { bundles: [] } } }))
  seedNovaFlowPlugins(f.profile, f.runtime, false)
  expect(f.read().dsh.profile.bundles).toEqual([])
})

it.each([true, false])('uses a profile-relative dependency for the private prompt package (fresh: %s)', (fresh) => {
  const f = fixture()
  const name = 'novaflow-dsh-prompt-presets'
  const seed = join(f.runtime, 'novaflow-preinstalled')
  const pkg = join(seed, 'node_modules', name)
  mkdirSync(pkg)
  const stamp = join(seed, 'market-build.sha256')
  writeFileSync(stamp, 'a'.repeat(64))
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name, version: '1.0.0' }))
  writeFileSync(join(seed, 'package.json'), JSON.stringify({ dependencies: { [name]: '1.0.0' } }))
  if (!fresh) {
    writeFileSync(join(f.profile, 'package.json'), JSON.stringify({ dependencies: { [name]: '1.0.0' }, dsh: { profile: { bundles: [] } } }))
    writeFileSync(join(f.profile, '.novaflow-preinstalled-v1.json'), JSON.stringify({ version: 1, packages: { [name]: '1.0.0' } }))
  }
  seedNovaFlowPlugins(f.profile, f.runtime, fresh)
  const spec = f.read().dependencies[name]
  expect(spec).toBe(`link:./.novaflow-bundled/${name}/${'a'.repeat(64)}`)
  const source = join(f.profile, spec!.slice('link:'.length), 'package.json')
  expect(readFileSync(source, 'utf8')).toBe(readFileSync(join(pkg, 'package.json'), 'utf8'))
  expect(f.read().dsh.profile.bundles).toEqual(fresh ? [name] : [])
  expect(existsSync(join(f.profile, 'node_modules', name, 'package.json'))).toBe(true)
  const custom = join(f.profile, '.novaflow-prompt-presets.json')
  writeFileSync(custom, '{"version":2,"custom":{"categories":[],"featured":[]}}')
  writeFileSync(join(pkg, 'catalog.js'), 'updated built-ins')
  writeFileSync(stamp, 'b'.repeat(64))
  seedNovaFlowPlugins(f.profile, f.runtime, false)
  expect(readFileSync(join(f.profile, 'node_modules', name, 'catalog.js'), 'utf8')).toBe('updated built-ins')
  expect(readFileSync(custom, 'utf8')).toBe('{"version":2,"custom":{"categories":[],"featured":[]}}')
  expect(f.read().dsh.profile.bundles).toEqual(fresh ? [name] : [])
})

it('replaces an online market with the local build while preserving its disabled selection and settings', () => {
  const market = 'dshmarket'
  const f = fixture(true, market)
  const seed = join(f.runtime, 'novaflow-preinstalled')
  const stamp = join(seed, 'market-build.sha256')
  const marker = join(f.profile, '.novaflow-preinstalled-v1.json')
  const settings = join(f.profile, 'cordis.patch.yml')
  const manifest = join(f.profile, 'package.json')
  writeFileSync(marker, JSON.stringify({ version: 1, packages: { [market]: '1.0.0' } }))
  writeFileSync(settings, '[]\n')
  for (const build of ['a'.repeat(64), 'b'.repeat(64)]) {
    writeFileSync(stamp, build)
    seedNovaFlowPlugins(f.profile, f.runtime, false)
    expect(f.read().dependencies[market]).toBe(`link:./.novaflow-bundled/${market}/${build}`)
    expect(f.read().dsh.profile.bundles).toEqual([])
    expect(readFileSync(settings, 'utf8')).toBe('[]\n')
    expect(JSON.parse(readFileSync(join(f.profile, 'node_modules', market, 'package.json'), 'utf8'))).toMatchObject({ version: '1.0.0' })
    seedNovaFlowPlugins(f.profile, f.runtime, false)
  }
  writeFileSync(manifest, JSON.stringify({ dependencies: {}, dsh: { profile: { bundles: [] } } }))
  rmSync(join(f.profile, 'node_modules', market), { recursive: true, force: true })
  seedNovaFlowPlugins(f.profile, f.runtime, false)
  expect(f.read().dependencies).toEqual({})
})

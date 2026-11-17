/** Offline plugin seeding must preserve user-owned package choices across later launches. */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { seedNovaFlowPlugins } from '../src/novaflow-preinstalled.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture(existing = false) {
  const root = mkdtempSync(join(tmpdir(), 'novaflow-seed-'))
  roots.push(root)
  const profile = join(root, 'profile'), runtime = join(root, 'runtime'), seed = join(runtime, 'novaflow-preinstalled')
  mkdirSync(profile, { recursive: true })
  mkdirSync(join(seed, 'node_modules', 'fixture-plugin'), { recursive: true })
  mkdirSync(join(seed, 'node_modules', 'fixture-plugin', 'native'), { recursive: true })
  writeFileSync(join(seed, 'node_modules', 'fixture-plugin', 'native', 'payload.bin'), Buffer.from([0, 255, 12, 128]))
  writeFileSync(join(seed, 'package.json'), JSON.stringify({ dependencies: { 'fixture-plugin': '1.0.0' } }))
  writeFileSync(join(seed, 'node_modules', 'fixture-plugin', 'package.json'), JSON.stringify({ name: 'fixture-plugin', version: '1.0.0' }))
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: existing ? { 'fixture-plugin': '2.0.0' } : {}, dsh: { profile: { bundles: [] } } }))
  if (existing) {
    mkdirSync(join(profile, 'node_modules', 'fixture-plugin'), { recursive: true })
    writeFileSync(join(profile, 'node_modules', 'fixture-plugin', 'package.json'), JSON.stringify({ version: '2.0.0' }))
  }
  const read = () => JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>
    dsh: { profile: { bundles: string[] } }
  }
  return { profile, runtime, read }
}

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

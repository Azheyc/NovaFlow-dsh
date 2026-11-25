import { expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElectronBuilderConfig } from '../scripts/electron-builder-config.mjs'
import { resolveDesktopAutoUpdateConfig, resolveDesktopUploadConfig } from '../scripts/desktop-auto-update-environment.mjs'
import { resolveDesktopPolicyEnvironment } from '../scripts/desktop-policy-environment.mjs'

const env = { DSH_DESKTOP_APP_ID: 'vip.ycnovaflow.desktop', DSH_DESKTOP_UNSIGNED: '1' }
it('keeps the Windows updater and NSIS flow on the mirrored NovaFlow release feed', () => {
  const config = createElectronBuilderConfig(env, 'win32', 'x64')
  expect(config.productName).toBe('NovaFlow')
  expect(config.artifactName).toBe('NovaFlow-${version}-${os}-${arch}.${ext}')
  expect(config.directories.output).toMatch(/[\\/]unsigned-artifacts$/u)
  expect(config.win.target).toEqual(['nsis'])
  expect(config.nsis.differentialPackage).toBe(true)
  expect(config.publish).toEqual([{ provider: 'generic', url: 'https://gh-proxy.com/https://github.com/Azheyc/NovaFlow-dsh/releases/latest/download/', channel: 'nightly' }])
  expect(config.extraMetadata).not.toHaveProperty('dshMandatoryUpdatePolicy')
  expect(config.extraMetadata).toHaveProperty('name', '@novaflow/desktop')
  expect(config.win.forceCodeSigning).toBe(false)
  expect(config.extraMetadata).not.toHaveProperty('novaFlowManualMacUpdate')
})
it('uses the same mirror for both channels and refuses upstream publication', () => {
  for (const channel of ['stable', 'nightly']) {
    const update = resolveDesktopAutoUpdateConfig({ ...env, DSH_DESKTOP_UPDATE_CHANNEL: channel }, 'win32', 'x64')
    expect(update.channel).toBe(channel)
    expect(update.publicUrl).toContain('/Azheyc/NovaFlow-dsh/releases/latest/download/')
  }
  expect(resolveDesktopPolicyEnvironment(env)).toBeUndefined()
  expect(() => resolveDesktopUploadConfig(env, 'win32', 'x64')).toThrow('GitHub')
  const mac = createElectronBuilderConfig(env, 'darwin', 'arm64')
  expect(mac.productName).toBe('NovaFlow')
  expect(mac.extraMetadata).toHaveProperty('novaFlowManualMacUpdate', true)
  expect(mac.artifactName).toBe('NovaFlow-${version}-${os}-${arch}.${ext}')
  expect(mac.mac).toMatchObject({ target: ['dmg', 'zip'] })
  expect(mac.protocols[0].schemes).toEqual(['novaflow'])
  expect(mac.publish?.[0].url).toContain('/Azheyc/NovaFlow-dsh/releases/latest/download/')
  expect(() => resolveDesktopAutoUpdateConfig(env, 'darwin', 'x64')).toThrow('Unsupported NovaFlow')
})

it.each([
  { target: 'win-x64', extension: 'exe', channel: 'stable.yml' },
  { target: 'mac-arm64', extension: 'zip', channel: 'stable-mac.yml' },
])('publishes the public update filename for $target', ({ target, extension, channel }) => {
  const root = mkdtempSync(join(tmpdir(), 'novaflow-feed-'))
  try {
    const version = '0.2.2-rc.5.20261124.2'
    const base = `NovaFlow-${version}-${target}`
    const download = `${base}.${extension}`
    const legacy = `${base}-unsigned.${extension}`
    writeFileSync(join(root, legacy), 'old filename')
    writeFileSync(join(root, download), 'public download')
    writeFileSync(join(root, `${download}.blockmap`), 'update index')
    if (extension === 'zip') writeFileSync(join(root, `${base}.dmg`), 'disk image')
    const script = fileURLToPath(new URL('../scripts/prepare-novaflow-release.mjs', import.meta.url))
    execFileSync(process.execPath, [script, root, version])
    const feed = readFileSync(join(root, channel), 'utf8')
    expect(feed).toContain(`/v${version}/${download}`)
    expect(feed).not.toContain(legacy)
    const checksums = readFileSync(join(root, 'SHA256SUMS'), 'utf8')
    expect(checksums).toContain(`  ${download}.blockmap\n`)
    expect(checksums).not.toContain(legacy)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

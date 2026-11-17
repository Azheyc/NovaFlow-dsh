import { expect, it } from 'vitest'
import { createElectronBuilderConfig } from '../scripts/electron-builder-config.mjs'
import { resolveDesktopAutoUpdateConfig, resolveDesktopUploadConfig } from '../scripts/desktop-auto-update-environment.mjs'
import { resolveDesktopPolicyEnvironment } from '../scripts/desktop-policy-environment.mjs'

const env = { DSH_DESKTOP_APP_ID: 'vip.ycnovaflow.desktop', DSH_DESKTOP_UNSIGNED: '1' }
it('keeps the Windows updater and NSIS flow on the mirrored NovaFlow release feed', () => {
  const config = createElectronBuilderConfig(env, 'win32', 'x64')
  expect(config.productName).toBe('NovaFlow')
  expect(config.win.target).toEqual(['nsis'])
  expect(config.nsis.differentialPackage).toBe(true)
  expect(config.publish).toEqual([{ provider: 'generic', url: 'https://gh-proxy.com/https://github.com/Azheyc/NovaFlow-dsh/releases/latest/download/', channel: 'nightly' }])
  expect(config.extraMetadata).not.toHaveProperty('dshMandatoryUpdatePolicy')
  expect(config.win.forceCodeSigning).toBe(false)
})
it('uses the same mirror for both channels and refuses upstream publication', () => {
  for (const channel of ['stable', 'nightly']) {
    const update = resolveDesktopAutoUpdateConfig({ ...env, DSH_DESKTOP_UPDATE_CHANNEL: channel }, 'win32', 'x64')
    expect(update.channel).toBe(channel)
    expect(update.publicUrl).toContain('/Azheyc/NovaFlow-dsh/releases/latest/download/')
  }
  expect(resolveDesktopPolicyEnvironment(env)).toBeUndefined()
  expect(() => resolveDesktopUploadConfig(env, 'win32', 'x64')).toThrow('GitHub')
  expect(() => resolveDesktopAutoUpdateConfig(env, 'darwin', 'arm64')).toThrow('Windows x64')
})

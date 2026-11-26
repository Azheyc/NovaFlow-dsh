import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { valid } from 'semver'
import type { UpdateInfo } from 'electron-updater'

/** Downloads the version-bound mirror asset and exposes a local path only after verification. */
export async function downloadNovaFlowDmg(info: UpdateInfo, cache: string,
  request: (url: string, options: RequestInit) => Promise<Response>, signal: AbortSignal,
  progress: (percent: number) => void): Promise<string> {
  if (!valid(info.version)) throw new Error('Invalid installer version')
  const name = `NovaFlow-${info.version}-mac-arm64.dmg`
  const url = `https://gh-proxy.com/https://github.com/Azheyc/NovaFlow-dsh/releases/download/v${info.version}/${name}`
  const file = info.files.find(entry => entry.url === url)
  if (!file || !file.size || !Number.isSafeInteger(file.size) || file.size < 1 || !/^[A-Za-z0-9+/]{86}==$/u.test(file.sha512)) {
    throw new Error('Missing verified DMG in the update feed')
  }
  await mkdir(cache, { recursive: true, mode: 0o700 })
  const temporary = join(cache, `${randomUUID()}.part`)
  const destination = join(cache, 'NovaFlow.dmg')
  const timeout = new AbortController()
  const combined = AbortSignal.any([timeout.signal, signal])
  let timer: ReturnType<typeof setTimeout> | undefined
  const arm = (): void => {
    clearTimeout(timer)
    timer = setTimeout(() => timeout.abort(Object.assign(new Error('Installer download timed out'), { code: 'ETIMEDOUT' })), 60_000)
  }
  arm()
  try {
    const response = await request(url, { signal: combined, credentials: 'omit' })
    if (!response.ok || !response.body) throw new Error(`Installer download failed (HTTP ${response.status})`)
    const expected = file.size
    const hash = createHash('sha512')
    let received = 0
    let previous = 0
    const reader = response.body.getReader()
    async function* chunks() {
      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          arm()
          received += value.byteLength
          if (received > expected) throw new Error('Installer exceeds its published size')
          hash.update(value)
          const percent = Math.floor(received / expected * 100)
          if (percent !== previous) { previous = percent; progress(percent) }
          yield value
        }
      } finally { reader.releaseLock() }
    }
    const output = await open(temporary, 'wx', 0o600)
    try {
      await pipeline(chunks(), output.createWriteStream(), { signal: combined })
    } finally { await output.close() }
    if (received !== expected || hash.digest('base64') !== file.sha512) throw new Error('Installer size or SHA-512 mismatch')
    combined.throwIfAborted()
    await rename(temporary, destination)
    return destination
  } catch (error) {
    combined.throwIfAborted()
    throw error
  } finally {
    clearTimeout(timer)
    timeout.abort()
    await rm(temporary, { force: true })
  }
}

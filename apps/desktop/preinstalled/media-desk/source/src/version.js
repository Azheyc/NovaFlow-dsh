import { createRequire } from 'node:module'
const { version } = createRequire(import.meta.url)('../package.json')
export function createVersionCheck() {
  return { read: () => ({ current: version, ready: true, latest: null, updateAvailable: false, failed: false, checkedAt: null }) }
}

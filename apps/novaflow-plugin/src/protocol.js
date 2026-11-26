import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const ORIGIN = 'https://www.ycnovaflow.vip'
export const PREFIX = '/api/novaflow/v1'
export const RECORD = 'novaflow-account/creator'
export class NovaError extends Error {
  constructor(code) { super(code); this.code = code }
}
// Group IDs stay on requests and saved selections. Display fields come from the
// same catalog response, with item names as a fallback for earlier platforms.
export function catalogGroupDetails(data) {
  const groups = new Map()
  for (const row of data.items) {
    if (typeof row?.group_id !== 'string') continue
    const id = row.group_id
    if (!groups.has(id)) {
      const entry = data.group_details?.[id]
      groups.set(id, {
        name: typeof entry?.name === 'string' ? entry.name.trim() : '',
        description: typeof entry?.description === 'string' ? entry.description.trim() : '',
        ratio: Number.isFinite(entry?.ratio) && entry.ratio >= 0 ? entry.ratio : undefined,
      })
    }
    const details = groups.get(id)
    if (!details.name && typeof row.group_name === 'string') details.name = row.group_name.trim()
  }
  // Older catalog responses used the display name as a placeholder note.
  for (const [id, details] of groups) {
    if (!data.group_details?.[id]?.name && details.description === (details.name || id)) details.description = ''
  }
  return groups
}
export function safeCode(error) {
  return error instanceof NovaError ? error.code : 'INTERNAL_ERROR'
}
export const nonce = () => randomBytes(32).toString('base64url')
export const challenge = value => createHash('sha256').update(value).digest('base64url')
export function equalSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const left = Buffer.from(a), right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
export function callbackOrigin(value) {
  const url = new URL(value)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || Number(url.port) < 1024 || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new NovaError('CALLBACK_UNAVAILABLE')
  return url.origin
}
export function authorizationUrl(value, requestId) {
  const url = new URL(value)
  if (url.origin !== ORIGIN || url.pathname !== '/desktop/authorize' || url.username || url.password || url.hash || url.searchParams.get('request') !== requestId || url.searchParams.getAll('request').length !== 1 || [...url.searchParams.keys()].some(key => key !== 'request')) throw new NovaError('INVALID_RESPONSE')
  return url.href
}
export function tokenPair(data, now = Date.now()) {
  if (!data || data.token_type !== 'Bearer' || !/^nfds_[A-Za-z0-9_-]{43}$/.test(data.access_token) || !/^nfdr_[A-Za-z0-9_-]{43}$/.test(data.refresh_token) || !/^nfdev_[A-Za-z0-9_-]{43}$/.test(data.session_id)
    || ![undefined, 'rotating', 'none'].includes(data.refresh_token_rotation)) throw new NovaError('INVALID_RESPONSE')
  const deadline = seconds => {
    if (seconds === null && data.refresh_token_rotation === 'none') return null
    if (!Number.isSafeInteger(seconds) || seconds <= 0 || !Number.isSafeInteger(now + seconds * 1000)) throw new NovaError('INVALID_RESPONSE')
    return now + seconds * 1000
  }
  return { version: 1, issuer: ORIGIN, accessToken: data.access_token, refreshToken: data.refresh_token, sessionId: data.session_id,
    expiresAt: deadline(data.expires_in), refreshExpiresAt: deadline(data.refresh_expires_in),
    ...(data.refresh_token_rotation === undefined ? {} : { refreshTokenRotation: data.refresh_token_rotation }) }
}
export function storedGrant(record) {
  const value = record?.kind === 'grant' ? record.payload : null
  const deadline = time => (time === null && value?.refreshTokenRotation === 'none') || (Number.isFinite(time) && time > 0)
  return value?.version === 1 && value.issuer === ORIGIN && /^nfds_[A-Za-z0-9_-]{43}$/.test(value.accessToken) && /^nfdr_[A-Za-z0-9_-]{43}$/.test(value.refreshToken) && /^nfdev_[A-Za-z0-9_-]{43}$/.test(value.sessionId)
    && [undefined, 'rotating', 'none'].includes(value.refreshTokenRotation) && deadline(value.expiresAt) && deadline(value.refreshExpiresAt) ? value : null
}
export class NovaApi {
  constructor({ fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) { this.fetchImpl = fetchImpl; this.timeoutMs = timeoutMs }
  async request(path, { body, token, signal } = {}) {
    if (!path.startsWith(PREFIX + '/') || path.includes('..') || path.includes('?')) throw new NovaError('INVALID_REQUEST')
    const headers = { accept: 'application/json' }
    if (token) headers.authorization = `Bearer ${token}`
    if (body !== undefined) headers['content-type'] = 'application/json'
    let response
    try {
      response = await this.fetchImpl(ORIGIN + path, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]) : AbortSignal.timeout(this.timeoutMs) })
    } catch { throw new NovaError('NETWORK_ERROR') }
    if (response.status === 401) throw new NovaError('AUTH_REQUIRED')
    if (response.status === 403) throw new NovaError('PERMISSION_DENIED')
    if (!response.ok) throw new NovaError('PLATFORM_ERROR')
    try {
      const reader = response.body.getReader(); const chunks = []; let size = 0
      try {
        while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 2 * 1024 * 1024) throw new Error(); chunks.push(value) }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (data.code !== 0 || !Object.hasOwn(data, 'data')) throw new Error()
      return data.data
    } catch { throw new NovaError('INVALID_RESPONSE') }
  }
}

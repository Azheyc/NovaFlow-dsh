/** Native welcome adapter for the bundled NovaFlow plugin's owner-authenticated API. */
import type { AccountView, SignInAttemptId } from '@deepseek-ai/dsh-deepseek-account/types'
import type { DesktopAccountBackend } from './account-backend.ts'
import type { DesktopAccountView } from './welcome-api.ts'

const PLATFORM = 'https://www.ycnovaflow.vip'
const phases = {
  starting: 'initializing', waiting: 'waiting-browser', exchanging: 'exchanging',
  succeeded: 'succeeded', cancelled: 'cancelled', expired: 'expired', failed: 'failed',
} as const

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Decode only presentation fields; never forward plugin payloads or device credentials. */
function project(value: unknown): DesktopAccountView {
  if (!record(value) || typeof value.connected !== 'boolean' || typeof value.hasCredential !== 'boolean'
    || (value.error !== null && typeof value.error !== 'string')) throw new Error('NovaFlow: invalid account state')
  const requiresSignOut = value.hasCredential && !value.connected && value.error === 'AUTH_REQUIRED'
  let attempt: AccountView['attempt'] = null
  if (value.attempt !== null) {
    const a = value.attempt
    if (!record(a) || typeof a.id !== 'string' || typeof a.phase !== 'string' || !Object.hasOwn(phases, a.phase)
      || typeof a.expiresAt !== 'number' || !Number.isFinite(a.expiresAt)) throw new Error('NovaFlow: invalid login attempt')
    let authorizeUrl: string | undefined
    if (a.authorizeUrl !== undefined) {
      if (typeof a.authorizeUrl !== 'string') throw new Error('NovaFlow: invalid authorization URL')
      const url = new URL(a.authorizeUrl)
      if (url.origin !== PLATFORM || url.pathname !== '/desktop/authorize' || url.username || url.password || url.hash
        || [...url.searchParams.keys()].some(key => key !== 'request') || url.searchParams.getAll('request').length !== 1
        || !url.searchParams.get('request')) throw new Error('NovaFlow: invalid authorization URL')
      authorizeUrl = url.href
    }
    const phase = phases[a.phase as keyof typeof phases]
    attempt = {
      id: a.id as SignInAttemptId,
      phase: phase === 'succeeded' && !value.connected ? 'failed' : phase,
      expiresAt: a.expiresAt,
      ...(authorizeUrl === undefined ? {} : { authorizeUrl }),
    }
  }
  if (!value.connected && value.hasCredential && (attempt === null || attempt.phase === 'succeeded')) {
    attempt = { id: 'novaflow-restore' as SignInAttemptId, phase: 'failed' }
  }
  return { status: value.connected ? 'credential-stored' : 'signed-out', requiresSignOut,
    links: { usageUrl: `${PLATFORM}/dashboard`, topUpUrl: `${PLATFORM}/wallet` }, attempt }
}

/**
 * Share NovaFlow login, restoration, cancellation and logout with the in-app plugin.
 * @param origin - Authenticated local Host origin.
 * @param cookie - Main-process-only Host authentication cookie.
 * @param send - HTTP transport, injectable for local protocol tests.
 * @param analyticsPolicy - Live Host collection policy; omitted readers disable native collection.
 * @returns Safe state and actions; watch owns one serial polling loop and aborts it on disposal.
 */
export function novaFlowAccountBackend(
  origin: string, cookie: string, send: (input: string, init?: RequestInit) => Promise<Response> = fetch,
  analyticsPolicy: () => Promise<boolean> = () => Promise.resolve(false),
): DesktopAccountBackend {
  let revision = 0
  const call = async (action: string, attemptId?: SignInAttemptId, signal?: AbortSignal): Promise<unknown> => {
    const response = await send(new URL('/api/novaflow-account', origin).href, {
      method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ action, ...(attemptId === undefined ? {} : { attemptId }) }),
      signal: signal === undefined ? AbortSignal.timeout(30_000) : AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    })
    if (!response.ok) throw new Error('NovaFlow: account operation failed')
    const envelope: unknown = await response.json()
    if (!record(envelope) || envelope.ok !== true) throw new Error('NovaFlow: account operation failed')
    return envelope.value
  }
  const mutate = async (action: string, id?: SignInAttemptId): Promise<DesktopAccountView> => {
    revision++
    try { return project(await call(action, id)) }
    finally { revision++ }
  }
  return {
    state: async () => project(await call('state')),
    async start() {
      const raw = await call('state')
      const state = project(raw)
      if (state.requiresSignOut || state.status === 'credential-stored') return state
      if (record(raw) && raw.hasCredential === true) return mutate('refresh')
      return mutate('start')
    },
    cancel: id => mutate('cancel', id),
    signOut: () => mutate('signout'),
    watch(listener, failed, _expired, onAnalyticsEnabledChanged) {
      const controller = new AbortController()
      let timer: ReturnType<typeof setTimeout> | undefined
      let previousJson: string | undefined
      const poll = async (): Promise<void> => {
        const current = revision
        const policy = onAnalyticsEnabledChanged === undefined ? undefined : analyticsPolicy().then((enabled) => {
          if (!controller.signal.aborted) onAnalyticsEnabledChanged(enabled)
        }).catch((_error: unknown) => {
          if (!controller.signal.aborted) onAnalyticsEnabledChanged(false)
        })
        try {
          const next = project(await call('state', undefined, controller.signal))
          if (controller.signal.aborted || current !== revision) return
          const json = JSON.stringify(next)
          if (json !== previousJson) {
            previousJson = json
            listener(next)
          }
        } catch (_error) {
          // Transport failures do not sign out the user or expose response diagnostics.
          if (!controller.signal.aborted) failed()
        } finally {
          await policy
          if (!controller.signal.aborted) timer = setTimeout(() => { void poll() }, 1000)
        }
      }
      void poll()
      return () => { controller.abort(); clearTimeout(timer); onAnalyticsEnabledChanged?.(false) }
    },
  }
}

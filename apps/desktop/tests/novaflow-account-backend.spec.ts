/** Desktop onboarding consumes the plugin's account state without exposing grants. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { novaFlowAccountBackend } from '../src/novaflow-account-backend.ts'
import type { DesktopAccountView } from '../src/welcome-api.ts'
import type { SignInAttemptId } from '@deepseek-ai/dsh-deepseek-account/types'

const client = { version: '0.2.2-rc.3', locale: 'en', timezoneOffsetSeconds: 0 } as const
const signedOut = { connected: false, hasCredential: false, error: null, attempt: null }
const waiting = { ...signedOut, attempt: { id: 'attempt', phase: 'waiting', expiresAt: 600_000,
  authorizeUrl: 'https://www.ycnovaflow.vip/desktop/authorize?request=test' } }
function fixture() {
  let value: unknown = signedOut
  const actions: string[] = []
  const send = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(init!.body as string) as { action: string }
    actions.push(body.action)
    return Response.json({ ok: true, value })
  })
  return { send, actions, set: (next: unknown) => { value = next },
    backend: novaFlowAccountBackend('http://127.0.0.1:3080', 'owner-cookie', send) }
}
afterEach(() => { vi.useRealTimers() })

describe('NovaFlow native account adapter', () => {
  it('tracks the live collection policy and disables collection on policy failure and disposal', async () => {
    vi.useFakeTimers()
    const f = fixture()
    const policy = vi.fn(async () => true)
    const changed = vi.fn()
    const backend = novaFlowAccountBackend('http://127.0.0.1:3080', 'cookie', f.send, policy)
    const stop = backend.watch(() => {}, () => {}, () => {}, changed)
    await vi.advanceTimersByTimeAsync(0)
    expect(changed).toHaveBeenLastCalledWith(true)
    policy.mockRejectedValueOnce(new Error('offline'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(changed).toHaveBeenLastCalledWith(false)
    stop()
    expect(changed).toHaveBeenLastCalledWith(false)
  })
  it('uses the owner API and only projects safe fields, including authorization destinations', async () => {
    const f = fixture()
    f.set({ ...waiting, accessToken: 'secret', refreshToken: 'secret', account: { private: 'secret' } })
    const state = await f.backend.state()
    expect(state.attempt).toMatchObject({ phase: 'waiting-browser', authorizeUrl: waiting.attempt.authorizeUrl })
    expect(JSON.stringify(state)).not.toContain('secret')
    expect(f.send.mock.calls[0]).toMatchObject(['http://127.0.0.1:3080/api/novaflow-account', {
      headers: { cookie: 'owner-cookie', 'content-type': 'application/json' }, redirect: 'error', body: '{"action":"state"}',
    }])
  })
  it.each(['https://evil.test/desktop/authorize?request=test', 'https://www.ycnovaflow.vip/dashboard',
    'https://www.ycnovaflow.vip/desktop/authorize?request=test&token=secret'])('rejects an untrusted login destination %s', async (authorizeUrl) => {
    const f = fixture()
    f.set({ ...waiting, attempt: { ...waiting.attempt, authorizeUrl } })
    await expect(f.backend.state()).rejects.toThrow('authorization URL')
  })
  it('starts through the same plugin and forwards the exact cancellation attempt', async () => {
    const f = fixture()
    await f.backend.start(client)
    expect(f.actions).toEqual(['state', 'start'])
    await f.backend.cancel('current-attempt' as SignInAttemptId)
    expect(f.send.mock.calls.at(-1)![1]!.body).toBe('{"action":"cancel","attemptId":"current-attempt"}')
  })
  it('requires an explicit sign-out for an unusable stored grant; retry does not replay it', async () => {
    const f = fixture()
    f.set({ ...signedOut, hasCredential: true, error: 'AUTH_REQUIRED' })
    expect(await f.backend.start(client)).toMatchObject({ requiresSignOut: true, status: 'signed-out', attempt: { phase: 'failed' } })
    expect(f.actions).toEqual(['state'])
    await f.backend.signOut(client)
    expect(f.actions).toEqual(['state', 'signout'])
  })
  it('retries model synchronization using the saved grant without creating another login', async () => {
    const f = fixture()
    f.set({ ...signedOut, hasCredential: true, error: 'NETWORK_ERROR', attempt: { ...waiting.attempt, phase: 'succeeded' } })
    expect(await f.backend.start(client)).toMatchObject({ status: 'signed-out', attempt: { phase: 'failed' } })
    expect(f.actions).toEqual(['state', 'refresh'])
  })
  it('projects cleared authorization as the first-time login state', async () => {
    const f = fixture()
    f.set({ ...signedOut, hasCredential: false, error: null })
    expect(await f.backend.state()).toMatchObject({ requiresSignOut: false, status: 'signed-out', attempt: null })
    expect(f.actions).toEqual(['state'])
  })
  it('only enters the connected state after the plugin confirms model configuration', async () => {
    const f = fixture()
    f.set({ ...signedOut, hasCredential: true, attempt: { ...waiting.attempt, phase: 'succeeded' } })
    expect(await f.backend.state()).toMatchObject({ status: 'signed-out', attempt: { phase: 'failed' } })
    f.set({ ...signedOut, connected: true, hasCredential: true, attempt: { ...waiting.attempt, phase: 'succeeded' } })
    expect(await f.backend.state()).toMatchObject({ status: 'credential-stored', attempt: { phase: 'succeeded' } })
  })
  it('observes sign-out without an expiry notice, keeps state on transport failure, and stops on disposal', async () => {
    vi.useFakeTimers()
    const f = fixture()
    const received: DesktopAccountView[] = []
    const failed = vi.fn(), expired = vi.fn()
    const stop = f.backend.watch(state => received.push(state), failed, expired)
    await vi.advanceTimersByTimeAsync(0)
    f.set({ ...signedOut, connected: true, hasCredential: true })
    await vi.advanceTimersByTimeAsync(1000)
    f.send.mockRejectedValueOnce(new Error('private details'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(received.at(-1)!.status).toBe('credential-stored')
    expect(failed).toHaveBeenCalledOnce()
    f.set({ ...signedOut, hasCredential: true, error: 'AUTH_REQUIRED' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(expired).not.toHaveBeenCalled()
    stop()
    const calls = f.send.mock.calls.length
    await vi.advanceTimersByTimeAsync(5000)
    expect(f.send).toHaveBeenCalledTimes(calls)
  })
})

import { ORIGIN, PREFIX, RECORD, NovaError, safeCode, nonce, challenge, equalSecret, callbackOrigin, authorizationUrl, tokenPair, storedGrant } from './protocol.js'
import { mediaModels } from './media-service.js'
import { parseBalance } from './balance.js'

/** Owns the saved account grant, without hardware binding. UI snapshots never contain tokens or PKCE secrets. */
export class NovaAccount {
  constructor({ credentials, api, origin, onState = () => {}, onCatalog = async () => [], onClear = async () => {}, now = Date.now }) {
    Object.assign(this, { credentials, api, origin, onState, onCatalog, onClear, now })
    this.state = { connected: false, hasCredential: false, account: null, models: [], attempt: null, balance: null, error: null, warning: null, revision: 0 }
    this.generation = 0; this.pending = null; this.disposed = false; this.refreshing = null; this.rotation = null
    this.controller = new AbortController()
    this.balanceRefreshing = null; this.balanceController = null; this.signingOut = false
  }
  publish(patch) { this.state = { ...this.state, ...patch, revision: this.state.revision + 1 }; this.onState(this.state); return this.snapshot() }
  snapshot() { return structuredClone({ ...this.state, mediaModels:this.state.connected ? this.state.mediaModels || [] : [] }) }
  async initialize() {
    const record = await this.credentials.readRecord(RECORD)
    const grant = storedGrant(record)
    const generation = this.generation
    if (grant) this.publish({hasCredential:true})
    if (grant) {
      try { await this.refresh() }
      catch (error) {
        if (!this.disposed && generation === this.generation && safeCode(error) !== 'CANCELLED') await this.clearSavedAuthorization()
      }
    }
    else if (record) await this.clearSavedAuthorization()
    return this.snapshot()
  }
  /** Return to first-time sign-in after failed validation, keeping native model settings. */
  async clearSavedAuthorization() {
    this.cancel(); this.generation++; this.resetBalance()
    await this.credentials.deleteRecord(RECORD)
    let warning = null
    try { await this.onClear() } catch { warning = 'MODEL_CLEANUP_FAILED' }
    this.publish({ connected: false, hasCredential: false, account: null, models: [], balance: null, attempt: null, error: null, warning })
  }
  assertActive() { if (this.disposed) throw new NovaError('CANCELLED'); if (this.signingOut) throw new NovaError('AUTH_REQUIRED') }
  async start() {
    this.assertActive()
    if (this.state.connected || storedGrant(await this.credentials.readRecord(RECORD))) throw new NovaError('SIGNOUT_REQUIRED')
    this.cancel()
    const id = nonce(), verifier = nonce(), state = nonce()
    const attempt = { id, verifier, state, redirectUri: callbackOrigin(this.origin) + '/novaflow/callback', deadline: this.now() + 600000, claimed: false }
    this.pending = attempt
    this.publish({ attempt: { id, phase: 'starting', expiresAt: attempt.deadline }, error: null, warning: null })
    try {
      const data = await this.api.request(PREFIX + '/desktop/auth/start', { body: { client_id: 'novaflow-creator', code_challenge: challenge(verifier), code_challenge_method: 'S256', state, redirect_uri: attempt.redirectUri, device_name: 'NovaFlow Desktop' }, signal: this.controller.signal })
      if (this.pending !== attempt || this.disposed) throw new NovaError('CANCELLED')
      if (typeof data?.request_id !== 'string' || !data.request_id || !Number.isFinite(data.expires_in) || data.expires_in <= 0 || data.expires_in > 600) throw new NovaError('INVALID_RESPONSE')
      const authorizeUrl = authorizationUrl(data.authorize_url, data.request_id)
      attempt.deadline = Math.min(attempt.deadline, this.now() + data.expires_in * 1000)
      this.timer = setTimeout(() => { if (this.pending === attempt) { this.pending = null; this.publish({ attempt: { id, phase: 'expired', expiresAt: attempt.deadline }, error: 'LOGIN_EXPIRED' }) } }, Math.max(0, attempt.deadline - this.now()))
      this.timer.unref?.()
      return this.publish({ attempt: { id, phase: 'waiting', authorizeUrl, expiresAt: attempt.deadline } })
    } catch (error) {
      if (this.pending === attempt) { this.pending = null; this.publish({ attempt: { id, phase: 'failed', expiresAt: attempt.deadline }, error: safeCode(error) }) }
      throw error
    }
  }
  cancel(id) {
    if (id && this.pending?.id !== id) return this.snapshot()
    const attempt = this.pending; this.pending = null; clearTimeout(this.timer)
    if (attempt) this.publish({ attempt: { id: attempt.id, phase: 'cancelled', expiresAt: attempt.deadline }, error: null })
    return this.snapshot()
  }
  async callback(url) {
    const a = this.pending
    if (!a || this.disposed || a.claimed || this.now() >= a.deadline) throw new NovaError('LOGIN_EXPIRED')
    if (url.username || url.password || url.hash || url.origin !== callbackOrigin(this.origin) || url.pathname !== '/novaflow/callback' || [...url.searchParams.keys()].some(k => !['code','state','iss'].includes(k)) || ['code','state','iss'].some(k => url.searchParams.getAll(k).length !== 1) || !equalSecret(url.searchParams.get('state'), a.state) || url.searchParams.get('iss') !== ORIGIN || !/^nfdc_[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('code') || '')) throw new NovaError('INVALID_CALLBACK')
    a.claimed = true
    this.publish({ attempt: { id: a.id, phase: 'exchanging', expiresAt: a.deadline } })
    let grant
    try {
      grant = tokenPair(await this.api.request(PREFIX + '/desktop/auth/exchange', { body: { code: url.searchParams.get('code'), code_verifier: a.verifier, redirect_uri: a.redirectUri }, signal: this.controller.signal }), this.now())
      const bootstrap = await this.api.request(PREFIX + '/creator/bootstrap', { token: grant.accessToken, signal: this.controller.signal })
      const account = this.accountView(bootstrap)
      if (this.pending !== a || this.disposed || this.now() >= a.deadline) throw new NovaError('CANCELLED')
      await this.credentials.modifyRecord(RECORD, async current => {
        if (this.pending !== a || this.disposed || this.now() >= a.deadline || storedGrant(current)) throw new NovaError('CANCELLED')
        return { kind: 'grant', payload: grant }
      })
      // Cancellation during the credential write cannot restore a cancelled login.
      if (this.pending !== a || this.disposed) {
        await this.credentials.modifyRecord(RECORD, async current => storedGrant(current)?.sessionId === grant.sessionId ? {kind:'grant',payload:null} : undefined)
        throw new NovaError('CANCELLED')
      }
      this.pending = null; clearTimeout(this.timer); this.generation++
      const committedGeneration = this.generation
      this.publish({ connected: false, hasCredential: true, account, error: null, attempt: { id: a.id, phase: 'exchanging', expiresAt: a.deadline } })
      try { await this.refresh(true, { resetModels: true }) } catch (error) { if (committedGeneration === this.generation && !this.disposed) this.publish({ error: safeCode(error) }) }
      if (committedGeneration === this.generation && !this.disposed) this.publish({ attempt: { id: a.id, phase: 'succeeded', expiresAt: a.deadline } })
      return this.snapshot()
    } catch (error) {
      if (grant) await this.revoke(grant).catch(() => {})
      if (this.pending === a) { this.pending = null; clearTimeout(this.timer); this.publish({ attempt: { id: a.id, phase: 'failed', expiresAt: a.deadline }, error: safeCode(error) }) }
      throw error
    }
  }
  accountView(data) {
    if (!data || typeof data.display_name !== 'string' || typeof data.identity_scope !== 'string' || !Number.isInteger(data.user_id)) throw new NovaError('INVALID_RESPONSE')
    return { displayName: data.display_name, role: data.identity_scope }
  }
  async accessToken() {
    this.assertActive()
    if (this.rotation) return this.rotation
    const work = this.resolveToken()
    this.rotation = work
    try { return await work } finally { if (this.rotation === work) this.rotation = null }
  }
  async resolveToken() {
    let selected, owner = nonce()
    const usable = grant => grant.expiresAt === null || grant.expiresAt > this.now() + 60000
    await this.credentials.modifyRecord(RECORD, async current => {
      const grant = storedGrant(current)
      if (!grant || grant.refreshPending === 'rejected') throw new NovaError('AUTH_REQUIRED')
      selected = grant
      if (usable(grant) || grant.refreshPending || grant.refreshTokenRotation === 'none') return undefined
      return { kind: 'grant', payload: { ...grant, refreshPending: owner } }
    })
    if (usable(selected)) return selected.accessToken
    // Old rotating grants with an uncertain outcome use a separate server recovery
    // operation. Never replay their one-use token against the legacy refresh route.
    const restoring = !!selected.refreshPending
    let pair
    try {
      pair = tokenPair(await this.api.request(PREFIX + (restoring ? '/desktop/auth/restore' : '/desktop/auth/refresh'), {
        body: { refresh_token: selected.refreshToken, ...(restoring ? { session_id: selected.sessionId } : {}) }, signal: this.controller.signal,
      }), this.now())
    } catch (error) {
      if (restoring && safeCode(error) !== 'AUTH_REQUIRED') throw new NovaError('REFRESH_UNCERTAIN')
      throw error
    }
    if (pair.sessionId !== selected.sessionId) throw new NovaError('INVALID_RESPONSE')
    if ((restoring && (pair.refreshTokenRotation !== 'none' || pair.refreshExpiresAt !== null))
      || (selected.refreshTokenRotation === 'none' && (pair.refreshTokenRotation !== 'none' || pair.refreshToken !== selected.refreshToken))) throw new NovaError('INVALID_RESPONSE')
    let committed = false
    await this.credentials.modifyRecord(RECORD, async current => {
      const grant = storedGrant(current)
      const marker = restoring ? selected.refreshPending : selected.refreshTokenRotation === 'none' ? undefined : owner
      if (this.disposed || grant?.sessionId !== selected.sessionId || grant.refreshToken !== selected.refreshToken || grant.refreshPending !== marker) return undefined
      committed = true; return { kind: 'grant', payload: { ...pair, ...(grant.mediaModels ? { mediaModels:grant.mediaModels } : {}) } }
    })
    // Closing a client or losing a local write race must not revoke the saved
    // account session, which may also be in use on another client.
    if (!committed) throw new NovaError('AUTH_REQUIRED')
    return pair.accessToken
  }
  resetBalance() {
    this.balanceController?.abort()
    this.balanceController=null;this.balanceRefreshing=null
  }
  async refreshBalance() {
    this.assertActive()
    if (!this.state.connected) throw new NovaError('AUTH_REQUIRED')
    if (this.balanceRefreshing) return this.balanceRefreshing
    const generation=this.generation,scope=this.state.account?.role,previous=this.state.balance?.data || null
    const controller=new AbortController()
    this.balanceController=controller
    this.publish({balance:{status:'loading',data:previous,error:null,refreshing:true}})
    const work=(async()=>{
      try {
        const token=await this.accessToken()
        if (generation!==this.generation || this.disposed || controller.signal.aborted) throw new NovaError('CANCELLED')
        const raw=await this.api.request(PREFIX+'/plugin/usage',{token,signal:AbortSignal.any([this.controller.signal,controller.signal])})
        const mode=scope==='personal' ? 'personal' : scope?.startsWith('enterprise:') ? 'enterprise' : null
        if (!mode) throw new NovaError('INVALID_RESPONSE')
        const data=parseBalance(raw,mode)
        if (generation===this.generation && !this.disposed && !controller.signal.aborted && this.state.connected && this.state.account?.role===scope) this.publish({balance:{status:'ready',data,error:null,refreshing:false}})
      } catch(error) {
        if (generation===this.generation && !this.disposed && !controller.signal.aborted && this.state.connected && this.state.account?.role===scope) {
          const code=safeCode(error)
          this.publish({balance:{status:code==='BALANCE_UNAVAILABLE' ? 'unavailable' : 'error',data:previous,error:code,refreshing:false}})
        }
      }
      return this.snapshot()
    })()
    this.balanceRefreshing=work
    try { return await work } finally {
      if (this.balanceRefreshing===work) this.balanceRefreshing=null
      if (this.balanceController===controller) this.balanceController=null
    }
  }
  async refresh(selectDefault = false, { resetModels = false } = {}) {
    this.assertActive()
    const generation = this.generation
    const inFlight = this.refreshing
    if (inFlight?.generation === generation) {
      if (!resetModels || inFlight.resetModels) return inFlight.operation
      await inFlight.operation.catch(() => {})
      if (generation !== this.generation) throw new NovaError('CANCELLED')
      return this.refresh(selectDefault, { resetModels })
    }
    const operation = (async () => {
      try {
        const token = await this.accessToken()
        const bootstrap = await this.api.request(PREFIX + '/creator/bootstrap', { token, signal: this.controller.signal })
        const account = this.accountView(bootstrap)
        if (generation !== this.generation || this.disposed) throw new NovaError('CANCELLED')
        // Apply a verified change of account scope even if model discovery subsequently fails.
        if (this.state.account?.role !== account.role) {
          this.resetBalance()
          this.publish({ account, balance: null })
        }
        const catalog = await this.api.request(PREFIX + '/creator/models', { token, signal: this.controller.signal })
        if (generation !== this.generation || this.disposed) throw new NovaError('CANCELLED')
        const models = await this.onCatalog(catalog, selectDefault, { resetModels })
        if (generation !== this.generation || this.disposed) throw new NovaError('CANCELLED')
        this.publish({ connected: true, hasCredential: true, account, models, mediaModels:mediaModels(catalog), error: null })
        // Balance availability must not delay or fail model sign-in/synchronization.
        void this.refreshBalance().catch(()=>{})
        return this.snapshot()
      } catch (error) {
        if (generation === this.generation && !this.disposed) {
          if (safeCode(error) === 'AUTH_REQUIRED') await this.clearSavedAuthorization()
          else this.publish({ error: safeCode(error) })
        }
        throw error
      }
    })()
    const refresh = { generation, resetModels, operation }
    this.refreshing = refresh
    try { return await operation } finally { if (this.refreshing === refresh) this.refreshing = null }
  }
  async rejectToken(token) {
    let rejected = false
    await this.credentials.modifyRecord(RECORD, async current => {
      const grant = storedGrant(current)
      if (!grant || grant.accessToken !== token) return undefined
      rejected = true
      return {kind:'grant',payload:null}
    })
    if (rejected) { this.generation++; this.resetBalance(); this.publish({connected:false,hasCredential:false,account:null,models:[],balance:null,attempt:null,error:null}); await this.onClear() }
  }
  async revoke(grant) { await this.api.request(PREFIX + '/desktop/auth/revoke', { body: {}, token: grant.refreshToken }) }
  async signout() {
    this.assertActive(); this.cancel(); this.generation++; this.signingOut=true; this.resetBalance(); this.publish({balance:null})
    try {
      // Wait for an admitted rotation so revocation uses its latest refresh token.
      if (this.rotation) await this.rotation.catch(() => {})
      const grant = storedGrant(await this.credentials.readRecord(RECORD))
      await this.credentials.deleteRecord(RECORD)
      this.publish({ connected: false, hasCredential: false, account: null, models: [], balance:null, attempt: null, error: null, warning: null })
      try { await this.onClear(true, { removeProfiles: true }) } catch { this.publish({ warning: 'MODEL_CLEANUP_FAILED' }) }
      if (grant) { try { await this.revoke(grant) } catch { this.publish({ warning: this.state.warning ? 'CLEANUP_AND_REVOKE_FAILED' : 'REVOKE_FAILED' }) } }
      return this.snapshot()
    } finally { this.signingOut=false }
  }
  async dispose(waitForWork = true) { this.disposed = true; this.cancel(); this.generation++; this.controller.abort(); if (waitForWork) await Promise.allSettled([this.refreshing?.operation, this.rotation, this.balanceRefreshing]); await this.onClear(false) }
}

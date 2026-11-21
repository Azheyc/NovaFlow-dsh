import Schema from '@deepseek-ai/schemastery'
import { NovaApi, NovaError, safeCode, callbackOrigin } from './src/protocol.js'
import { NovaAccount } from './src/account.js'
import { loadNativeLibraries, createModelBinding } from './src/native-models.js'
import { randomBytes } from 'node:crypto'
import { createMediaService } from './src/media-service.js'
import { createMediaContexts } from './src/media-context.js'
import { createMediaMcp } from './src/media-mcp.js'
import { clientDelivery } from './src/release.js'

export const name = 'novaflow-account'
export const inject = ['credentials', 'connection', 'webServer', 'llm', 'agentDefaultModel', 'tools', 'configEditor', 'mcpManager', 'workingDirectory']
export const Config = Schema.object({
  enableAllCapabilities: Schema.boolean().default(true).description('首次开启图片输入与原生推理档位；Claude采用Anthropic Messages，其他模型采用OpenAI Responses；迁移后保留原生模型编辑'),
  modelsRefreshInterval: Schema.number().min(60000).max(3600000).default(600000).description('账户与模型目录刷新间隔（毫秒）'),
})
const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store, private', 'Referrer-Policy': 'no-referrer' } })
export async function apply(ctx, rawConfig) {
  const config = Config(rawConfig)
  const origin = callbackOrigin(ctx.webServer.getOrigin())
  const libraries = await loadNativeLibraries()
  let binding, media
  const modelStartup = Promise.withResolvers()
  ctx.effect(() => () => modelStartup.resolve())
  const account = new NovaAccount({ credentials: ctx.credentials, api: new NovaApi(), origin, onCatalog: (...args) => binding.update(...args), onClear: (...args) => {media?.clear();return binding?.clear(...args)} })
  binding = await createModelBinding(ctx, account, config, libraries, {whenReady:()=>modelStartup.promise})
  ctx.provide('novaFlowModelTransport', { async fetch(provider, key, input, init) {
    await modelStartup.promise
    return binding.bridge.platformFetch(provider, key, input, init)
  } })
  ctx.provide('novaflowAccount', account)
  ctx.effect(() => () => account.dispose(false))
  media = createMediaService({account,credentials:ctx.credentials,api:new NovaApi(),workspace:ctx.workingDirectory.defaultDirectory})
  ctx.effect(() => () => media.dispose())
  ctx.provide('novaflowImage', { available: media.imageAvailable, generate: media.renderSelectedImage })
  // Canvas jobs reuse the MCP job service; the caller supplies its own trusted storage root.
  ctx.provide('novaflowMedia', {
    async selections() {
      const models = account.snapshot().mediaModels
      const { selected } = await media.preferences(models)
      return Object.fromEntries(Object.entries(selected).map(([kind, choice]) => [kind, models.find(row => row.kind === kind && row.id === choice.id && row.group === choice.group) ?? null]))
    },
    generateImage: (args, workspace, onPrepared) => media.generateImage(args, { workspace, onPrepared }),
    generateVideo: (args, workspace, onPrepared) => media.generateVideo(args, { workspace, onPrepared }),
    result: (id, workspace) => media.generationResult({ id }, { workspace }),
  })
  let mediaKey=(await ctx.credentials.resolve('NOVAFLOW_IMAGE_MCP_KEY'))?.value
  if (!mediaKey) { mediaKey='nfm_'+randomBytes(32).toString('base64url');await ctx.credentials.set('NOVAFLOW_IMAGE_MCP_KEY',mediaKey) }
  const mediaUrl=origin+'/novaflow/novaflow-image/mcp'
  const contexts=createMediaContexts(ctx,mediaUrl)
  ctx.on('mcp-client/call-context',contexts.issue)
  const mediaMcp=createMediaMcp({service:media,origin,key:mediaKey,resolveContext:contexts.take})
  ctx.effect(() => () => mediaMcp.dispose())
  ctx.effect(() => ctx.webServer.register({kind:'exact',path:'/novaflow/novaflow-image/mcp',handler:mediaMcp.handler}))
  ctx.mcpManager.register('novaflow-image',{transport:'streamable-http',url:mediaUrl,headers:{Authorization:'Bearer ${credential:NOVAFLOW_IMAGE_MCP_KEY}'},startupTimeoutMs:15000,toolCallTimeoutMs:60000,closeTimeoutMs:5000})
  // Native profile edits take ConfigEditor's HMR lock. Defer initial synchronization
  // until apply has returned so Loader activation never waits on its own lock.
  const ready = new Promise(resolve => setImmediate(resolve)).then(async()=>{
    const state=await account.initialize()
    return state
  }).catch(error => account.publish({ error: safeCode(error) })).finally(() => modelStartup.resolve())
  const view=async state=>({...state,delivery:clientDelivery(ctx),media:{
    ...(state.connected ? await media.preferences(state.mediaModels) : {owner:null,selected:{}}),
    mcp:ctx.mcpManager.list().find(server=>server.name==='novaflow-image')?.status || {state:'connecting'},
  }})
  async function operation(action, input = {}, user = false) {
    await ready
    if (action === 'state') return view({...account.snapshot(),nativeProviders:binding.summary()})
    if (action === 'set_media_model' && user) {
      await media.setModel(input)
      return view(account.snapshot())
    }
    if (['confirm_plugins', 'dismiss_plugins', 'retry_plugins'].includes(action)) throw new NovaError('UNSUPPORTED_ACTION')
    if (action === 'configure_models' || action === 'migrate_protocols') {
      const configured = action === 'migrate_protocols' ? await binding.migrateProtocols() : await binding.configureAllModels()
      if (account.state.connected) await account.refresh()
      return view({...account.snapshot(),configured,nativeProviders:binding.summary()})
    }
    if (action === 'refresh') return view(await account.refresh())
    if (action === 'refresh_models' && user) return view(await account.refresh(false, { resetModels: true }))
    if (action === 'refresh_balance') return view(await account.refreshBalance())
    if (action === 'signout') return view(await account.signout())
    if (action === 'cancel') {
      if (!account.pending && !account.state.connected && account.state.hasCredential && account.state.attempt?.phase === 'exchanging' && input.attemptId === account.state.attempt.id) return view(await account.signout())
      return view(account.cancel(input.attemptId))
    }
    if (action === 'start' && user) return view(await account.start())
    throw new NovaError('INVALID_REQUEST')
  }
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/novaflow-account', methods: ['POST'], requestBody: 'buffered',
    fetch: async request => {
      // Connection has already authenticated the carrier. Restrict account access to
      // an interactive owner and require JSON, which cannot be submitted by a cross-origin form.
      const admitted = ctx.connection.admit({headers:request.headers})
      if ('rejection' in admitted || admitted.peer.principal.kind !== 'owner' || admitted.peer.interactions !== 'answer') return json({ok:false,error:{code:'FORBIDDEN'}},403)
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ok:false,error:{code:'INVALID_REQUEST'}},415)
      try {
        const text = await request.text()
        if (text.length > 4096) throw new NovaError('INVALID_REQUEST')
        let input; try { input = JSON.parse(text) } catch { throw new NovaError('INVALID_REQUEST') }
        if (!input || typeof input !== 'object' || typeof input.action !== 'string' || Object.keys(input).some(k => !(input.action === 'set_media_model' ? ['action','kind','model','group','owner'] : ['action','attemptId','confirmationId']).includes(k)) || (input.attemptId !== undefined && typeof input.attemptId !== 'string') || (input.confirmationId !== undefined && typeof input.confirmationId !== 'string')) throw new NovaError('INVALID_REQUEST')
        return json({ok:true,value:await operation(input.action,input,true)})
      } catch (error) { return json({ok:false,error:{code:safeCode(error)}},400) }
    },
  }))
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/novaflow/callback',
    handler: async (req,res) => {
      res.setHeader('Cache-Control','no-store, private'); res.setHeader('Referrer-Policy','no-referrer'); res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'"); res.setHeader('Content-Type','text/plain; charset=utf-8')
      if (req.method !== 'GET' || req.headers.host !== new URL(origin).host) { res.writeHead(400); res.end('Invalid NovaFlow callback.'); return }
      try { await ready; await account.callback(new URL(req.url,origin)); res.writeHead(200); res.end('NovaFlow 授权完成。请返回 DeepSeek Harness；可以关闭此页面。\nNovaFlow connected. Return to DeepSeek Harness and close this tab.') }
      catch { res.writeHead(400); res.end('授权未完成、已取消或已过期。请返回 DeepSeek Harness 重新发起登录。\nAuthorization failed or expired. Return to DeepSeek Harness and try again.') }
    },
  }))
  ctx.effect(() => ctx.tools.register({
    name: 'novaflow_account', description: 'Read NovaFlow account/model/balance status, refresh authorized models, cancel a pending login, or sign out. refresh_balance reads the current personal or company wallet and member limits from New API using the existing device authorization; amounts are already denominated in CNY. configure_models uses Anthropic Messages for Claude models and OpenAI Responses for other models, with text/image input and protocol-native reasoning levels; mixed providers are split while native names and removals are preserved. migrate_protocols only applies the one-time family protocol migration while preserving existing image and thinking settings; saved managed configuration can be migrated offline without granting bridge permissions. Signing in and approving authorization are user-only in Account and balance. Never accepts or returns credentials.',
    parameters: {type:'object',properties:{action:{type:'string',enum:['state','refresh','cancel','signout','configure_models','migrate_protocols','refresh_balance']}},required:['action'],additionalProperties:false},
    output: {schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},
    execute: async input => { try { return {ok:true,value:await operation(input?.action)} } catch(error) { return {ok:false,error:{code:safeCode(error)}} } },
  }))
  ctx.effect(() => {
    const timer = setInterval(() => { if (account.state.connected) void account.refresh().catch(() => {}) },config.modelsRefreshInterval)
    timer.unref?.(); return () => clearInterval(timer)
  })
}

import { promises as fs } from 'node:fs'
import { resolve, relative, dirname, extname, isAbsolute, join, sep } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { request as httpsRequest } from 'node:https'
import { Readable } from 'node:stream'
import { imageSize as readRasterSize } from 'image-size'
import { ORIGIN, PREFIX, RECORD, NovaError, catalogGroupDetails, storedGrant } from './protocol.js'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

export const DEFAULT_IMAGE_MODEL = 'gpt-image-2.6'
const IMAGE_LIMIT = 30*1024*1024, VIDEO_LIMIT=512*1024*1024
const bad = code => { throw new NovaError(code) }
const plain = value => value && typeof value==='object' && !Array.isArray(value)
const endpoints = {image:'image-generation', video:'openai-video'}
const videoFailed = new Set(['failed','failure','error','cancelled','canceled'])
const videoCompleted = new Set(['completed','succeeded','success'])
const videoRejected = new Set([400,403,404,422,429])
const videoReasons = [
  [/content.?policy|content.?filter|moderation|safety|敏感|审核|违规/iu, 'CONTENT_REJECTED'],
  [/quota|insufficient.?balance|余额|额度/iu, 'QUOTA_EXCEEDED'],
  [/rate.?limit|too many requests|限流/iu, 'RATE_LIMITED'],
  [/model[_\s-]*(?:not[_\s-]*(?:found|available|supported)|unavailable)|no available channel|无可用渠道|模型不可用/iu, 'MODEL_UNAVAILABLE'],
  [/invalid[_\s-]*(?:argument|parameter|request)|unsupported|尺寸|时长|参数/iu, 'INVALID_PARAMETERS'],
  [/timeout|timed out|超时/iu, 'UPSTREAM_TIMEOUT'],
]

function videoReason(payload, status) {
  const error = payload?.error ?? payload?.data?.error
  const fields = [error?.code, error?.message, error, payload?.code, payload?.message, payload?.fail_reason, payload?.data?.fail_reason]
  const text = fields.filter(value => typeof value === 'string').map(value => value.slice(0, 2048)).join(' ')
  return videoReasons.find(([pattern]) => pattern.test(text))?.[1] ?? {
    400:'INVALID_PARAMETERS', 401:'AUTH_REQUIRED', 403:'MODEL_UNAVAILABLE', 404:'NOT_FOUND',
    422:'INVALID_PARAMETERS', 429:'RATE_LIMITED', 502:'UPSTREAM_UNAVAILABLE', 503:'UPSTREAM_UNAVAILABLE', 504:'UPSTREAM_TIMEOUT',
  }[status]
}

function videoStatus(payload) {
  const value = payload?.status ?? payload?.data?.status
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function canChangeVideoModel(job) {
  return job.kind === 'video' && job.status === 'failed' && (
    !job.submissionStarted || (job.error === 'MEDIA_VIDEO_FAILED' && Boolean(job.remoteId)) ||
    (job.diagnostic?.stage === 'submission' && videoRejected.has(job.diagnostic.httpStatus))
  )
}

function noteVideoFailure(job, stage, code, fields = {}) {
  job.diagnostic = {stage, code, ...fields}
}

function platformRequestId(response) {
  const value = response.headers.get('x-oneapi-request-id')
  return value && /^\d{14}[A-Za-z0-9_-]{8,86}$/.test(value) ? value : undefined
}

export function mediaModels(catalog) {
  const items = catalog?.items
  if (!Array.isArray(items)) bad('INVALID_RESPONSE')
  const groups = catalogGroupDetails(catalog)
  const models = new Map()
  for (const row of items) {
    if (!plain(row) || !Object.hasOwn(endpoints, row.kind) || !Array.isArray(row.supported_endpoint_types) || !row.supported_endpoint_types.includes(endpoints[row.kind])) continue
    if (typeof row.model_id !== 'string' || !row.model_id || typeof row.group_id !== 'string' || !row.group_id) continue
    const capabilities = {}
    for (const key of ['modes','ratios','durations','tiers']) {
      const choices = row.capabilities?.[key]
      if (Array.isArray(choices)) capabilities[key] = choices.filter(value => key === 'durations' ? Number.isSafeInteger(value) : typeof value === 'string')
    }
    const details = groups.get(row.group_id)
    models.set(JSON.stringify([row.kind,row.group_id,row.model_id]), {id:row.model_id,group:row.group_id,groupName:details.name || row.group_id,description:details.description,priceMultiplier:details.ratio,kind:row.kind,endpoints:row.supported_endpoint_types,...(Object.keys(capabilities).length ? { capabilities } : {})})
  }
  return [...models.values()]
}
function matchingModels(models, kind, model, group) {
  return models.filter(row => row.kind === kind && row.id === model && (!group || row.group === group))
}
function effectiveSelections(saved, models) {
  if (saved.image) return saved
  const defaults = matchingModels(models, 'image', DEFAULT_IMAGE_MODEL)
  if (defaults.length !== 1) return saved
  const {id,group} = defaults[0]
  return {...saved,image:{id,group}}
}
const ownerId = grant => createHash('sha256').update(grant.sessionId).digest('hex')
function publicAddress(address) {
  if (address.includes(':')) return /^[23]/.test(address) && !/^2001:(?:db8|0:|10:|20:)/i.test(address) && !address.toLowerCase().includes('ffff:')
  const [a,b]=address.split('.').map(Number)
  return !(a===0 || a===10 || a===127 || a>=224 || (a===169&&b===254) || (a===172&&b>=16&&b<=31) || (a===192&&(b===168||b===0)) || (a===100&&b>=64&&b<=127) || a===198 || a===203)
}
export async function publicURL(value, lookupImpl=lookup) {
  let url;try{url=new URL(value)}catch{bad('MEDIA_URL_INVALID')}
  if(url.protocol!=='https:' || url.username || url.password || url.hash || (url.port && url.port!=='443') || ['localhost'].includes(url.hostname)) bad('MEDIA_URL_INVALID')
  const hostname=url.hostname.replace(/^\[|\]$/g,'')
  let addresses
  try { addresses=isIP(hostname)?[{address:hostname}]:await lookupImpl(hostname,{all:true}) } catch { bad('MEDIA_URL_INVALID') }
  if(!addresses.length || addresses.some(({address})=>!publicAddress(address))) bad('MEDIA_URL_INVALID')
  return url
}
async function bytes(response,limit) {
  if(Number(response.headers.get('content-length'))>limit) { await response.body?.cancel();bad('MEDIA_FILE_TOO_LARGE') }
  const reader=response.body?.getReader();if(!reader)bad('MEDIA_RESPONSE_INVALID')
  const chunks=[];let size=0
  try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>limit)bad('MEDIA_FILE_TOO_LARGE');chunks.push(r.value)}}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
  return Buffer.concat(chunks)
}
const imageType=data=> data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png' : data[0]===255&&data[1]===216 ? 'image/jpeg' : data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP' ? 'image/webp' : /^GIF8[79]a/.test(data.toString('ascii',0,6))?'image/gif':null
const imageExt=type=>({'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','image/gif':'.gif'}[type])

// Adapt Magpie v0.1.4794's draw_tier.go to the NovaFlow Images API.
// Explicit pixels take precedence. The relay accepts size, not the MCP resolution field.
const resolutionEdges = { '1K': 1024, '2K': 2048, '4K': 4096 }
const minimumResultEdges = { ...resolutionEdges, '4K': 3840 }
const pixelSizePattern = /^([1-9]\d*)\s*[x×*]\s*([1-9]\d*)$/i
const modelName = model => model.trim().toLowerCase().split('/').at(-1)
const nanoBanana = model => /^nano-banana(?:$|[-.])/.test(modelName(model))

function imageSize(model, size, resolution) {
  const supplied = size?.normalize('NFKC').trim()
  const pixels = pixelSizePattern.exec(supplied ?? '')
  if (pixels) return `${pixels[1]}x${pixels[2]}`

  const sizeTier = supplied?.toUpperCase()
  const tier = resolution === 'auto' ? undefined : resolution ?? sizeTier
  const shape = Object.hasOwn(resolutionEdges, sizeTier) ? undefined : supplied
  if (!Object.hasOwn(resolutionEdges, tier)) return shape

  const name = modelName(model)
  if (/^(dall-e|gpt-image-1|chatgpt-image)/.test(name)) return shape
  // ZeroCat's Nano Banana Images endpoints accept a tier in size. The
  // native Gemini fields require a different route and provider contract.
  if (nanoBanana(model)) return tier

  const ratio = /^([1-9]\d{0,3})\s*:\s*([1-9]\d{0,3})$/.exec(shape ?? '')
  if (shape && shape.toLowerCase() !== 'auto' && !ratio) return shape
  const [w, h] = ratio ? [Number(ratio[1]), Number(ratio[2])] : [1, 1]
  const gptImage = Number(/^gpt-image-(\d+)/.exec(name)?.[1]) >= 2
  const edge = gptImage ? Math.min(resolutionEdges[tier], 3840) : resolutionEdges[tier]
  const width = edge * w / Math.max(w, h)
  const height = edge * h / Math.max(w, h)
  if (!gptImage) {
    const snap = value => Math.max(16, Math.round(value / 16) * 16)
    return `${snap(width)}x${snap(height)}`
  }
  // Scale GPT Image 2+ to its supported area. Keep aligned pixels within
  // the limits even after rounding at the edge of the valid range.
  const area = width * height
  const target = Math.max(655360, Math.min(8294400, area))
  const scale = Math.min(Math.sqrt(target / area), 3840 / Math.max(width, height))
  const snap = value => Math.max(16, (scale < 1 ? Math.floor : Math.ceil)(value * scale / 16) * 16)
  const x = snap(width)
  const y = snap(height)
  if (Math.max(x, y) > 3 * Math.min(x, y)) bad('INVALID_REQUEST')
  return `${x}x${y}`
}

function imageSizeMatches(size, {width, height}) {
  if (typeof size !== 'string') return undefined
  if (/^\d+x\d+$/.test(size)) return size === `${width}x${height}`
  if (Object.hasOwn(minimumResultEdges,size)) return Math.max(width,height) >= minimumResultEdges[size]
  return undefined
}

// Validate DNS and pin the exact validated address at socket creation. A second
// unguarded fetch resolution would permit DNS rebinding into the Host's LAN.
async function externalFetch(url,{signal},lookupImpl) {
  const target=await publicURL(url,lookupImpl), host=target.hostname.replace(/^\[|\]$/g,'')
  const addresses=isIP(host)?[{address:host,family:isIP(host)}]:await lookupImpl(host,{all:true})
  if(!addresses.length || addresses.some(x=>!publicAddress(x.address)))bad('MEDIA_URL_INVALID')
  const chosen=addresses[0]
  return new Promise((resolve,reject)=>{
    const req=httpsRequest(target,{method:'GET',agent:false,signal,headers:{Accept:'image/*','Accept-Encoding':'identity'},lookup:(_hostname,options,callback)=>{
      const result={address:chosen.address,family:chosen.family || isIP(chosen.address)}
      if(options?.all)callback(null,[result]);else callback(null,result.address,result.family)
    }},res=>{
      try {
        const headers=new Headers();for(const [key,value]of Object.entries(res.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):value)
        const noBody=[204,205,304].includes(res.statusCode)
        if(noBody)res.resume()
        resolve(new Response(noBody?null:Readable.toWeb(res),{status:res.statusCode,headers}))
      }catch{res.destroy();reject(new NovaError('MEDIA_DOWNLOAD_FAILED'))}
    })
    req.on('error',()=>reject(new NovaError('MEDIA_DOWNLOAD_FAILED')));req.end()
  })
}

// Directory authority comes from the Host for this call, never from job JSON.
const jobWorkspace = Symbol('workspace')
async function workspacePaths(directory) {
  if (!isAbsolute(directory)) bad('MEDIA_PATH_INVALID')
  const root = await fs.realpath(directory)
  const within = rel => rel && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel)
  async function safePath(value) {
    if (typeof value !== 'string' || value.includes('\0')) bad('MEDIA_PATH_INVALID')
    const absolute = resolve(directory, value)
    let rel = relative(directory, absolute)
    if (!within(rel)) rel = relative(root, absolute)
    if (!within(rel) || await fs.realpath(root) !== root) bad('MEDIA_PATH_INVALID')
    let current = root
    for (const part of rel.split(sep)) {
      current = join(current, part)
      try {
        if ((await fs.lstat(current)).isSymbolicLink()) bad('MEDIA_PATH_INVALID')
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
    return current
  }
  return { root, safePath }
}
const metadataPath = id => join('.novaflow-media', 'jobs', id + '.json')
const jobKey = (paths, id) => JSON.stringify([paths.root, id])

/** Media execution independent of Magpie application preferences. Persisted job metadata
 * holds only device identity hash, model/group and result paths, never device tokens. */
export function createMediaService({account,credentials,api,workspace,fetchImpl=globalThis.fetch,externalFetchImpl,lookupImpl=lookup,waitMs=18000,timeoutMs=300000}) {
  const jobs=new Map(), running=new Set(), polling=new Map()
  let disposed=false
  const lifecycle=new AbortController()
  let accountLifetime=new AbortController()
  const videoReplacements = new Map()
  async function identity() {
    if(disposed)bad('MEDIA_UNAVAILABLE')
    const grant=storedGrant(await credentials.readRecord(RECORD));if(!grant)bad('AUTH_REQUIRED')
    return ownerId(grant)
  }
  async function ensureIdentity(owner) {if(await identity()!==owner)bad('MEDIA_ACCOUNT_CHANGED')}
  async function catalog() {
    const token=await account.accessToken()
    const data=await api.request(PREFIX+'/creator/models',{token,signal:lifecycle.signal})
    return mediaModels(data)
  }
  async function savedPreferences() {
    const grant = storedGrant(await credentials.readRecord(RECORD))
    return grant ? {owner:ownerId(grant),selected:grant.mediaModels || {}} : {owner:null,selected:{}}
  }
  async function preferences(models) {
    const {owner,selected} = await savedPreferences()
    return {owner,selected:owner ? effectiveSelections(selected,models) : selected}
  }
  async function listModels({kind}={}) {
    if(kind!==undefined&&!Object.hasOwn(endpoints,kind))bad('INVALID_REQUEST')
    const owner = await identity()
    const models = await catalog()
    const prefs = await preferences(models)
    if (prefs.owner !== owner) bad('MEDIA_ACCOUNT_CHANGED')
    return {models:models.filter(row => !kind || row.kind === kind), selected:prefs.selected}
  }
  async function setModel({kind,model,group,owner}) {
    if (!Object.hasOwn(endpoints,kind) || typeof model !== 'string' || !model || typeof group !== 'string' || !group || typeof owner !== 'string') bad('INVALID_REQUEST')
    await ensureIdentity(owner)
    await select(kind,model,group)
    await credentials.modifyRecord(RECORD, async current => {
      const grant = storedGrant(current)
      if (!grant || ownerId(grant) !== owner) bad('MEDIA_ACCOUNT_CHANGED')
      return {kind:'grant',payload:{...grant,mediaModels:{...grant.mediaModels,[kind]:{id:model,group}}}}
    })
  }
  async function select(kind,model,group) {
    const rows=matchingModels(await catalog(),kind,model,group)
    if(!rows.length)bad('MEDIA_MODEL_UNAVAILABLE')
    if(rows.length>1&&!group)bad('MEDIA_GROUP_REQUIRED')
    return rows[0]
  }
  async function download(value,limit,signal) {
    let url=await publicURL(value,lookupImpl)
    for(let count=0;count<4;count++){
      const response=await (externalFetchImpl ? externalFetchImpl(url.href,{redirect:'manual',signal}) : externalFetch(url.href,{signal},lookupImpl))
      if([301,302,303,307,308].includes(response.status)) {const to=response.headers.get('location');await response.body?.cancel();if(!to)bad('MEDIA_DOWNLOAD_FAILED');url=await publicURL(new URL(to,url).href,lookupImpl);continue}
      if(!response.ok){await response.body?.cancel();bad('MEDIA_DOWNLOAD_FAILED')}
      return {data:await bytes(response,limit),type:response.headers.get('content-type')||''}
    }
    bad('MEDIA_DOWNLOAD_FAILED')
  }
  async function reference(value,signal,paths,readAttachment) {
    if(typeof value!=='string'||!value)bad('MEDIA_REFERENCE_INVALID')
    let data
    if(/^https:\/\//.test(value))data=(await download(value,IMAGE_LIMIT,signal)).data
    else {
      const attached = await readAttachment?.(value,signal)
      if (attached) data = Buffer.from(attached)
      else {
        if (value.startsWith('sha256:')) bad('MEDIA_REFERENCE_INVALID')
        const path = await paths.safePath(value)
        try {
          const stat = await fs.stat(path)
          if (!stat.isFile() || stat.size > IMAGE_LIMIT) bad('MEDIA_FILE_TOO_LARGE')
          data = await fs.readFile(path)
        } catch (error) {
          if (error.code === 'ENOENT') bad('MEDIA_REFERENCE_NOT_FOUND')
          throw error
        }
      }
    }
    if(data.length>IMAGE_LIMIT)bad('MEDIA_FILE_TOO_LARGE')
    const type=imageType(data);if(!type)bad('MEDIA_REFERENCE_INVALID')
    return {data,type}
  }
  async function platform(path,{method='GET',body,group,owner,signal,job,stage}={}) {
    if(!/^\/v1\/(?:images\/(?:generations|edits)|videos(?:\/[A-Za-z0-9_-]+(?:\/content)?)?|tasks\/[A-Za-z0-9_-]+(?:\/artifacts(?:\/[A-Za-z0-9_-]+\/content)?)?)$/.test(path))bad('MEDIA_ROUTE_INVALID')
    await ensureIdentity(owner)
    const token=await account.accessToken()
    await ensureIdentity(owner)
    const headers={Authorization:`Bearer ${token}`,'X-NovaFlow-Group':encodeURIComponent(group),accept:'application/json'}
    let requestBody=body
    if(body!==undefined && !(body instanceof FormData)){headers['content-type']='application/json';requestBody=JSON.stringify(body)}
    if(method==='POST'&&job){job.submissionStarted=true;await persist(job)}
    let response
    try{response=await fetchImpl(ORIGIN+path,{method,headers,body:requestBody,redirect:'error',signal})}catch{bad('MEDIA_NETWORK_ERROR')}
    const requestId = platformRequestId(response)
    if (job && method === 'POST' && requestId) job.requestId = requestId
    if (!response.ok && job?.kind === 'video') {
      const payload = await bytes(response, 64 * 1024).then(data => JSON.parse(data.toString('utf8'))).catch(() => undefined)
      const code = response.status === 401 ? 'AUTH_REQUIRED' : response.status === 403 ? 'MEDIA_MODEL_UNAVAILABLE' : 'MEDIA_PLATFORM_ERROR'
      const reason = videoReason(payload, response.status)
      noteVideoFailure(job, stage, code, {httpStatus:response.status, ...(requestId && {requestId}), ...(reason && {reason})})
      if (response.status === 401) await account.rejectToken?.(token)
      bad(code)
    }
    if(response.status===401){await response.body?.cancel();await account.rejectToken?.(token);bad('AUTH_REQUIRED')}
    if(!response.ok){await response.body?.cancel();bad(response.status===403?'MEDIA_MODEL_UNAVAILABLE':'MEDIA_PLATFORM_ERROR')}
    return response
  }
  async function json(response, incomplete = 'MEDIA_RESPONSE_INVALID') {
    let data
    try { data = await bytes(response, 48 * 1024 * 1024) }
    catch (error) { if (error instanceof NovaError) throw error; bad(incomplete) }
    try { return JSON.parse(data.toString('utf8')) }
    catch (error) { bad('MEDIA_RESPONSE_INVALID') }
  }
  async function persist(job) {
    const target=await job[jobWorkspace].safePath(metadataPath(job.id))
    await fs.mkdir(dirname(target),{recursive:true,mode:0o700})
    await writeFileAtomic(target,JSON.stringify(job),{mode:0o600})
  }
  function imageResultInfo(job) {
    const images = job.outputPlan?.filter(output => Object.hasOwn(output,'dimensions') && job.files?.includes(output.path)).map(({path,dimensions}) => {
      if (!dimensions) return {path,width:null,height:null}
      const submittedMatch = imageSizeMatches(job.submittedSize,dimensions)
      const tierMatch = imageSizeMatches(job.requestedResolution,dimensions)
      const sizeMatchesRequest = submittedMatch === false || tierMatch === false ? false : submittedMatch ?? tierMatch
      return {path,...dimensions,...(sizeMatchesRequest !== undefined && {sizeMatchesRequest})}
    }) ?? []
    let sizeWarning
    if (images.some(image=>image.sizeMatchesRequest === false)) {
      sizeWarning = 'The provider returned a different size. The original image was saved without resizing. Report the measured dimensions and do not upscale it to meet the request.'
    } else if (images.some(image=>image.width === null)) {
      sizeWarning = 'Some original image dimensions could not be verified. Report that and keep the original files.'
    }
    return {
      ...(job.submittedSize && {submittedSize:job.submittedSize}),
      ...(job.requestedResolution && {requestedResolution:job.requestedResolution}),
      ...(images.length && {images}),
      ...(sizeWarning && {sizeWarning}),
    }
  }
  const view=job=>({id:job.id,status:job.status,model:job.model,group:job.group,...(job.downgradedSize?{downgradedSize:job.downgradedSize}:{}),...(job.files?{files:job.files}:{}),...(job.requestId?{requestId:job.requestId}:{}),...(job.error?{error:job.error}:{}),
    ...(job.kind === 'image' && imageResultInfo(job)),
    ...(job.kind === 'video' && {
      canChangeModel:canChangeVideoModel(job) && !job.replacementJobId,
      ...(job.retryOf && {retryOf:job.retryOf}),
      ...(job.replacementJobId && {replacementJobId:job.replacementJobId}),
      ...(job.remoteId && {platformTaskId:job.remoteId}),
      ...(job.remoteStatus && {platformStatus:job.remoteStatus}),
      ...(job.progress !== undefined && {progress:job.progress}),
      ...(job.diagnostic && {diagnostic:job.diagnostic}),
    }),
    ...(job.status==='running'?{message:'Generation is running. Call generation_result with this id; do not submit the same request again.'}:job.status==='unknown'?{message:'The submission outcome is unknown and may already be billed. Do not submit it again. Check NovaFlow generation history before deciding what to do.'}:job.status==='failed'&&job.submissionStarted?{message:'The request was submitted but its output could not be completed. Do not retry automatically; check NovaFlow history first.'}:{})})
  async function save(job,data,type,index=0,total=1,dimensions) {
    await ensureIdentity(job.owner)
    let target=job.path || (job.kind==='image'?'generated-images/':'generated-videos/')+job.id+(job.kind==='image'?imageExt(type):'.mp4')
    const extension=job.kind==='image'?imageExt(type):'.mp4'
    if(!extension)bad('MEDIA_RESPONSE_INVALID')
    if(!extname(target))target+=extension
    if(total>1)target=target.slice(0,-extname(target).length)+'-'+(index+1)+extname(target)
    const path=await job[jobWorkspace].safePath(target);await fs.mkdir(dirname(path),{recursive:true})
    const hash=createHash('sha256').update(data).digest('hex')
    const planned=job.outputPlan?.find(entry=>entry.path===path)
    try {
      const existing=await fs.readFile(path)
      if(planned?.sha256===hash && createHash('sha256').update(existing).digest('hex')===hash)return path
      bad('MEDIA_OUTPUT_EXISTS')
    } catch(error){if(error.code!=='ENOENT')throw error}
    job.outputPlan=[...(job.outputPlan || []).filter(entry=>entry.path!==path),{path,sha256:hash,...(dimensions !== undefined && {dimensions})}]
    await persist(job)
    await fs.writeFile(path,data,{flag:'wx',mode:0o600})
    return path
  }
  function imageEntries(payload) {
    const entries=Array.isArray(payload?.data) ? payload.data : plain(payload?.data) ? [payload.data] : null
    if(!Array.isArray(entries)||!entries.length||entries.length>4)bad('MEDIA_RESPONSE_INVALID')
    return entries
  }
  async function readImageResult(entry,signal) {
    let data
    if (typeof entry?.b64_json === 'string' && entry.b64_json) {
      const encoded = entry.b64_json
      const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0
      if (encoded.length % 4 || /[^A-Za-z0-9+/]/.test(encoded.slice(0, encoded.length - padding))) bad('MEDIA_RESPONSE_INVALID')
      if (encoded.length / 4 * 3 - padding > IMAGE_LIMIT) bad('MEDIA_FILE_TOO_LARGE')
      data = Buffer.from(encoded, 'base64')
    } else if (typeof entry?.url === 'string' && entry.url) {
      try { ({data} = await download(entry.url, IMAGE_LIMIT, signal)) }
      catch (error) { if (error instanceof NovaError) throw error; bad('MEDIA_DOWNLOAD_FAILED') }
    } else bad('MEDIA_RESPONSE_INVALID')
    const type = imageType(data)
    if(!type || data.length>IMAGE_LIMIT)bad('MEDIA_RESPONSE_INVALID')
    return {data,type}
  }
  async function imageResults(job,payload,signal) {
    const entries=imageEntries(payload)
    const files=[]
    job.expectedOutputCount=entries.length
    await persist(job)
    for(const [i,entry] of entries.entries()){
      const {data,type}=await readImageResult(entry,signal)
      let dimensions = null
      try {
        const {width,height} = readRasterSize(data)
        if (Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0) dimensions = {width,height}
      } catch (_error) {
        // Preserve the provider's bytes when a compatible variant has no readable dimensions.
      }
      files.push(await save(job,data,type,i,entries.length,dimensions))
    }
    return files
  }
  function imageRequest(args, model) {
    const size = imageSize(model, args.size, args.resolution)
    let prompt = args.prompt
    // This Images contract uses size for the tier; request the shape in text.
    const ratio = /^([1-9]\d{0,3})\s*:\s*([1-9]\d{0,3})$/.exec(args.size?.normalize('NFKC').trim() ?? '')
    if (nanoBanana(model) && Object.hasOwn(resolutionEdges, size) && ratio) {
      prompt += `\n\nOutput aspect ratio: ${ratio[1]}:${ratio[2]}.`
    }
    const body = {model, prompt, stream:false}
    for (const field of ['quality', 'complexity', 'background', 'n']) if (args[field] !== undefined) body[field] = args[field]
    if (size) body.size = size
    if (nanoBanana(model)) body.response_format = 'b64_json'
    return body
  }
  async function imageAvailable() {
    if (disposed || !account.state.connected) return false
    const models = account.state.mediaModels ?? []
    const {owner,selected}=await preferences(models)
    return Boolean(owner && selected.image && matchingModels(models,'image',selected.image.id,selected.image.group).length===1)
  }
  async function renderSelectedImage({prompt,size,resolution,signal:callerSignal}) {
    if(typeof prompt!=='string'||!prompt.trim()||prompt.length>32000)bad('INVALID_REQUEST')
    if (resolution !== undefined && resolution !== 'auto' && !Object.hasOwn(resolutionEdges, resolution)) bad('INVALID_REQUEST')
    const signal=AbortSignal.any([lifecycle.signal,accountLifetime.signal,AbortSignal.timeout(timeoutMs),...(callerSignal?[callerSignal]:[])])
    signal.throwIfAborted()
    const {owner,selected}=await savedPreferences()
    if(!owner)bad('AUTH_REQUIRED')
    const route=await select('image',selected.image?.id ?? DEFAULT_IMAGE_MODEL,selected.image?.group)
    signal.throwIfAborted()
    const body=imageRequest({prompt,size,resolution,n:1},route.id)
    const payload=await json(await platform('/v1/images/generations',{method:'POST',body,group:route.group,owner,signal}))
    const {data,type}=await readImageResult(imageEntries(payload)[0],signal)
    await ensureIdentity(owner)
    signal.throwIfAborted()
    return {buffer:data,ext:imageExt(type)}
  }
  async function runImage(job,args,signal,readAttachment) {
    const references = args.reference_images || []
    const body = imageRequest(args, job.model)
    const size = args.size?.normalize('NFKC').trim()
    const tier = args.resolution ?? size?.toUpperCase()
    if (!pixelSizePattern.test(size ?? '') && Object.hasOwn(resolutionEdges,tier)) job.requestedResolution = tier
    let path = '/v1/images/generations'
    let requestBody = body
    if (references.length) {
      path = '/v1/images/edits'
      const form = new FormData()
      for (const [key, value] of Object.entries(body)) form.set(key, String(value))
      const field = references.length === 1 ? 'image' : 'image[]'
      for (const value of references) {
        const ref = await reference(value, signal, job[jobWorkspace], readAttachment)
        form.append(field, new Blob([ref.data], {type:ref.type}), 'reference' + imageExt(ref.type))
      }
      requestBody = form
    }
    job.submittedSize = body.size
    const response = await platform(path, {method:'POST', body:requestBody, group:job.group, owner:job.owner, signal, job})
    job.files = await imageResults(job, await json(response, 'MEDIA_RESPONSE_INCOMPLETE'), signal)
    job.status = 'completed'
  }
  async function runVideo(job,args,signal,readAttachment) {
    const body={model:job.model,prompt:args.prompt}
    if(args.seconds!==undefined)body.seconds=String(args.seconds)
    if(args.size!==undefined)body.size=args.size
    let requestBody=body
    const refs=[...(args.image?[args.image]:[]),...(args.reference_images||[])]
    if(refs.length){const form=new FormData();for(const [key,value]of Object.entries(body))form.set(key,String(value));for(const [index,value] of refs.entries()){const ref=await reference(value,signal,job[jobWorkspace],readAttachment);form.append(args.image&&index===0?'input_reference':'reference_images[]',new Blob([ref.data],{type:ref.type}),'reference'+imageExt(ref.type))}requestBody=form}
    const response=await platform('/v1/videos',{method:'POST',body:requestBody,group:job.group,owner:job.owner,signal,job,stage:'submission'})
    const payload=await json(response, 'MEDIA_RESPONSE_INCOMPLETE')
    const id=payload?.id || payload?.task_id || payload?.data?.id || payload?.data?.task_id
    if(typeof id!=='string'||!id||!/^[A-Za-z0-9_-]+$/.test(id))bad('MEDIA_VIDEO_JOB_ID_MISSING')
    job.remoteId=id
    updateVideoStatus(job, payload)
    if (videoFailed.has(job.remoteStatus)) await failVideoTask(job,payload,job.requestId,signal)
  }
  function updateVideoStatus(job, payload) {
    const status = videoStatus(payload)
    if (videoFailed.has(status) || videoCompleted.has(status) || ['queued','pending','submitted','running','processing','in_progress'].includes(status)) job.remoteStatus = status
    const progress = payload?.progress ?? payload?.data?.progress
    if (typeof progress === 'number' && Number.isFinite(progress) && progress >= 0 && progress <= 100) job.progress = progress
    return status
  }
  async function failVideoTask(job, payload, requestId, signal) {
    let reason = videoReason(payload)
    if (!reason) {
      // Some OpenAI-compatible adapters publish a generic failure. The platform task exposes its reason.
      try {
        const response = await platform('/v1/tasks/'+job.remoteId, {group:job.group,owner:job.owner,
          signal:AbortSignal.any([signal,AbortSignal.timeout(3000)])})
        const task = JSON.parse((await bytes(response, 64 * 1024)).toString('utf8'))
        reason = videoReason(task)
      } catch {
        // The video endpoint already confirmed failure. An unavailable detail does not change the outcome.
      }
    }
    job.status = 'failed'
    job.error = 'MEDIA_VIDEO_FAILED'
    noteVideoFailure(job,'generation',job.error,{reason:reason ?? 'REASON_UNAVAILABLE', ...(requestId && {requestId})})
  }
  async function execute(job,args,readAttachment) {
    const signal=AbortSignal.any([lifecycle.signal,accountLifetime.signal,AbortSignal.timeout(timeoutMs)])
    try {
      if(job.kind==='image')await runImage(job,args,signal,readAttachment)
      else await runVideo(job,args,signal,readAttachment)
    } catch(error) {
      job.error=error instanceof NovaError?error.code:'MEDIA_GENERATION_FAILED'
      const uncertain = job.kind === 'video'
        ? !videoRejected.has(job.diagnostic?.httpStatus) && job.diagnostic?.httpStatus !== 401
        : ['MEDIA_NETWORK_ERROR','MEDIA_RESPONSE_INCOMPLETE','MEDIA_GENERATION_FAILED'].includes(job.error)
      job.status=job.submissionStarted && uncertain ? 'unknown' : 'failed'
      if(job.kind === 'video' && !job.diagnostic) noteVideoFailure(job,job.submissionStarted?'submission':'preparation',job.error)
    }
    await persist(job)
  }
  async function begin(kind,args,context,paths,previous) {
    paths ??= await workspacePaths(context?.workspace ?? workspace)
    const readAttachment = context?.readAttachment
    if(!plain(args)||typeof args.prompt!=='string'||!args.prompt.trim()||args.prompt.length>32000)bad('INVALID_REQUEST')
    const {resolution} = args
    if (kind === 'image' && resolution !== undefined && resolution !== 'auto' && !Object.hasOwn(resolutionEdges, resolution)) bad('INVALID_REQUEST')
    if(args.model!==undefined&&(typeof args.model!=='string'||!args.model.trim()))bad('MEDIA_MODEL_UNAVAILABLE')
    if(args.group!==undefined&&(typeof args.group!=='string'||!args.group))bad('INVALID_REQUEST')
    if(args.path!==undefined){
      if(typeof args.path!=='string'||!args.path)bad('MEDIA_PATH_INVALID')
      const total=kind==='image'?(args.n || 1):1
      for(let i=0;i<total;i++){
        let target=args.path
        if(!extname(target))target+=kind==='image'?'.png':'.mp4'
        if(total>1)target=target.slice(0,-extname(target).length)+'-'+(i+1)+extname(target)
        const path=await paths.safePath(target)
        try{await fs.lstat(path);bad('MEDIA_OUTPUT_EXISTS')}catch(error){if(error.code!=='ENOENT')throw error}
      }
    }
    if(args.reference_images!==undefined&&(!Array.isArray(args.reference_images)||args.reference_images.length>8||args.reference_images.some(x=>typeof x!=='string')))bad('MEDIA_REFERENCE_INVALID')
    if(kind==='image'&&args.n!==undefined&&(!Number.isInteger(args.n)||args.n<1||args.n>4))bad('INVALID_REQUEST')
    if(kind==='video'&&args.seconds!==undefined&&(!Number.isInteger(args.seconds)||args.seconds<1||args.seconds>60))bad('INVALID_REQUEST')
    const {owner,selected} = await savedPreferences()
    if (!owner) bad('AUTH_REQUIRED')
    const retryOf = args.retry_of
    let choice = selected[kind]
    if (previous) {
      if (previous.owner !== owner || !canChangeVideoModel(previous)) bad('MEDIA_VIDEO_RETRY_UNAVAILABLE')
      if (previous.model === args.model) bad('MEDIA_VIDEO_RETRY_SAME_MODEL')
      choice = undefined
    }
    if (choice && ((args.model && args.model !== choice.id) || (args.group && args.group !== choice.group))) bad('MEDIA_SELECTION_CONFLICT')
    const model = choice?.id || args.model || (kind === 'image' ? DEFAULT_IMAGE_MODEL : null)
    if (!model) bad('VIDEO_MODEL_REQUIRED')
    const group = choice?.group || args.group
    const route = await select(kind,model,group).catch(error => {
      if (kind === 'video' && retryOf === undefined && choice && error instanceof NovaError && error.code === 'MEDIA_MODEL_UNAVAILABLE') return undefined
      throw error
    })
    await ensureIdentity(owner)
    if (previous && !previous.replacementJobId) {
      previous.replacementJobId = randomUUID()
      await persist(previous)
    }
    const job={[jobWorkspace]:paths,id:previous?.replacementJobId ?? randomUUID(),kind,status:'running',model,group:route?.group ?? group,owner,createdAt:Date.now(),...(args.path?{path:args.path}:{}),...(retryOf && {retryOf})}
    if (!route) {
      job.status='failed'; job.error='MEDIA_MODEL_UNAVAILABLE'
      noteVideoFailure(job,'selection',job.error,{reason:'MODEL_UNAVAILABLE'})
    }
    await persist(job);jobs.set(jobKey(paths,job.id),job)
    await context?.onPrepared?.(job.id)
    if (!route) return view(job)
    const work=execute(job,args,readAttachment);running.add(work);work.finally(()=>running.delete(work)).catch(()=>{})
    let timer;await Promise.race([work,new Promise(resolve=>{timer=setTimeout(resolve,waitMs)})]);clearTimeout(timer)
    return view(job)
  }
  async function generateVideo(args, context) {
    if (args?.retry_of === undefined) return begin('video',args,context)
    if (!args.model || !args.group) bad('MEDIA_VIDEO_RETRY_ROUTE_REQUIRED')
    const paths = await workspacePaths(context?.workspace ?? workspace)
    const owner = await identity()
    const key = JSON.stringify([owner, jobKey(paths,args.retry_of)])
    const pending = videoReplacements.get(key)
    if (pending) {
      if (pending.model !== args.model || pending.group !== args.group) bad('MEDIA_VIDEO_RETRY_ALREADY_SUBMITTED')
      return pending.work
    }
    const work = (async () => {
      const previous = await readJob(args.retry_of,paths)
      if (previous.owner !== owner || !canChangeVideoModel(previous)) bad('MEDIA_VIDEO_RETRY_UNAVAILABLE')
      if (previous.replacementJobId) {
        const replacement = await readJob(previous.replacementJobId,paths).catch(error => {
          if (error instanceof NovaError && error.code === 'MEDIA_JOB_NOT_FOUND') return undefined
          throw error
        })
        if (replacement) {
          if (replacement.model !== args.model || replacement.group !== args.group) bad('MEDIA_VIDEO_RETRY_ALREADY_SUBMITTED')
          return view(replacement)
        }
      }
      return begin('video',args,context,paths,previous)
    })()
    videoReplacements.set(key,{model:args.model,group:args.group,work})
    try { return await work } finally { videoReplacements.delete(key) }
  }
  async function readJob(id,paths) {
    if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))bad('MEDIA_JOB_INVALID')
    let job=jobs.get(jobKey(paths,id))
    if(!job){
      let document
      try { document = await fs.readFile(await paths.safePath(metadataPath(id)), 'utf8') }
      catch (error) { if (error?.code === 'ENOENT') bad('MEDIA_JOB_NOT_FOUND'); throw error }
      try { job = JSON.parse(document) }
      catch { bad('MEDIA_JOB_INVALID') }
      if (job?.id !== id) bad('MEDIA_JOB_INVALID')
      job[jobWorkspace] = paths
    }
    await ensureIdentity(job.owner)
    return job
  }
  async function generationResult(id,paths) {
    const job = await readJob(id,paths)
    if (!jobs.has(jobKey(paths,id)) && job.status==='running'&&!job.remoteId){
      let recovered=job.outputPlan?.length===job.expectedOutputCount && job.expectedOutputCount>0
      if(recovered)for(const output of job.outputPlan){try{const data=await fs.readFile(await paths.safePath(output.path));if(createHash('sha256').update(data).digest('hex')!==output.sha256)recovered=false}catch{recovered=false}}
      if(recovered){job.status='completed';job.files=job.outputPlan.map(output=>output.path)}
      else{job.status=job.submissionStarted?'unknown':'failed';job.error='MEDIA_JOB_INTERRUPTED'}
      await persist(job)
    }
    if(job.status!=='running'||!job.remoteId)return view(job)
    const signal=AbortSignal.any([lifecycle.signal,accountLifetime.signal,AbortSignal.timeout(timeoutMs)])
    let stage = 'status'
    delete job.diagnostic
    try {
      const url = '/v1/videos/'+job.remoteId
      const response = await platform(url,{group:job.group,owner:job.owner,signal,job,stage})
      const payload = await json(response, 'MEDIA_RESPONSE_INCOMPLETE')
      const status = updateVideoStatus(job,payload)
      if (videoFailed.has(status)) await failVideoTask(job,payload,platformRequestId(response),signal)
      else if (videoCompleted.has(status)) {
        stage = 'download'
        const content = await platform(url+'/content',{group:job.group,owner:job.owner,signal,job,stage})
        const data = await bytes(content,VIDEO_LIMIT)
        if(!/^(?:video\/|application\/octet-stream)/i.test(content.headers.get('content-type')||'') || data.length<12 || data.toString('ascii',4,8)!=='ftyp') {
          job.status='failed'; job.error='MEDIA_RESPONSE_INVALID'
          const requestId = platformRequestId(content)
          noteVideoFailure(job,stage,job.error,{...(requestId && {requestId})})
        } else {
          job.files=[await save(job,data,'video/mp4')]; job.status='completed'
        }
      }
    } catch (error) {
      const code = error instanceof NovaError ? error.code : stage === 'download' ? 'MEDIA_DOWNLOAD_FAILED' : 'MEDIA_RESPONSE_INVALID'
      if (code === 'MEDIA_ACCOUNT_CHANGED' || code === 'AUTH_REQUIRED' || code === 'MEDIA_UNAVAILABLE') throw error
      if (!job.diagnostic) noteVideoFailure(job,stage,code)
    }
    await ensureIdentity(job.owner)
    jobs.set(jobKey(paths,id),job);await persist(job);return view(job)
  }
  return {imageAvailable,renderSelectedImage,generateImage:(args,context)=>begin('image',args,context),generateVideo,generationResult: async (args,context) => {
    const id=args?.id
    const paths=await workspacePaths(context?.workspace ?? workspace)
    const key=jobKey(paths,id)
    if(polling.has(key))return polling.get(key)
    const work=generationResult(id,paths)
    polling.set(key,work);running.add(work)
    work.finally(()=>{polling.delete(key);running.delete(work)}).catch(()=>{})
    return work
  },listModels,preferences,setModel,clear(){accountLifetime.abort();accountLifetime=new AbortController()},async dispose(){disposed=true;lifecycle.abort();accountLifetime.abort();await Promise.allSettled([...running])}}
}

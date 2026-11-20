import { promises as fs } from 'node:fs'
import { resolve, relative, dirname, extname, isAbsolute, join, sep } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { request as httpsRequest } from 'node:https'
import { Readable } from 'node:stream'
import { ORIGIN, PREFIX, RECORD, NovaError, storedGrant } from './protocol.js'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

export const DEFAULT_IMAGE_MODEL = 'gpt-image-2.6'
const IMAGE_LIMIT = 30*1024*1024, VIDEO_LIMIT=512*1024*1024
const bad = code => { throw new NovaError(code) }
const plain = value => value && typeof value==='object' && !Array.isArray(value)
const endpoints = {image:'image-generation', video:'openai-video'}
export function mediaModels(items) {
  if (!Array.isArray(items)) bad('INVALID_RESPONSE')
  const models = new Map()
  for (const row of items) {
    if (!plain(row) || !Object.hasOwn(endpoints, row.kind) || !Array.isArray(row.supported_endpoint_types) || !row.supported_endpoint_types.includes(endpoints[row.kind])) continue
    if (typeof row.model_id !== 'string' || !row.model_id || typeof row.group_id !== 'string' || !row.group_id) continue
    models.set(JSON.stringify([row.kind,row.group_id,row.model_id]), {id:row.model_id,group:row.group_id,kind:row.kind,endpoints:row.supported_endpoint_types})
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

function downgradedImageSize(size, prompt) {
  const dimensions = /(?<!\d)(\d{2,5})\s*[x×*]\s*(\d{2,5})(?!\d)/gi
  const fourK = /(?<![a-z0-9])(?:4\s*k|uhd|2160p)(?![a-z0-9])/i
  const requested = String(size ?? '').normalize('NFKC').trim()
  const explicit = requested && requested.toLowerCase() !== 'auto'
  const text = prompt.normalize('NFKC')
  const source = explicit && !fourK.test(requested) ? requested : `${requested} ${text}`
  const pixels = Array.from(source.matchAll(dimensions)).find(match =>
    [3840, 4096].includes(Math.max(Number(match[1]), Number(match[2]))))
  if (!pixels && !fourK.test(source)) return undefined

  const ratio = pixels ?? /(?<!\d)(\d{1,2})\s*:\s*(\d{1,2})(?!\d)/.exec(`${requested} ${text}`)
  let width = 16, height = 9
  if (ratio && Number(ratio[1]) > 0 && Number(ratio[2]) > 0) {
    width = Number(ratio[1]); height = Number(ratio[2])
  } else if (/竖[版幅屏向]|portrait|vertical/i.test(source)) {
    width = 9; height = 16
  } else if (/方形|方图|square/i.test(source)) {
    width = height = 1
  }
  const scale = 2048 / Math.max(width, height)
  const edge = value => Math.max(16, Math.round(value * scale / 16) * 16)
  return `${edge(width)}x${edge(height)}`
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
  async function identity() {
    if(disposed)bad('MEDIA_UNAVAILABLE')
    const grant=storedGrant(await credentials.readRecord(RECORD));if(!grant)bad('AUTH_REQUIRED')
    return ownerId(grant)
  }
  async function ensureIdentity(owner) {if(await identity()!==owner)bad('MEDIA_ACCOUNT_CHANGED')}
  async function catalog() {
    const token=await account.accessToken()
    const data=await api.request(PREFIX+'/creator/models',{token,signal:lifecycle.signal})
    return mediaModels(data?.items)
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
  async function platform(path,{method='GET',body,group,owner,signal,job}={}) {
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
    if(response.status===401){await response.body?.cancel();await account.rejectToken?.(token);bad('AUTH_REQUIRED')}
    if(!response.ok){await response.body?.cancel();bad(response.status===403?'MEDIA_MODEL_UNAVAILABLE':'MEDIA_PLATFORM_ERROR')}
    return response
  }
  async function json(response){try{return JSON.parse((await bytes(response,48*1024*1024)).toString('utf8'))}catch(error){if(error instanceof NovaError)throw error;bad('MEDIA_RESPONSE_INVALID')}}
  async function persist(job) {
    const target=await job[jobWorkspace].safePath(metadataPath(job.id))
    await fs.mkdir(dirname(target),{recursive:true,mode:0o700})
    await writeFileAtomic(target,JSON.stringify(job),{mode:0o600})
  }
  const view=job=>({id:job.id,status:job.status,model:job.model,group:job.group,...(job.downgradedSize?{downgradedSize:job.downgradedSize}:{}),...(job.files?{files:job.files}:{}),...(job.error?{error:job.error}:{}),...(job.status==='running'?{message:'Generation is running. Call generation_result with this id; do not submit the same request again.'}:job.status==='unknown'?{message:'The submission outcome is unknown and may already be billed. Do not submit it again. Check NovaFlow generation history before deciding what to do.'}:job.status==='failed'&&job.submissionStarted?{message:'The request was submitted but its output could not be completed. Do not retry automatically; check NovaFlow history first.'}:{})})
  async function save(job,data,type,index=0,total=1) {
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
    job.outputPlan=[...(job.outputPlan || []).filter(entry=>entry.path!==path),{path,sha256:hash}]
    await persist(job)
    await fs.writeFile(path,data,{flag:'wx',mode:0o600})
    return path
  }
  async function imageResults(job,payload,signal) {
    const entries=Array.isArray(payload?.data) ? payload.data : plain(payload?.data) ? [payload.data] : null
    if(!Array.isArray(entries)||!entries.length||entries.length>4)bad('MEDIA_RESPONSE_INVALID')
    const files=[]
    job.expectedOutputCount=entries.length
    await persist(job)
    for(const [i,entry] of entries.entries()){
      let data,type
      if(typeof entry?.b64_json==='string') {if(entry.b64_json.length>IMAGE_LIMIT*1.4)bad('MEDIA_FILE_TOO_LARGE');if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(entry.b64_json))bad('MEDIA_RESPONSE_INVALID');data=Buffer.from(entry.b64_json,'base64');type=imageType(data)}
      else if(typeof entry?.url==='string'){({data}=await download(entry.url,IMAGE_LIMIT,signal));type=imageType(data)}
      else bad('MEDIA_RESPONSE_INVALID')
      if(!type || data.length>IMAGE_LIMIT)bad('MEDIA_RESPONSE_INVALID')
      files.push(await save(job,data,type,i,entries.length))
    }
    return files
  }
  async function runImage(job,args,signal,readAttachment) {
    const references=args.reference_images||[], body={model:job.model,prompt:args.prompt,stream:false}
    for(const field of ['size','quality','background','n']) if(args[field]!==undefined)body[field]=args[field]
    job.downgradedSize = downgradedImageSize(args.size, args.prompt)
    if (job.downgradedSize) body.size = job.downgradedSize
    let payload
    if(references.length){const form=new FormData();for(const [key,value] of Object.entries(body))form.set(key,String(value));for(const value of references){const ref=await reference(value,signal,job[jobWorkspace],readAttachment);form.append('image[]',new Blob([ref.data],{type:ref.type}),'reference'+imageExt(ref.type))}payload=await json(await platform('/v1/images/edits',{method:'POST',body:form,group:job.group,owner:job.owner,signal,job}))}
    else payload=await json(await platform('/v1/images/generations',{method:'POST',body,group:job.group,owner:job.owner,signal,job}))
    job.files=await imageResults(job,payload,signal);job.status='completed'
  }
  async function runVideo(job,args,signal,readAttachment) {
    const body={model:job.model,prompt:args.prompt}
    if(args.seconds!==undefined)body.seconds=String(args.seconds)
    if(args.size!==undefined)body.size=args.size
    let requestBody=body
    const refs=[...(args.image?[args.image]:[]),...(args.reference_images||[])]
    if(refs.length){const form=new FormData();for(const [key,value]of Object.entries(body))form.set(key,String(value));for(const [index,value] of refs.entries()){const ref=await reference(value,signal,job[jobWorkspace],readAttachment);form.append(args.image&&index===0?'input_reference':'reference_images[]',new Blob([ref.data],{type:ref.type}),'reference'+imageExt(ref.type))}requestBody=form}
    const payload=await json(await platform('/v1/videos',{method:'POST',body:requestBody,group:job.group,owner:job.owner,signal,job}))
    const id=payload?.id || payload?.task_id || payload?.data?.id || payload?.data?.task_id
    if(typeof id!=='string'||!id||!/^[A-Za-z0-9_-]+$/.test(id))bad('MEDIA_RESPONSE_INVALID')
    job.remoteId=id;job.status='running'
  }
  async function execute(job,args,readAttachment) {
    const signal=AbortSignal.any([lifecycle.signal,accountLifetime.signal,AbortSignal.timeout(timeoutMs)])
    try{if(job.kind==='image')await runImage(job,args,signal,readAttachment);else await runVideo(job,args,signal,readAttachment)}catch(error){job.error=error instanceof NovaError?error.code:'MEDIA_GENERATION_FAILED';job.status=job.submissionStarted&&['MEDIA_NETWORK_ERROR','MEDIA_GENERATION_FAILED'].includes(job.error)?'unknown':'failed'}
    await persist(job)
  }
  async function begin(kind,args,context) {
    const paths = await workspacePaths(context?.workspace ?? workspace)
    const readAttachment = context?.readAttachment
    if(!plain(args)||typeof args.prompt!=='string'||!args.prompt.trim()||args.prompt.length>32000)bad('INVALID_REQUEST')
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
    const choice = selected[kind]
    if (choice && ((args.model && args.model !== choice.id) || (args.group && args.group !== choice.group))) bad('MEDIA_SELECTION_CONFLICT')
    const model = choice?.id || args.model || (kind === 'image' ? DEFAULT_IMAGE_MODEL : null)
    if (!model) bad('VIDEO_MODEL_REQUIRED')
    const route = await select(kind,model,choice?.group || args.group)
    await ensureIdentity(owner)
    const job={[jobWorkspace]:paths,id:randomUUID(),kind,status:'running',model,group:route.group,owner,createdAt:Date.now(),...(args.path?{path:args.path}:{})}
    await persist(job);jobs.set(jobKey(paths,job.id),job)
    const work=execute(job,args,readAttachment);running.add(work);work.finally(()=>running.delete(work)).catch(()=>{})
    let timer;await Promise.race([work,new Promise(resolve=>{timer=setTimeout(resolve,waitMs)})]);clearTimeout(timer)
    return view(job)
  }
  async function generationResult(id,paths) {
    if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))bad('MEDIA_JOB_INVALID')
    let job=jobs.get(jobKey(paths,id))
    if(!job){try{job=JSON.parse(await fs.readFile(await paths.safePath(metadataPath(id)),'utf8'))}catch{bad('MEDIA_JOB_NOT_FOUND')}
      if (job?.id !== id) bad('MEDIA_JOB_INVALID')
      job[jobWorkspace] = paths
      await ensureIdentity(job.owner)
      if(job.status==='running'&&!job.remoteId){
        let recovered=job.outputPlan?.length===job.expectedOutputCount && job.expectedOutputCount>0
        if(recovered)for(const output of job.outputPlan){try{const data=await fs.readFile(await paths.safePath(output.path));if(createHash('sha256').update(data).digest('hex')!==output.sha256)recovered=false}catch{recovered=false}}
        if(recovered){job.status='completed';job.files=job.outputPlan.map(output=>output.path)}
        else{job.status=job.submissionStarted?'unknown':'failed';job.error='MEDIA_JOB_INTERRUPTED'}
        await persist(job)
      }
    }
    await ensureIdentity(job.owner)
    if(job.status!=='running'||!job.remoteId)return view(job)
    const signal=AbortSignal.any([lifecycle.signal,accountLifetime.signal,AbortSignal.timeout(timeoutMs)])
    const payload=await json(await platform('/v1/videos/'+job.remoteId,{group:job.group,owner:job.owner,signal}))
    const state=payload.status || payload.data?.status
    if(['failed','error','cancelled','canceled'].includes(state)){job.status='failed';job.error='MEDIA_VIDEO_FAILED'}
    else if(['completed','succeeded','success'].includes(state)) {
      const response=await platform('/v1/videos/'+job.remoteId+'/content',{group:job.group,owner:job.owner,signal})
      const data=await bytes(response,VIDEO_LIMIT)
      if(!/^(?:video\/|application\/octet-stream)/i.test(response.headers.get('content-type')||'') || data.length<12 || data.toString('ascii',4,8)!=='ftyp'){job.status='failed';job.error='MEDIA_RESPONSE_INVALID';jobs.set(jobKey(paths,id),job);await persist(job);return view(job)}
      job.files=[await save(job,data,'video/mp4')];job.status='completed'
    }
    jobs.set(jobKey(paths,id),job);await persist(job);return view(job)
  }
  return {generateImage:(args,context)=>begin('image',args,context),generateVideo:(args,context)=>begin('video',args,context),generationResult: async (args,context) => {
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

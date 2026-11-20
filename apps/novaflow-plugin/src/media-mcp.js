import { equalSecret, NovaError } from './protocol.js'

const MCP_PATH = '/novaflow/novaflow-image/mcp'
const BODY_LIMIT = 512 * 1024
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
export const MEDIA_MCP_INSTRUCTIONS = 'NovaFlow media tools use the current NovaFlow account. Omit model and group when generating to use the active selection in NovaFlow Settings > Models. A default image model with one authorized group works without manual selection and appears in list_models as the active image selection. If generation reports a missing, ambiguous, conflicting or unavailable model, ask the user to check Settings > Models. Never silently choose another billing group. generation_result polls the ID returned by an asynchronous generation. Never ask for platform API keys. Relative reference and output paths use the calling session’s working directory. For a chat image, pass its full sha256: attachment ID or its normalized read-only path. Poll jobs in the workspace where they were submitted. If a result is unknown, it may already be billed: do not resubmit automatically and ask the user to check NovaFlow history.'
const string = {type:'string',minLength:1}
const references = {type:'array',items:string}
const properties = {
  prompt:string, model:string, group:string, path:string, reference_images:references,
  size:string, quality:string, background:string,
}
export const MEDIA_MCP_TOOLS = [
  {name:'generate_image',description:'Generate an image with NovaFlow. Use the model and group selected in NovaFlow Settings > Models. Pass the requested output size and aspect ratio. NovaFlow automatically submits 4K output requests at 2K; tell the user the submitted size returned in downgradedSize. Poll a running result with generation_result.',inputSchema:{type:'object',properties:{...properties,n:{type:'integer',minimum:1,maximum:4}},required:['prompt'],additionalProperties:false}},
  {name:'generate_video',description:'Generate a video with NovaFlow. Use the model and group selected in NovaFlow Settings > Models.',inputSchema:{type:'object',properties:{prompt:string,model:string,group:string,image:string,reference_images:references,size:string,seconds:{type:'integer',minimum:1},path:string},required:['prompt'],additionalProperties:false}},
  {name:'generation_result',description:'Read the status and output of a NovaFlow asynchronous image or video generation by its returned ID.',inputSchema:{type:'object',properties:{id:string},required:['id'],additionalProperties:false}},
  {name:'list_models',description:'List the current account’s authorized NovaFlow image or video model IDs and groups, with the active selections from Settings > Models, including the default image selection when available.',inputSchema:{type:'object',properties:{kind:{type:'string',enum:['image','video']}},additionalProperties:false}},
]
const loopback = address => address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
function valid(value,schema) {
  if (schema.type === 'object') return object(value) && (schema.required || []).every(key=>Object.hasOwn(value,key)) && Object.entries(value).every(([key,entry])=>Object.hasOwn(schema.properties,key) && valid(entry,schema.properties[key]))
  if (schema.type === 'array') return Array.isArray(value) && value.every(entry=>valid(entry,schema.items))
  if (schema.type === 'string') return typeof value === 'string' && (!schema.minLength || value.trim().length >= schema.minLength) && (!schema.enum || schema.enum.includes(value))
  if (schema.type === 'integer') return Number.isSafeInteger(value) && (schema.minimum === undefined || value >= schema.minimum) && (schema.maximum === undefined || value <= schema.maximum)
  return false
}
class RequestError extends Error {
  constructor(status,code,rpc=-32600) { super(code);this.status=status;this.code=code;this.rpc=rpc }
}
function reply(res,status,value) {
  if (res.destroyed || res.writableEnded) return
  const headers = {'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}
  if (status === 405) headers.Allow='POST'
  if (value === undefined) {res.writeHead(status,headers);res.end();return}
  res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8'})
  res.end(JSON.stringify(value))
}
function rpcError(res,status,id,code,message) {reply(res,status,{jsonrpc:'2.0',id,error:{code,message}})}
function readBody(req,signal) {
  const length=req.headers['content-length']
  if (length !== undefined && (!/^\d+$/.test(length) || Number(length)>BODY_LIMIT)) {req.resume();return Promise.reject(new RequestError(413,'BODY_TOO_LARGE'))}
  return new Promise((resolve,reject)=>{
    let size=0;const chunks=[]
    const cleanup=()=>{req.removeListener('data',data);req.removeListener('end',end);req.removeListener('error',error);req.removeListener('aborted',closed);signal.removeEventListener('abort',abort)}
    const fail=value=>{cleanup();req.resume();reject(value)}
    const data=chunk=>{size+=chunk.length;if(size>BODY_LIMIT)return fail(new RequestError(413,'BODY_TOO_LARGE'));chunks.push(chunk)}
    const end=()=>{cleanup();resolve(Buffer.concat(chunks).toString('utf8'))}
    const error=()=>fail(new RequestError(400,'INVALID_BODY'))
    const closed=()=>fail(new RequestError(400,'CLIENT_CLOSED'))
    const abort=()=>fail(new RequestError(503,'MEDIA_MCP_DISPOSED'))
    req.on('data',data);req.once('end',end);req.once('error',error);req.once('aborted',closed);signal.addEventListener('abort',abort,{once:true})
    if(signal.aborted)abort()
  })
}
function cancellable(work,signal) {
  if(signal.aborted)return Promise.reject(new RequestError(503,'MEDIA_MCP_DISPOSED'))
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(new RequestError(503,'MEDIA_MCP_DISPOSED'))
    signal.addEventListener('abort',abort,{once:true})
    Promise.resolve(work).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort))
  })
}

/** Stateless Streamable HTTP MCP endpoint. No platform credentials enter this protocol.
 * This implements the standard JSON response mode, verified against the installed
 * MCP client SDK. It needs no optional server-side SDK or per-client sessions.
 */
export function createMediaMcp({service,origin,key,resolveContext}) {
  const local=new URL(origin)
  if(local.protocol!=='http:' || local.hostname!=='127.0.0.1' || !local.port || local.username || local.password || local.search || local.hash || local.pathname!=='/' || typeof key!=='string' || key.length<32 || /\s/.test(key))throw new Error('Invalid media MCP configuration')
  for(const method of ['generateImage','generateVideo','generationResult','listModels'])if(typeof service?.[method]!=='function')throw new Error('Media MCP service unavailable')
  const tools=structuredClone(MEDIA_MCP_TOOLS)
  const active=new Set();let disposed=false
  async function invoke(name,args,signal,meta) {
    const tool=tools.find(tool=>tool.name===name)
    if(!tool)throw new RequestError(200,'UNKNOWN_TOOL',-32602)
    if(!valid(args,tool.inputSchema))throw new RequestError(200,'INVALID_PARAMS',-32602)
    const method={generate_image:'generateImage',generate_video:'generateVideo',generation_result:'generationResult',list_models:'listModels'}[name]
    try {
      const result=await cancellable(Promise.resolve().then(()=>service[method](args,resolveContext?.(name,meta))),signal)
      if(signal.aborted)throw new RequestError(503,'MEDIA_MCP_DISPOSED')
      return {content:[{type:'text',text:JSON.stringify(result)}]}
    } catch(error) {
      if(error instanceof RequestError)throw error
      return {isError:true,content:[{type:'text',text:JSON.stringify({status:'error',code:error instanceof NovaError ? error.code : 'MEDIA_OPERATION_FAILED'})}]}
    }
  }
  async function handler(req,res) {
    let id=null,controller
    const close=()=>{if(!res.writableFinished)controller?.abort()}
    try {
      if(disposed)throw new RequestError(503,'MEDIA_MCP_DISPOSED')
      if(req.headers.host!==local.host || !loopback(req.socket?.remoteAddress) || (req.headers.origin!==undefined && req.headers.origin!==local.origin) || req.headers['sec-fetch-site']==='cross-site')throw new RequestError(403,'FORBIDDEN')
      const supplied=typeof req.headers.authorization==='string'?/^Bearer ([^\s]+)$/i.exec(req.headers.authorization)?.[1]:undefined
      if(!equalSecret(supplied,key))throw new RequestError(401,'UNAUTHORIZED')
      if(req.url!==MCP_PATH)throw new RequestError(404,'NOT_FOUND')
      if(req.method!=='POST')throw new RequestError(405,'METHOD_NOT_ALLOWED')
      if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '') || (req.headers['content-encoding'] && req.headers['content-encoding']!=='identity'))throw new RequestError(415,'UNSUPPORTED_BODY')
      const version=req.headers['mcp-protocol-version']
      if(version!==undefined && (typeof version!=='string' || !PROTOCOLS.includes(version)))throw new RequestError(400,'UNSUPPORTED_PROTOCOL_VERSION')
      controller=new AbortController();active.add(controller);res.once('close',close)
      const text=await readBody(req,controller.signal)
      let message;try{message=JSON.parse(text)}catch{throw new RequestError(400,'PARSE_ERROR',-32700)}
      if(!object(message) || message.jsonrpc!=='2.0' || typeof message.method!=='string' || (Object.hasOwn(message,'id') && typeof message.id!=='string' && !(typeof message.id==='number' && Number.isFinite(message.id))))throw new RequestError(400,'INVALID_REQUEST')
      if(!Object.hasOwn(message,'id')) {
        if(!message.method.startsWith('notifications/'))throw new RequestError(400,'INVALID_REQUEST')
        reply(res,202);return
      }
      id=message.id
      const params=message.params ?? {}
      if(!object(params))throw new RequestError(200,'INVALID_PARAMS',-32602)
      let result
      if(message.method==='initialize') {
        if(typeof params.protocolVersion!=='string' || !object(params.capabilities) || !object(params.clientInfo) || typeof params.clientInfo.name!=='string' || typeof params.clientInfo.version!=='string')throw new RequestError(200,'INVALID_PARAMS',-32602)
        result={protocolVersion:PROTOCOLS.includes(params.protocolVersion)?params.protocolVersion:PROTOCOLS[0],capabilities:{tools:{listChanged:false}},serverInfo:{name:'novaflow-image',version:'1.0.0'},instructions:MEDIA_MCP_INSTRUCTIONS}
      } else if(message.method==='ping')result={}
      else if(message.method==='tools/list')result={tools}
      else if(message.method==='tools/call') {
        if(typeof params.name!=='string')throw new RequestError(200,'INVALID_PARAMS',-32602)
        result=await invoke(params.name,params.arguments ?? {},controller.signal,params._meta)
      } else throw new RequestError(200,'METHOD_NOT_FOUND',-32601)
      reply(res,200,{jsonrpc:'2.0',id,result})
    } catch(error) {
      if(error instanceof RequestError)rpcError(res,error.status,id,error.rpc,error.code)
      else rpcError(res,500,id,-32603,'INTERNAL_ERROR')
    } finally {res.removeListener('close',close);if(controller)active.delete(controller)}
  }
  return {handler,dispose(){disposed=true;for(const controller of active)controller.abort();active.clear()},instructions:MEDIA_MCP_INSTRUCTIONS,tools:structuredClone(tools)}
}

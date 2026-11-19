import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import WorkingDirectory from '@deepseek-ai/dsh-working-directory'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import { defaultWorkspaceDirectory } from '../../../packages/api/workspace-controller/src/default-directory.ts'
// Load the bundled JavaScript plugin the same way a Node Host would.
const requirePlugin = createRequire(new URL('../../novaflow-plugin/index.js', import.meta.url))
const { createMediaContexts } = requirePlugin('./src/media-context.js')
const { createMediaMcp } = requirePlugin('./src/media-mcp.js')
const { createMediaService } = requirePlugin('./src/media-service.js')
const { tokenPair } = requirePlugin('./src/protocol.js')

it('submits files and chat attachments from the calling Agent across default and custom workspaces', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'novaflow-media-workspace-')))
  const ctx = new Context()
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC', 'base64')
  const record = {kind:'grant',payload:tokenPair({token_type:'Bearer', access_token:'nfds_'+'a'.repeat(43), refresh_token:'nfdr_'+'r'.repeat(43), session_id:'nfdev_'+'s'.repeat(43), expires_in:900, refresh_expires_in:2592000})}
  const submissions = new Map<string, Buffer[]>()
  const service = createMediaService({workspace:root, account:{accessToken:async () => record.payload.accessToken}, credentials:{readRecord:async () => record}, api:{request:async () => ({items:[{model_id:'gpt-image-2.6',group_id:'fixture',kind:'image',supported_endpoint_types:['image-generation']}]})},
    fetchImpl: async (url: string, {body}: {body:FormData}) => {
      expect(new URL(url).pathname).toBe('/v1/images/edits')
      const bytes = await Promise.all((body.getAll('image[]') as File[]).map(async image => Buffer.from(await image.arrayBuffer())))
      submissions.set(String(body.get('prompt')), bytes)
      return Response.json({data:[{b64_json:png.toString('base64')}]})
    },
  })
  const server = createServer()
  try {
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(LocalFileSystem,{cwd:root})
    await ctx.plugin(WorkingDirectory,{defaultDirectory:root})
    await ctx.plugin(LocalAttachmentStore,{dshHome:join(root,'store')})
    const harness = await mountAgentLoopTestHarness(ctx)
    const signal = AbortSignal.timeout(15_000)
    const directories = [await defaultWorkspaceDirectory(join(root,'Documents'),signal), join(root,'自选项目')]
    const attachment = await ctx.attachments.saveImage({data:png,mediaType:'image/png',name:'upload.png'})
    const normalized = Buffer.from((await ctx.attachments.readImage(attachment)).data)
    await new Promise<void>(done => server.listen(0,'127.0.0.1',done))
    const address = server.address()
    if (!address || typeof address === 'string') throw Error('Expected a loopback port')
    const origin = `http://127.0.0.1:${address.port}`
    const url = origin+'/novaflow/novaflow-image/mcp'
    const contexts = createMediaContexts(ctx,url)
    ctx.on('mcp-client/call-context',contexts.issue)
    const key = 'k'.repeat(32)
    const mcp = createMediaMcp({service,origin,key,resolveContext:contexts.take})
    ctx.effect(() => () => mcp.dispose())
    server.on('request',mcp.handler)
    await ctx.plugin(McpClient,McpClient.Config({transport:'streamable-http',serverName:'novaflow-image',url,headers:{Authorization:`Bearer ${key}`},failOnStartupError:true}))
    await Promise.all(directories.map(async (cwd,index) => {
      await mkdir(cwd,{recursive:true})
      const local = Buffer.concat([png,Buffer.from(String(index))])
      await writeFile(join(cwd,'reference.png'),local)
      const agent = await harness.create(SessionId(`media-${index}`),{},{cwd})
      agent.session.append('user/message', createUserMessage({content:[{type:'image',attachment}],source:{kind:'user'}}), {surfaceOp:'append'})
      const result = await executeToolFixture(ctx,{agent,signal,callId:ToolCallId(`edit-${index}`),name:'mcp__novaflow-image__generate_image',arguments:{prompt:cwd,reference_images:['reference.png',attachment.attachmentId],path:'result.png'}})
      expect(result.isError).toBe(false)
      expect(submissions.get(cwd)).toEqual([local,normalized])
      expect(await readFile(join(cwd,'result.png'))).toEqual(png)
    }))
  } finally {
    await ctx.fiber.dispose()
    await service.dispose()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    await rm(root,{recursive:true,force:true})
  }
})

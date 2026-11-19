import { isAbsolute, relative } from 'node:path'
import { randomUUID } from 'node:crypto'
import { NovaError } from './protocol.js'

const contextKey = 'novaflow/call-context'

// The wire carries a single-use handle. Only this Host can supply the directory
// and attachment reader, and neither is a model-controlled tool argument.
export function createMediaContexts(ctx, endpoint) {
  const pending = new Map()
  return {
    issue(server, url, tool, execution) {
      const session = execution.agent?.session
      if (server !== 'novaflow-image' || url !== endpoint || !session || tool === 'list_models') return
      const workspace = ctx.workingDirectory.get(session)
      const attachments = ctx.get('attachments')
      let images
      async function readAttachment(value, signal) {
        if (!attachments || (!isAbsolute(value) && !value.startsWith('sha256:'))) return
        images ??= session.deriveMessages().flatMap(message => message.content.filter(block => block.type === 'image').map(block => block.attachment))
        const ref = images.find(image => {
          if (image.attachmentId === value) return true
          const path = attachments.imageHostPath(image)
          if (!path || !isAbsolute(value)) return false
          return relative(path, value) === '' || value === ctx.get('fs')?.processPathFromHostPath(path)
        })
        if (ref) return (await attachments.readImage(ref, signal)).data
      }
      const token = randomUUID()
      pending.set(token, { tool, context: { workspace, readAttachment } })
      return { meta: { [contextKey]: token }, dispose: () => pending.delete(token) }
    },
    take(tool, meta) {
      if (!meta || !Object.hasOwn(meta, contextKey)) return
      const token = meta[contextKey]
      const entry = pending.get(token)
      if (!entry || entry.tool !== tool) throw new NovaError('MEDIA_CONTEXT_INVALID')
      pending.delete(token)
      return entry.context
    },
  }
}

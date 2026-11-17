export const RELEASE_VERSION = '2.6.1'

/** Client graph facts identify the actual revisioned resource this Host serves. */
export function clientDelivery(ctx) {
  const entry=ctx.get('clientModules')?.graph().entries.find(item=>item.id==='@local/novaflow-dsh-plugin')
  return {version:RELEASE_VERSION,clientRevision:entry?.rev || null,clientURL:entry?.url || null}
}

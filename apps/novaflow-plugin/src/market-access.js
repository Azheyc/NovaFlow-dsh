/** The bundled market's Loader row reads this policy before importing the plugin. */
export function createMarketAccess(ctx) {
  let allowed = false
  let settled = Promise.resolve()
  const policy = { get allowed() { return allowed } }
  ctx.provide('novaflowMarketPolicy', policy)
  function set(next) {
    if (next !== allowed) {
      allowed = next
      settled = settled.then(async () => {
        for (const entry of ctx.get('loader')?.entries() ?? []) {
          if (entry.options.name === 'dshmarket' && entry.options.id === 'dsh-market') await entry.update({})
        }
      }).catch(error => ctx.logger?.warn?.('NovaFlow market access update failed: %s', error.message))
    }
    return settled
  }
  return { set }
}

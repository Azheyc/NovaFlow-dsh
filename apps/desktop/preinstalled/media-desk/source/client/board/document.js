const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right)
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)

function merge(base, local, remote) {
  if (equal(base, local) || equal(local, remote)) return remote
  if (equal(base, remote)) return local
  if (record(base) && record(local) && record(remote)) {
    const fields = new Set([...Object.keys(local), ...Object.keys(remote)])
    return Object.fromEntries([...fields].map(key => [key, merge(base[key], local[key], remote[key])]).filter(([, value]) => value !== undefined))
  }
  return remote
}

function recordsById(base, local, remote) {
  const before = new Map(base.map(row => [row.id, row]))
  const edited = new Map(local.map(row => [row.id, row]))
  const received = new Map(remote.map(row => [row.id, row]))
  return [...new Set([...received.keys(), ...edited.keys()])].map(id => merge(before.get(id), edited.get(id), received.get(id))).filter(Boolean)
}

export function canvasDocument(id, request, conflict) {
  let base = null
  let draft = null
  let queue = Promise.resolve()
  let timer
  const listeners = new Set()
  const externalEdits = new Set()
  const notify = () => listeners.forEach(listener => listener())
  const enqueue = task => { const work = queue.then(task); queue = work.catch(() => {}); return work }
  function receive(remote, before = base) {
    if (remote.id !== id || base && remote.revision < base.revision) return
    if (!before || !draft || equal(before, draft)) draft = remote
    else {
      const nodes = recordsById(before.nodes, draft.nodes, remote.nodes)
      const ids = new Set(nodes.map(node => node.id))
      const edges = recordsById(before.edges, draft.edges, remote.edges).filter(edge => ids.has(edge.source) && ids.has(edge.target))
      draft = { ...remote, nodes, edges, viewport: merge(before.viewport, draft.viewport, remote.viewport) }
    }
    base = remote
    notify()
  }
  const read = async () => {
    const next = (await request(`canvas/get?id=${encodeURIComponent(id)}`)).canvas
    const structure = board => [board.nodes.map(({ id, parentId, position, width, height, data }) => [id, parentId, position, width, height, data.label]), board.edges]
    if (base && next.revision > base.revision && !equal(structure(base), structure(next))) for (const listener of externalEdits) listener(draft)
    receive(next)
  }
  async function drain() {
    while (draft && !equal(draft, base)) {
      const local = draft
      try {
        const response = await request('canvas/save', { ...local, revision: base.revision })
        receive(response.canvas, local)
      } catch (error) {
        if (error.code !== 'CANVAS_CONFLICT') throw error
        await read()
        conflict()
      }
    }
  }
  function flush() { clearTimeout(timer); return enqueue(drain) }
  return {
    snapshot: () => draft,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    onRemoteEdit: listener => { externalEdits.add(listener); return () => externalEdits.delete(listener) },
    edit(next, onError) {
      draft = typeof next === 'function' ? next(draft) : next
      notify()
      clearTimeout(timer)
      timer = setTimeout(() => flush().catch(onError), 600)
    },
    refresh: revision => enqueue(() => revision === undefined || !base || revision > base.revision ? read() : undefined),
    replace: remote => enqueue(() => receive(remote)),
    flush,
  }
}

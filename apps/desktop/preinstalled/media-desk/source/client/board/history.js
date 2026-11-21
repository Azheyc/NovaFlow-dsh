// 画布结构的撤销/重做：节点位置、增删、连线。节点里的生成结果不进历史。
const LIMIT = 100

export function createHistory() {
  return { past: [], future: [] }
}

export function snapshot(canvas) {
  return JSON.stringify({ nodes: canvas.nodes, edges: canvas.edges })
}

export function record(history, before) {
  history.past.push(before)
  if (history.past.length > LIMIT) history.past.shift()
  history.future = []
}

export function step(history, canvas, direction) {
  const from = direction === 'undo' ? history.past : history.future
  const to = direction === 'undo' ? history.future : history.past
  const target = from.pop()
  if (!target) return null
  to.push(snapshot(canvas))
  return JSON.parse(target)
}

/** 撤销时保留节点最新的生成结果，只恢复结构。 */
export function restore(canvas, structure) {
  const live = new Map(canvas.nodes.map(node => [node.id, node]))
  return {
    ...canvas,
    nodes: structure.nodes.map(node => {
      const current = live.get(node.id)
      return current ? { ...node, data: { ...node.data, src: current.data.src, history: current.data.history, job: current.data.job, jobRoot: current.data.jobRoot, text: current.data.text } } : node
    }),
    edges: structure.edges,
  }
}

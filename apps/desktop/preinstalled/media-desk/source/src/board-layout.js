// 画布排列：选中节点的水平、垂直、宫格排列，以及按连线分层的整幅整理。
import { NODE_INFO } from './board-schema.js'

const GAP = 48

export function sizeOf(node) {
  const info = NODE_INFO[node.type] ?? NODE_INFO.text
  return { w: node.width ?? info.w, h: node.height ?? info.h }
}

export function boundsOf(nodes) {
  if (!nodes.length) return null
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const node of nodes) {
    const { w, h } = sizeOf(node)
    x1 = Math.min(x1, node.position.x)
    y1 = Math.min(y1, node.position.y)
    x2 = Math.max(x2, node.position.x + w)
    y2 = Math.max(y2, node.position.y + h)
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

export function portPoint(node, side) {
  const { w, h } = sizeOf(node)
  return { x: node.position.x + (side === 'source' ? w : 0), y: node.position.y + h / 2 }
}

// Place new cards near the insertion point without moving anything already on the board.
export function availablePosition(nodes, type, center) {
  const { w, h } = NODE_INFO[type]
  const start = { x: Math.round(center.x - w / 2), y: Math.round(center.y - h / 2) }
  const occupied = nodes.map(node => ({ ...node.position, ...sizeOf(node) }))
  const candidates = [start]
  for (const box of occupied) {
    candidates.push({ x: box.x + box.w + GAP, y: box.y }, { x: box.x - w - GAP, y: box.y },
      { x: box.x, y: box.y + box.h + GAP }, { x: box.x, y: box.y - h - GAP })
  }
  const distance = point => Math.hypot(point.x - start.x, point.y - start.y)
  return candidates.sort((a, b) => distance(a) - distance(b)).find(p => occupied.every(b =>
    p.x >= b.x + b.w + GAP || p.x + w + GAP <= b.x || p.y >= b.y + b.h + GAP || p.y + h + GAP <= b.y))
}

/** 选中节点按左上角起点重新排；返回 id → 新位置。 */
export function arrangeSelection(nodes, mode) {
  const box = boundsOf(nodes)
  if (!box) return {}
  const sorted = [...nodes].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
  const moves = {}
  if (mode === 'horizontal') {
    let x = box.x
    for (const node of [...nodes].sort((a, b) => a.position.x - b.position.x)) {
      moves[node.id] = { x, y: box.y }
      x += sizeOf(node).w + GAP
    }
  } else if (mode === 'vertical') {
    let y = box.y
    for (const node of sorted) {
      moves[node.id] = { x: box.x, y }
      y += sizeOf(node).h + GAP
    }
  } else {
    const columns = Math.ceil(Math.sqrt(nodes.length))
    const cellW = Math.max(...nodes.map(n => sizeOf(n).w)) + GAP
    const cellH = Math.max(...nodes.map(n => sizeOf(n).h)) + GAP
    sorted.forEach((node, index) => {
      moves[node.id] = { x: box.x + (index % columns) * cellW, y: box.y + Math.floor(index / columns) * cellH }
    })
  }
  return moves
}

/** 整幅整理：按连线分层，从左到右；每个连通块单独成行，保持一条流程完整。 */
export function arrangeAll(nodes, edges) {
  const items = nodes.filter(node => node.type !== 'group' && !node.parentId)
  const ids = new Set(items.map(node => node.id))
  const links = edges.filter(edge => ids.has(edge.source) && ids.has(edge.target))
  const parent = new Map(items.map(node => [node.id, node.id]))
  const find = id => (parent.get(id) === id ? id : find(parent.get(id)))
  for (const edge of links) parent.set(find(edge.source), find(edge.target))
  const groups = new Map()
  for (const node of items) {
    const root = find(node.id)
    groups.set(root, [...(groups.get(root) ?? []), node])
  }
  const moves = {}
  let top = boundsOf(items)?.y ?? 0
  const left = boundsOf(items)?.x ?? 0
  for (const group of [...groups.values()].sort((a, b) => b.length - a.length)) {
    const depth = new Map(group.map(node => [node.id, 0]))
    for (let pass = 0; pass < group.length; pass += 1) {
      for (const edge of links) {
        if (depth.has(edge.target) && depth.get(edge.target) <= depth.get(edge.source)) depth.set(edge.target, depth.get(edge.source) + 1)
      }
    }
    const columns = new Map()
    for (const node of group) columns.set(depth.get(node.id), [...(columns.get(depth.get(node.id)) ?? []), node])
    let x = left
    let rowHeight = 0
    for (const level of [...columns.keys()].sort((a, b) => a - b)) {
      let y = top
      const column = columns.get(level)
      for (const node of column) {
        moves[node.id] = { x, y }
        y += sizeOf(node).h + GAP
      }
      rowHeight = Math.max(rowHeight, y - top)
      x += Math.max(...column.map(node => sizeOf(node).w)) + GAP * 2
    }
    top += rowHeight + GAP
  }
  return moves
}

import { PORTS } from '../../src/board-schema.js'

export const VIDEO_IMAGE_USE_KEY = 'novaflow-media-desk:video-image-use'

export function isVideoImageUse(mode) {
  return mode === 'reference' || mode === 'firstFrame'
}

export function allowsVideoMode(imageCount, mode) {
  if (mode === 'text') return imageCount === 0
  if (mode === 'firstFrame') return imageCount <= 1
  return true
}

export function resolveConnection(canvas, source, target, videoModes, preferred) {
  const options = connectionChoices(canvas, source, target, videoModes)
  const use = isVideoImageUse(preferred) ? preferred : 'reference'
  return options.find(edge => edge.targetHandle === use) ?? options[0]
}

// The two visible sockets are directional. Persist the same typed handles the generator and agent use.
export function connectionChoices(canvas, sourceId, targetId, videoModes) {
  const source = canvas.nodes.find(node => node.id === sourceId)
  const target = canvas.nodes.find(node => node.id === targetId)
  if (!source || !target || source === target) return []
  const output = PORTS[source.type].outputs[0]
  if (!output) return []
  const incoming = canvas.edges.filter(edge => edge.target === targetId)
  return PORTS[target.type].inputs.filter(input => {
    if (input.type !== output.type || incoming.some(edge => edge.source === sourceId && edge.targetHandle === input.id)) return false
    if (target.type !== 'videoGen' || input.type !== 'IMAGE') return true
    if (videoModes && !videoModes.includes(input.id)) return false
    if (target.data.mode && target.data.mode !== input.id) return false
    return !incoming.some(edge => edge.targetHandle !== 'prompt' && edge.targetHandle !== input.id)
  }).map(input => ({ source: sourceId, sourceHandle: output.id, target: targetId, targetHandle: input.id }))
}

// Single inputs replace their old edge. For references, preserve the existing explicit order,
// then older edges without an explicit order, then the newly appended source.
export function appendConnection(canvas, edge) {
  const target = canvas.nodes.find(node => node.id === edge.target)
  const input = PORTS[target.type].inputs.find(port => port.id === edge.targetHandle)
  const sameInput = old => old.target === edge.target && old.targetHandle === input.id
  if (input.multiple) {
    const linked = canvas.edges.filter(sameInput).map(old => old.source)
    const order = (target.data.referenceOrder?.[input.id] ?? []).filter(id => linked.includes(id))
    target.data.referenceOrder = { ...target.data.referenceOrder, [input.id]: [...new Set([...order, ...linked, edge.source])] }
  } else {
    canvas.edges = canvas.edges.filter(old => !sameInput(old))
  }
  canvas.edges.push(edge)
}

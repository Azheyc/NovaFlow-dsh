import assert from 'node:assert/strict'
import test from 'node:test'
import { allowsVideoMode, appendConnection, connectionChoices, resolveConnection } from '../client/board/connections.js'
import { inputsOf } from '../src/canvas-generate.js'
import { availablePosition, portPoint, sizeOf } from '../src/board-layout.js'
import { checkEdge } from '../src/canvas.js'

function board() {
  const nodes = [['p', 'text'], ['q', 'text'], ['a', 'image'], ['b', 'imageGen'], ['c', 'image'], ['v', 'videoGen'], ['g', 'group']]
    .map(([id, type]) => ({ id, type, data: {}, position: { x: 0, y: 0 } }))
  return { nodes, edges: [] }
}

test('automatic video links reuse the preferred image role within node and model constraints', () => {
  const canvas = board()
  const role = (pref, modes) => resolveConnection(canvas, 'a', 'v', modes, pref)?.targetHandle
  assert.equal(role(null), 'reference')
  assert.equal(role('firstFrame'), 'firstFrame')
  assert.equal(role('firstFrame', ['reference']), 'reference')
  assert.equal(role('reference', ['firstFrame']), 'firstFrame')
  assert.equal(role(null, ['text']), undefined)
  canvas.edges.push({ id: 'old', source: 'b', sourceHandle: 'image', target: 'v', targetHandle: 'reference' })
  assert.equal(role('firstFrame'), 'reference')
  assert.equal(allowsVideoMode(2, 'firstFrame'), false)
  assert.equal(allowsVideoMode(1, 'text'), false)
})

test('one socket preserves the generator input roles, including both automatic video choices', () => {
  const canvas = board()
  const handles = (from, to, modes) => connectionChoices(canvas, from, to, modes).map(edge => edge.targetHandle)
  assert.deepEqual(handles('p', 'v'), ['prompt'])
  assert.deepEqual(handles('a', 'b'), ['reference'])
  assert.deepEqual(handles('a', 'v'), ['firstFrame', 'reference'])
  assert.deepEqual(handles('a', 'v', ['reference']), ['reference'])
  for (const [from, to] of [['v', 'b'], ['a', 'g'], ['g', 'v'], ['b', 'b']]) assert.deepEqual(handles(from, to), [])
  const video = canvas.nodes.find(n => n.id === 'v')
  for (const mode of ['text', 'firstFrame', 'reference']) {
    video.data.mode = mode
    assert.deepEqual(handles('a', 'v'), mode === 'text' ? [] : [mode])
  }
  delete video.data.mode
  const first = connectionChoices(canvas, 'a', 'v')[0]
  appendConnection(canvas, { ...first, id: 'first' })
  assert.deepEqual(handles('a', 'v'), [])
  assert.deepEqual(handles('b', 'v'), ['firstFrame'])
  appendConnection(canvas, { ...connectionChoices(canvas, 'b', 'v')[0], id: 'replacement' })
  assert.deepEqual(inputsOf(canvas, 'v', 'firstFrame').map(n => n.id), ['b'])
})

test('adding a reference preserves the order of legacy edges and replacing a prompt preserves references', () => {
  const canvas = board()
  const video = canvas.nodes.find(n => n.id === 'v')
  for (const source of ['a', 'b']) canvas.edges.push({ id: source, source, sourceHandle: 'image', target: 'v', targetHandle: 'reference' })
  video.data.referenceOrder = { reference: ['b'] }
  for (const source of ['c', 'p', 'q']) {
    const choices = connectionChoices(canvas, source, 'v')
    assert.equal(choices.length, 1)
    appendConnection(canvas, { ...choices[0], id: source })
  }
  assert.deepEqual(inputsOf(canvas, 'v', 'reference').map(n => n.id), ['b', 'a', 'c'])
  assert.deepEqual(inputsOf(canvas, 'v', 'prompt').map(n => n.id), ['q'])
  for (const [index, edge] of canvas.edges.entries()) checkEdge(canvas.nodes, canvas.edges.slice(0, index), edge)
})

test('card geometry determines both sockets and successive additions have space for captions', () => {
  const nodes = []
  for (const type of ['imageGen', 'image', 'videoGen', 'text', 'video']) {
    const position = availablePosition(nodes, type, { x: 0, y: 0 })
    const card = { type, position }, { w, h } = sizeOf(card)
    for (const other of nodes) {
      const s = sizeOf(other)
      assert.ok(position.x >= other.position.x + s.w + 48 || other.position.x >= position.x + w + 48 || position.y >= other.position.y + s.h + 48 || other.position.y >= position.y + h + 48)
    }
    assert.deepEqual(portPoint(card, 'target'), { x: position.x, y: position.y + h / 2 })
    assert.deepEqual(portPoint(card, 'source'), { x: position.x + w, y: position.y + h / 2 })
    nodes.push(card)
  }
  const resized = { type: 'imageGen', position: { x: -17, y: 30 }, width: 400, height: 280 }
  assert.deepEqual(portPoint(resized, 'target'), { x: -17, y: 170 })
})

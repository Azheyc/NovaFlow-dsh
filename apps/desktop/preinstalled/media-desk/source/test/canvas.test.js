import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { CanvasStore, imagePixels } from '../src/canvas.js'
import { CanvasGenerator, promptOf } from '../src/canvas-generate.js'
import { Settings } from '../src/settings.js'
import { Storage, StorageRoots, validateRoot } from '../src/storage.js'
import { canvasDocument } from '../client/board/document.js'
import { applyOperation, createCanvasTools } from '../src/canvas-agent.js'
import { settleGroupDrop, resizedNode } from '../src/board-layout.js'

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'desk-board-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const output = join(dir, '成果')
  const second = join(dir, '其他位置')
  await Promise.all([mkdir(output), mkdir(second)])
  const settings = new Settings(dir)
  const defaultDir = join(dir, 'files')
  const storage = new Storage({ settings, roots: new StorageRoots(join(dir, 'roots.json')), filesDir: defaultDir })
  const canvases = new CanvasStore(storage)
  await settings.update({ exportDir: await validateRoot(output) })
  return { settings, output, second, storage, canvases, defaultDir }
}

test('frames keep only their members across drops, resizing, disk reload and assistant moves', async t => {
  const { canvases } = await fixture(t)
  const canvas = await canvases.create({ name: '分组' })
  const group = { id: 'g', type: 'group', position: { x: 0, y: 0 }, width: 4900, height: 250, data: {} }
  const a = { id: 'a', type: 'text', position: { x: 25, y: 50 }, data: {} }
  const b = { ...a, id: 'b', position: { x: 4200, y: 50 } }
  canvas.nodes = [group, a, b]
  settleGroupDrop(canvas.nodes, new Set(['a']))
  assert.equal(a.parentId, 'g')
  assert.equal(b.parentId, undefined)
  assert.deepEqual(resizedNode(group, -6000, -200, canvas.nodes), { width: 289, height: 234 })
  const saved = await canvases.save(canvas.id, canvas.revision, canvas)
  const reopened = await canvases.get(saved.id)
  assert.equal(reopened.nodes[0].width, 4900)
  assert.equal(reopened.nodes[1].parentId, 'g')
  applyOperation(reopened, { op: 'moveNode', id: 'g', position: { x: -200, y: 100 } }, [])
  assert.deepEqual(reopened.nodes[1].position, { x: -175, y: 150 })
  assert.deepEqual(reopened.nodes[2].position, b.position)
  applyOperation(reopened, { op: 'moveNode', id: 'a', position: { x: -3000, y: 0 } }, [])
  assert.equal(reopened.nodes[1].parentId, undefined)
})

test('the default data directory works without a saved path and retains earlier custom files', async t => {
  const { settings, output, defaultDir, storage, canvases } = await fixture(t)
  const previous = await canvases.create({ name: '已有画布' })
  const previousImage = await storage.write('assets', 'previous.png', Buffer.from('previous'))
  assert.equal((await storage.status()).path, await realpath(output))

  await settings.update({ exportDir: '' })
  const current = await canvases.create({ name: '默认位置' })
  assert.deepEqual(new Set((await canvases.list()).map(canvas => canvas.id)), new Set([previous.id, current.id]))
  assert.equal((await storage.status()).path, await realpath(defaultDir))
  assert.equal(JSON.parse(await readFile(join(defaultDir, '画布', `${current.id}.json`), 'utf8')).id, current.id)
  assert.equal(await readFile(await storage.resolve(previousImage.src), 'utf8'), 'previous')
  await writeFile(join(defaultDir, 'legacy.png'), 'legacy')
  assert.equal(await readFile(await storage.resolve('media-desk/files/legacy.png'), 'utf8'), 'legacy')
  const newImage = await storage.write('images', 'current.png', Buffer.from('current'))
  assert.equal(newImage.file, join(await realpath(defaultDir), '生成', '图片', 'current.png'))
})

test('old boards and ordered reference images remain available after changing the output directory', async t => {
  const { settings, output, second, storage, canvases } = await fixture(t)
  const canvas = await canvases.create({ name: '人物稿' })
  const first = await storage.write('assets', 'first.png', Buffer.from('first'))
  const secondImage = await storage.write('assets', 'second.png', Buffer.from('second'))
  await settings.update({ exportDir: await validateRoot(second) })
  assert.equal((await canvases.list())[0].id, canvas.id)
  const updated = await canvases.rename(canvas.id, canvas.revision, '改稿')
  assert.equal(JSON.parse(await readFile(join(output, '画布', `${canvas.id}.json`))).name, updated.name)
  const node = { id: 'render', type: 'imageGen', data: { prompt: '4K 人物图', tier: '1K', ratio: '9:16', referenceOrder: { reference: ['second', 'first'] } } }
  const graph = { ...updated, nodes: [{ id: 'first', type: 'image', data: first }, { id: 'second', type: 'image', data: secondImage }, node], edges: ['first', 'second'].map(id => ({ id, source: id, sourceHandle: 'image', target: node.id, targetHandle: 'reference' })) }
  const saved = await canvases.save(canvas.id, updated.revision, graph)
  const generator = new CanvasGenerator({ storage, media: () => ({
    selections: async () => ({ image: { id: 'mock-image', group: 'image-group' } }),
    generateImage: async (args, root, prepared) => {
      assert.equal(args.size, '1152x2048')
      assert.equal(args.group, 'image-group')
      assert.equal(root, await realpath(second))
      assert.deepEqual(await Promise.all(args.reference_images.map(file => readFile(join(root, file), 'utf8'))), ['second', 'first'])
      await prepared('test-job')
      return { id: 'test-job', status: 'completed', files: [join(root, args.path + '.png')] }
    },
  }) })
  let job
  const view = await generator.image(saved, node, id => { job = id })
  assert.equal(job, 'test-job')
  assert.equal(view.status, 'completed')
  await assert.rejects(canvases.save(canvas.id, updated.revision, graph), { code: 'CANVAS_CONFLICT' })
  const results = await Promise.allSettled([1, 2].map(() => canvases.save(canvas.id, saved.revision, graph)))
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
})

test('a connected text node owns the image prompt until disconnected', async () => {
  const image = { id: 'image', type: 'imageGen', data: { prompt: 'local draft' } }
  const text = { id: 'script', type: 'text', data: { text: '  linked draft  ' } }
  const canvas = { nodes: [image, text], edges: [{ source: text.id, target: image.id, targetHandle: 'prompt' }] }
  assert.equal(promptOf(canvas, image), 'linked draft')
  assert.equal(promptOf(canvas, { ...image, type: 'videoGen' }), 'local draft\n\nlinked draft')
  text.data.text = ' '
  await assert.rejects(new CanvasGenerator({}).image(canvas, image), /已连接的文本节点/)
  canvas.edges = []
  assert.equal(promptOf(canvas, image), 'local draft')
})

test('only supported image tiers and compatible edges reach generation', async t => {
  const { canvases, storage } = await fixture(t)
  const canvas = await canvases.create()
  const node = { id: 'render', type: 'imageGen', data: { tier: '4K', prompt: 'draft' } }
  assert.throws(() => imagePixels('4K'), /1K/)
  await assert.rejects(canvases.save(canvas.id, canvas.revision, { ...canvas, nodes: [node] }), /1K/)
  node.data.tier = '2K'
  await assert.rejects(canvases.save(canvas.id, canvas.revision, { ...canvas, nodes: [node, { id: 'text', type: 'text' }], edges: [{ id: 'edge', source: 'text', sourceHandle: 'text', target: 'render', targetHandle: 'reference' }] }), /TEXT/)
  assert.equal(imagePixels('2K', '1:1'), '2048x2048')
  assert.equal(imagePixels('1K', '16:9'), '1024x576')
  const generator = new CanvasGenerator({ storage, media: () => ({ selections: async () => ({ image: { id: 'fixture', capabilities: { tiers: ['1K'] } } }), generateImage: () => assert.fail('unsupported request') }) })
  await assert.rejects(generator.image(canvas, node), /不支持/)
})

test('file reads and writes stay in managed folders; deletion retains shared files', async t => {
  const { storage, canvases, second, output } = await fixture(t)
  const canvas = await canvases.create()
  const other = await canvases.create()
  const shared = await storage.write('images', `${canvas.id}-shared.png`, Buffer.from('shared'))
  const unique = await storage.write('images', `${canvas.id}-unique.png`, Buffer.from('unique'))
  const nodes = [shared, unique].map(({ src }, index) => ({ id: `item${index}`, type: 'image', data: { src } }))
  const saved = await canvases.save(canvas.id, 1, { ...canvas, nodes })
  await canvases.save(other.id, 1, { ...other, nodes: nodes.slice(0, 1) })
  assert.deepEqual((await canvases.deletionPreview(canvas.id)).assets, [unique.src])
  await assert.rejects(canvases.remove(canvas.id, saved.revision, [shared.src]))
  await canvases.remove(canvas.id, saved.revision, [unique.src])
  assert.equal(await storage.resolve(unique.src), null)
  assert.equal(await readFile(await storage.resolve(shared.src), 'utf8'), 'shared')
  assert.equal(await storage.resolve(shared.src.replace('生成/图片', '../')), null)
  await rm(join(output, '素材'), { recursive: true })
  await symlink(second, join(output, '素材'), process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(storage.write('assets', 'outside.jpg', 'outside'))
  await assert.rejects(readFile(join(second, 'outside.jpg')), { code: 'ENOENT' })
})

test('client rebases a pending user edit over a finished Host generation', async t => {
  const { canvases } = await fixture(t)
  const canvas = await canvases.create()
  await canvases.save(canvas.id, 1, { ...canvas, nodes: [{ id: 'node', type: 'imageGen', data: { label: 'old' } }] })
  const doc = canvasDocument(canvas.id, async (path, body) => ({ canvas: body ? await canvases.save(canvas.id, body.revision, body) : await canvases.get(canvas.id) }), () => {})
  await doc.refresh()
  doc.edit(current => ({ ...current, nodes: current.nodes.map(node => ({ ...node, data: { ...node.data, label: 'new' } })) }), assert.fail)
  await canvases.update(canvas.id, 2, current => { current.nodes[0].data.job = { status: 'completed', id: 'done' }; return current })
  await doc.flush()
  const { data } = (await canvases.get(canvas.id)).nodes[0]
  assert.equal(data.label, 'new')
  assert.equal(data.job.id, 'done')
})

test('canvas tools use the calling session, enforce page and batch bounds, and stop after closing', async t => {
  const { canvases } = await fixture(t)
  const first = await canvases.create()
  const second = await canvases.create()
  const visible = new Set([first.id])
  const sessions = { canvasOf: id => ({ a: first.id, b: second.id })[id] }
  const { tools, when } = createCanvasTools({ canvases, sessions, open: id => visible.has(id) })
  const caller = id => ({ agent: { session: { id } } })
  assert.equal(when(caller('a')), true)
  assert.equal(when(caller('b')), false)
  const edit = tools.find(tool => tool.name === 'canvas_edit')
  const read = tools.find(tool => tool.name === 'canvas_read')
  const op = { op: 'addNode', type: 'text', data: { text: '长'.repeat(5000) } }
  await assert.rejects(edit.execute({ revision: 1, operations: Array(65).fill(op) }, caller('a')))
  await edit.execute({ revision: 1, operations: Array(20).fill(op) }, caller('a'))
  const page = await read.execute({ fields: ['data'] }, caller('a'))
  assert.ok(page.value.nextCursor > 0 && Buffer.byteLength(JSON.stringify(page)) < 65536)
  assert.equal((await canvases.get(second.id)).nodes.length, 0)
  visible.clear()
  await assert.rejects(read.execute({}, caller('a')), /未打开/)
})

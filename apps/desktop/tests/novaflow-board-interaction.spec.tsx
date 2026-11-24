// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CanvasView } from '../preinstalled/media-desk/source/client/board/index.jsx'
import { BoardChat } from '../preinstalled/media-desk/source/client/board/chat.jsx'
import { boardWorkflows } from '../preinstalled/media-desk/source/client/board/workflows.js'
import { setLanguagePreference } from '../preinstalled/media-desk/source/client/i18n.js'
import { HomeView } from '../preinstalled/media-desk/source/client/canvas.jsx'
import { getDesk, setDesk } from '../preinstalled/media-desk/source/client/desk.js'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear() })

it('groups only the marquee selection, resizes at canvas zoom, moves members together and ungroups without losing edges', async () => {
  document.documentElement.lang = 'zh'
  setDesk({ dockOpen: false })
  const nodes = ['a', 'b', 'c'].map((id, i) => ({ id, type: i ? 'imageGen' : 'text', position: { x: 3 + i * 333, y: 7 }, data: { label: id } }))
  const edges = [{ id: 'ab', source: 'a', sourceHandle: 'text', target: 'b', targetHandle: 'prompt' }]
  let stored = { id: 'group-test', name: '测试', revision: 1, nodes, edges, viewport: { x: 0, y: 0, zoom: 2 } }
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url.includes('canvas/save')) stored = JSON.parse(String(init.body))
    if (url.includes('canvas/open')) return Response.json({ canvases: [stored] })
    return Response.json({ canvas: stored })
  }))
  const view = render(<CanvasView />)
  await screen.findByRole('button', { name: 'a' })
  const stage = view.container.querySelector<HTMLElement>('.md-flow-stage')!
  const card = (id: string) => stage.querySelector<HTMLElement>(`[data-bnode="${id}"]`)!
  const pointer = (x: number, y: number) => ({ button: 0, pointerId: 4, clientX: x, clientY: y })
  const panTool = screen.getByRole('button', { name: '拖动' })
  const selectTool = screen.getByRole('button', { name: '框选' })
  expect(panTool.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(selectTool)
  expect(selectTool.getAttribute('aria-pressed')).toBe('true')
  fireEvent.pointerDown(stage, pointer(-12, -12))
  fireEvent.pointerMove(window, pointer(1050, 320))
  expect(stage.querySelector('.md-board-lasso')).toBeTruthy()
  fireEvent.pointerUp(window, pointer(1050, 320))
  fireEvent.click(screen.getByRole('button', { name: '将所选节点分组' }))
  const group = stage.querySelector<HTMLElement>('.md-bnode.is-group')!
  const handle = within(group).getByRole('button', { name: '调整大小' })
  Object.defineProperty(handle, 'setPointerCapture', { value: vi.fn() })
  const width = parseFloat(group.style.width)
  fireEvent.pointerDown(handle, pointer(100, 100))
  fireEvent.pointerMove(handle, pointer(180, 140))
  expect(parseFloat(group.style.width)).toBe(width + 40)
  fireEvent.pointerUp(handle, pointer(180, 140))
  fireEvent.keyDown(stage, { key: 'z', ctrlKey: true })
  expect(parseFloat(group.style.width)).toBe(width)
  fireEvent.keyDown(stage, { key: 'Z', ctrlKey: true, shiftKey: true })
  expect(parseFloat(group.style.width)).toBe(width + 40)
  fireEvent.pointerDown(group, pointer(100, 100))
  fireEvent.pointerMove(window, pointer(180, 180))
  fireEvent.pointerUp(window, pointer(180, 180))
  expect(card('a').style.left).toBe('43px')
  expect(parseFloat(card('b').style.left) - parseFloat(card('a').style.left)).toBe(333)
  expect(card('c').style.left).toBe('669px')
  expect(card('b').style.width).toBe('240px')
  await waitFor(() => expect(stored.nodes).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'a', parentId: group.dataset.bnode }),
    expect.objectContaining({ id: 'b', parentId: group.dataset.bnode }),
    expect.objectContaining({ id: group.dataset.bnode, width: width + 40 }),
  ])), { timeout: 3000 })
  expect(stored.nodes.find(n => n.id === 'c')).not.toHaveProperty('parentId')
  const toggle = (node: HTMLElement) => {
    fireEvent.pointerDown(node, { ...pointer(40, 40), ctrlKey: true })
    fireEvent.pointerUp(window, pointer(40, 40))
  }
  toggle(card('c'))
  fireEvent.click(screen.getByRole('button', { name: '加入分组' }))
  expect(parseFloat(group.style.width)).toBeGreaterThan(width + 40)
  toggle(group)
  toggle(card('c'))
  fireEvent.click(screen.getByRole('button', { name: '移出分组' }))
  await waitFor(() => expect(stored.nodes.find(n => n.id === group.dataset.bnode))
    .toMatchObject({ width: parseFloat(group.style.width) }), { timeout: 3000 })
  expect(stored.nodes.find(n => n.id === 'c')).not.toHaveProperty('parentId')
  toggle(card('c'))
  toggle(group)
  fireEvent.click(screen.getByRole('button', { name: '解散分组' }))
  expect(stage.querySelector('.is-group')).toBeNull()
  expect(stage.querySelectorAll('.md-board-edge')).toHaveLength(1)
  const memberHandle = within(card('b')).getByRole('button', { name: '调整大小' })
  fireEvent.keyDown(memberHandle, { key: 'ArrowLeft' })
  expect(card('b').style.width).toBe('224px')
  await waitFor(() => expect(stored.nodes.find(n => n.id === 'b')).toMatchObject({ width: 224 }), { timeout: 3000 })
  view.unmount()
  const reopened = render(<CanvasView />)
  await screen.findByRole('button', { name: 'b' })
  expect(reopened.container.querySelector<HTMLElement>('[data-bnode="b"]')?.style.width).toBe('224px')
  expect(stored.nodes.every(n => !('parentId' in n))).toBe(true)
  expect(stored.edges).toEqual(edges)
})

it('fills editable workflow drafts, retains source material and sends only when submitted', async () => {
  const original = getDesk()
  const requests: object[] = []
  const canvas = { id: 'starter-board' }
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    if (init.method === 'POST') requests.push(JSON.parse(String(init.body)))
    const messages = requests.length ? [{ id: 'reply', role: 'assistant', text: '节点已备好' }] : []
    return Response.json({ messages, running: false })
  }))
  setDesk({ state: { chat: [] } })
  setLanguagePreference('zh')
  try {
    const panel = <BoardChat canvas={canvas} beforeSend={vi.fn()} onCanvasChanged={vi.fn()} />
    const view = render(panel)
    const picker = await screen.findByRole('region', { name: '流程预设' })
    const input = screen.getByRole<HTMLTextAreaElement>('textbox')
    const material = '镜头从车站时钟移到夜班司机。'
    fireEvent.change(input, { target: { value: material } })
    const cards = within(picker).getAllByRole('button')
    expect(cards).toHaveLength(6)
    for (const [index, row] of boardWorkflows.entries()) {
      fireEvent.click(cards[index]!)
      expect(document.activeElement).toBe(input)
      expect(input.value).toBe(`${row.prompt.replace('{skill}', row.skill ?? '')}\n${material}`)
    }
    expect(requests).toEqual([])
    const message = input.value
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(requests).toEqual([{ id: canvas.id, message, requestId: expect.any(String) }]))
    view.unmount()
    render(panel)
    await screen.findByText('节点已备好')
    expect(screen.queryByRole('region', { name: '流程预设' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '流程预设' }))
    fireEvent.click(screen.getByRole('button', { name: /电影级分镜/ }))
    expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toContain('laotang-cinematic-storyboard-s10-free')
    expect(screen.getByText('节点已备好')).toBeTruthy()
    expect(requests).toHaveLength(1)
  } finally {
    cleanup()
    setLanguagePreference('auto')
    setDesk(original)
  }
})

it('opens idea capture from the shared round dock button', () => {
  const original = getDesk()
  setDesk({ mode: 'feed', state: { items: [] }, capture: null })
  try {
    render(<HomeView />)
    const dock = screen.getByRole('toolbar')
    const add = dock.querySelector<HTMLButtonElement>('button.md-round.is-primary')!
    expect(dock.classList.contains('md-dockbar')).toBe(true)
    fireEvent.click(add)
    expect(getDesk().capture).toMatchObject({ tab: 'text' })
  } finally {
    cleanup()
    setDesk(original)
  }
})

it('keeps previews compact and opens a single editor on activation, independently of drag or selection', async () => {
  document.documentElement.lang = 'zh'
  setDesk({ dockOpen: false })
  const nodes = ['text', 'imageGen', 'videoGen'].map((type, i) => ({ type, id: type, position: { x: 300 * i, y: 0 }, data: {} }))
  const canvas = { id: 'board', revision: 1, name: '测试', nodes, edges: [], viewport: { x: 10, y: 12, zoom: 1 } }
  let savedEdges: { target: string; targetHandle: string }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    let data: unknown = {}
    if (url.includes('canvas/open')) data = { canvases: [canvas] }
    if (url.includes('canvas/get')) data = { canvas }
    if (url.includes('canvas/save')) {
      const saved = JSON.parse(String(init.body))
      savedEdges = saved.edges
      data = { canvas: saved }
    }
    return Response.json(data)
  }))
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  const { container } = render(<CanvasView />)
  const face = await screen.findByRole('button', { name: '图片生成' })
  const stage = container.querySelector<HTMLElement>('.md-flow-stage')!
  const card = face.closest('[data-bnode]')!
  expect(card.querySelectorAll('[data-socket]')).toHaveLength(2)
  expect(container.querySelector('[data-bnode="text"]')?.querySelectorAll('[data-socket]')).toHaveLength(1)
  expect(stage.querySelector('textarea,input,select')).toBeNull()
  const hit = vi.fn().mockReturnValue(face)
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: hit })
  try {
    const start = { button: 0, pointerId: 1, clientX: 50, clientY: 50 }
    fireEvent.pointerDown(face, start)
    fireEvent.pointerMove(window, { ...start, clientX: 70 })
    fireEvent.pointerUp(window, { ...start, clientX: 70 })
    expect(screen.queryByRole('region', { name: '编辑节点' })).toBeNull()
    fireEvent.pointerDown(face, start)
    fireEvent.pointerUp(window, start)
    const editor = screen.getByRole('region', { name: '编辑节点' })
    expect(card.contains(editor)).toBe(false)
    const prompt = within(editor).getByRole('textbox', { name: '提示词' })
    fireEvent.change(prompt, { target: { value: '产品照片' } })
    expect(within(editor).getAllByRole('option').map(option => option.textContent)).toEqual(expect.arrayContaining(['1K', '2K']))
    expect(within(editor).queryByRole('option', { name: '4K' })).toBeNull()
    fireEvent.keyDown(prompt, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: '编辑节点' })).toBeNull()
    fireEvent.keyDown(face, { key: 'Enter' })
    expect((screen.getByRole('textbox', { name: '提示词' }) as HTMLTextAreaElement).value).toBe('产品照片')
    Object.defineProperties(stage, {
      setPointerCapture: { value: vi.fn() }, hasPointerCapture: { value: () => true }, releasePointerCapture: { value: vi.fn() },
    })
    fireEvent.pointerDown(stage, start)
    fireEvent.pointerUp(stage, start)
    expect(screen.queryByRole('region', { name: '编辑节点' })).toBeNull()
    const toolbar = screen.getByRole('toolbar', { name: '节点操作' })
    const add = within(toolbar).getByRole('button', { name: '添加节点' })
    expect(toolbar.classList.contains('md-dockbar')).toBe(true)
    expect(add.matches('.md-round.is-primary')).toBe(true)
    fireEvent.click(add)
    expect(within(screen.getByRole('group', { name: '添加节点' })).getAllByRole('button')).toHaveLength(6)
    fireEvent.keyDown(add, { key: 'Escape' })
    expect(document.activeElement).toBe(add)
    expect(add.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(add)
    fireEvent.click(within(toolbar).getByRole('button', { name: '图片' }))
    expect(container.querySelectorAll('[data-bnode]')).toHaveLength(4)
    expect(stage.querySelector('textarea,input,select')).toBeNull()
    fireEvent.click(within(toolbar).getByRole('button', { name: '添加文本节点' }))
    expect(container.querySelectorAll('[data-bnode]')).toHaveLength(5)
    // Keyboard activation supports starting at the input and ending at the source.
    fireEvent.click(card.querySelector('[data-socket="target"]')!)
    fireEvent.click(container.querySelector('[data-bnode="text"] [data-socket="source"]')!)
    expect(stage.querySelectorAll('.md-board-edge')).toHaveLength(1)
    // A pointer captured by the stage drops on the single visible video socket.
    hit.mockReturnValue(container.querySelector('[data-bnode="videoGen"] [data-socket="target"]'))
    fireEvent.pointerDown(card.querySelector('[data-socket="source"]')!, start)
    fireEvent.pointerUp(stage, start)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(stage.querySelectorAll('.md-board-edge')).toHaveLength(2)
    await waitFor(() => expect(savedEdges).toEqual(expect.arrayContaining([expect.objectContaining({ target: 'videoGen', targetHandle: 'reference' })])), { timeout: 3000 })
    fireEvent.keyDown(screen.getByRole('button', { name: '视频生成' }), { key: 'Enter' })
    fireEvent.change(screen.getByRole('combobox', { name: '生成方式' }), { target: { value: 'firstFrame' } })
    fireEvent.click(within(toolbar).getByRole('button', { name: '添加视频生成节点' }))
    const next = Array.from(container.querySelectorAll('.md-bnode.is-videoGen')).at(-1)!
    fireEvent.click(next.querySelector('[data-socket="target"]')!)
    fireEvent.click(card.querySelector('[data-socket="source"]')!)
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(savedEdges.filter(edge => edge.targetHandle === 'firstFrame').map(edge => edge.target)).toEqual(['videoGen', next.getAttribute('data-bnode')]), { timeout: 3000 })
  } finally {
    Reflect.deleteProperty(document, 'elementFromPoint')
  }
})

it('creates at the context click, uses linked text, and expands image and video results', async () => {
  setLanguagePreference('zh')
  const original = getDesk()
  setDesk({ dockOpen: false })
  const canvas = {
    id: 'media-board', revision: 1, name: '预览', viewport: { x: 40, y: 20, zoom: 2 },
    nodes: [
      { id: 'text', type: 'text', position: { x: 0, y: 0 }, data: { text: '上游文案', label: '镜头一' } },
      { id: 'still', type: 'imageGen', position: { x: 350, y: 0 }, data: { src: 'media-desk/image.png', prompt: '本地草稿' } },
      { id: 'clip', type: 'videoGen', position: { x: 700, y: 0 }, data: { src: 'media-desk/clip.mp4' } },
    ],
    edges: [{ id: 'wire', source: 'text', sourceHandle: 'text', target: 'still', targetHandle: 'prompt' }],
  }
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url.includes('canvas/open')) return Response.json({ canvases: [canvas] })
    if (url.includes('canvas/get')) return Response.json({ canvas })
    if (url.includes('canvas/save')) return Response.json({ canvas: JSON.parse(String(init.body)) })
    return Response.json({})
  }))
  try {
    const { container } = render(<CanvasView />)
    const image = await screen.findByRole('button', { name: '图片生成' })
    const stage = container.querySelector<HTMLElement>('.md-flow-stage')!
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue(new DOMRect(80, 12, 900, 700))
    const world = stage.querySelector<HTMLElement>('.md-world')!
    Object.defineProperties(stage, {
      setPointerCapture: { value: vi.fn() }, hasPointerCapture: { value: () => true }, releasePointerCapture: { value: vi.fn() },
    })
    fireEvent.click(screen.getByRole('button', { name: '框选' }))
    fireEvent.click(screen.getByRole('button', { name: '拖动' }))
    fireEvent.pointerDown(stage, { button: 0, pointerId: 1, clientX: 120, clientY: 140 })
    fireEvent.pointerMove(stage, { buttons: 1, pointerId: 1, clientX: 130, clientY: 150 })
    fireEvent.pointerUp(stage, { button: 0, pointerId: 1, clientX: 130, clientY: 150 })
    expect(world.style.transform).toBe('translate3d(50px, 30px, 0) scale(2)')
    expect(stage.querySelector('.md-board-lasso')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '框选' }))
    fireEvent.pointerDown(image, { button: 1, pointerId: 2, clientX: 110, clientY: 110 })
    fireEvent.pointerMove(stage, { buttons: 4, pointerId: 2, clientX: 120, clientY: 140 })
    fireEvent.pointerUp(stage, { button: 1, pointerId: 2, clientX: 120, clientY: 140 })
    expect(world.style.transform).toBe('translate3d(60px, 60px, 0) scale(2)')
    expect(stage.querySelector('.is-selected,.md-board-lasso')).toBeNull()
    fireEvent.wheel(image, { deltaY: -100, clientX: 240, clientY: 172 })
    expect(world.style.transform).toBe('translate3d(55px, 55px, 0) scale(2.1)')
    // The same world point stays under the cursor through zoom and right-click insertion.
    fireEvent.contextMenu(image, { clientX: 240, clientY: 172 })
    const menu = screen.getByRole('group', { name: '添加节点' })
    expect(within(menu).getAllByRole('button')).toHaveLength(6)
    fireEvent.click(within(menu).getByRole('button', { name: '图片' }))
    const created = stage.querySelector<HTMLElement>('.md-bnode.is-image')!
    expect([created.style.left, created.style.top]).toEqual(['50px', '50px'])
    fireEvent.keyDown(image, { key: 'Enter' })
    const prompt = screen.getByRole<HTMLTextAreaElement>('textbox', { name: '提示词' })
    expect([prompt.disabled, prompt.value]).toEqual([true, '上游文案'])
    expect(screen.getByText(/提示词来自「镜头一」/)).toBeTruthy()
    fireEvent.pointerDown(stage.querySelector('.md-board-edge-hit')!, { button: 0 })
    expect([prompt.disabled, prompt.value]).toEqual([false, '本地草稿'])
    fireEvent.doubleClick(image)
    const still = screen.getByRole('dialog', { name: '图片生成' })
    expect(still.querySelector('img')?.getAttribute('src')).toBe('media-desk/image.png')
    fireEvent.click(within(still).getByRole('button', { name: '关闭' }))
    fireEvent.doubleClick(screen.getByRole('button', { name: '视频生成' }))
    const video = screen.getByRole('dialog', { name: '视频生成' }).querySelector('video')!
    expect([video.controls, video.getAttribute('src')]).toEqual([true, 'media-desk/clip.mp4'])
    fireEvent.keyDown(video, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  } finally {
    cleanup()
    setDesk(original)
    setLanguagePreference('auto')
  }
})

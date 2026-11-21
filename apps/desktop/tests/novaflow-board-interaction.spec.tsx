// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CanvasView } from '../preinstalled/media-desk/source/client/board/index.jsx'
import { HomeView } from '../preinstalled/media-desk/source/client/canvas.jsx'
import { getDesk, setDesk } from '../preinstalled/media-desk/source/client/desk.js'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear() })

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
    fireEvent.pointerDown(stage, start)
    fireEvent.pointerUp(window, start)
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
    Object.defineProperty(stage, 'setPointerCapture', { value: vi.fn() })
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

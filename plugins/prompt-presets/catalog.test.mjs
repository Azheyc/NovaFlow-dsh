import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { builtIn } from './catalog.js'
import { apply } from './index.js'

test('four homepage recommendations reference distinct shipped enterprise prompts', () => {
  const prompts = builtIn.categories.flatMap(group => group.prompts)
  assert.equal(new Set(prompts.map(prompt => prompt.id)).size, prompts.length)
  assert.equal(new Set(builtIn.featured).size, 4)
  for (const id of builtIn.featured) assert.ok(prompts.some(prompt => prompt.id === id))
})

async function fixture(context) {
  const dir = await mkdtemp(join(tmpdir(), 'prompt-library-'))
  context.after(() => rm(dir, { recursive: true, force: true }))
  const mount = () => {
    let route
    apply({ profileContext: { dir }, effect: install => install(), connection: {
      admit: ({ headers }) => headers.has('authorization') ? { peer: { principal: { kind: 'owner' }, interactions: 'answer' } } : { rejection: true },
      fetch: { register: entry => { route = entry.fetch } },
    } })
    return (data, authenticated = true) => route(new Request('http://localhost/api/novaflow-prompt-presets', { method: 'POST', headers: { 'content-type': 'application/json', ...(authenticated && { authorization: 'fixture' }) }, body: JSON.stringify(data) }))
  }
  return { dir, mount }
}

test('writes persist, concurrent stale updates fail, unauthorized requests cannot read or save', async context => {
  const { dir, mount } = await fixture(context)
  const call = mount()
  assert.equal((await call({ action: 'read' }, false)).status, 403)
  const state = await (await call({ action: 'read' })).json()
  assert.deepEqual(state.builtIn, builtIn)
  const custom = { categories: [{ id: 'team', name: '团队', prompts: [{ id: 'weekly', title: '周报', body: '生成部门周报' }] }], featured: ['weekly'] }
  const save = { action: 'save', custom, revision: state.revision }
  assert.equal((await call(save, false)).status, 403)
  assert.equal((await call({ ...save, builtIn: custom })).status, 400)
  assert.equal((await call({ ...save, custom: builtIn })).status, 400)
  const responses = await Promise.all([call(save), call(save)])
  assert.deepEqual(responses.map(result => result.status).sort(), [200, 409])
  assert.deepEqual((await (await mount()({ action: 'read' })).json()).custom, custom)
  assert.deepEqual(JSON.parse(await readFile(join(dir, '.novaflow-prompt-presets.json'), 'utf8')), { version: 2, custom })
  assert.equal((await call({ action: 'save', catalog: {} })).status, 400)
})

test('migrates edits from all modes, deduplicates copied prompts and drops unchanged old defaults', async context => {
  const { dir, mount } = await fixture(context)
  const path = join(dir, '.novaflow-prompt-presets.json')
  const original = { id: 'writing-2', title: '帮我写一份不流水账的周报', body: '把我提供的本周记录整理为周报。按成果、影响、阻碍和下周优先事项展开，保留原始数字，缺失的信息留空。' }
  const weekly = { id: 'team', title: '每周总结', body: '采用团队周报格式' }
  const library = { categories: [{ id: 'writing', name: '创作文档', prompts: [original, weekly] }], featured: ['team'] }
  const legacy = { standard: library, 'custom-mode': library, 'novaflow-modeling': structuredClone(library) }
  legacy['novaflow-modeling'].categories[0].prompts[0].body = '按客户项目整理周报'
  await writeFile(path, JSON.stringify(legacy))

  const call = mount()
  const state = await (await call({ action: 'read' })).json()
  assert.deepEqual(state.builtIn, builtIn)
  const [group] = state.custom.categories
  assert.deepEqual(group.prompts.map(item => item.body), [weekly.body, '按客户项目整理周报'])
  assert.deepEqual(state.custom.featured, [group.prompts[0].id])
  assert.deepEqual(await (await mount()({ action: 'read' })).json(), state)

  assert.equal((await call({ action: 'save', custom: state.custom, revision: state.revision })).status, 200)
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { version: 2, custom: state.custom })
  assert.deepEqual(await (await mount()({ action: 'read' })).json(), state)
})

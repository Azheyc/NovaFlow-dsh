import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { defaults } from './catalog.js'
import { apply, validCatalog } from './index.js'

test('each shipped mode has four real recommendations and four complete prompts per category', () => {
  assert.ok(validCatalog(defaults))
  for (const library of Object.values(defaults)) {
    assert.equal(library.featured.length, 4)
    for (const group of library.categories) assert.equal(group.prompts.length, 4)
  }
  const invalid = structuredClone(defaults)
  invalid.standard.categories[0].prompts = []
  invalid.standard.featured = ['writing-1']
  assert.equal(validCatalog(invalid), false)
})

test('modeling recommendations cover the CAD, native source file and rendering stages', () => {
  const modeling = defaults['novaflow-modeling']
  assert.deepEqual(modeling.categories.map(group => group.name), ['制作 CAD 尺寸图', '开始建模', '依据建模生成效果图'])
  assert.deepEqual(modeling.featured.slice(0, 3), modeling.categories.map(group => group.prompts[0].id))
})

test('writes persist, concurrent stale updates fail, unauthorized requests cannot read or save', async context => {
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
  const call = mount()
  assert.equal((await call({ action: 'read' }, false)).status, 403)
  const state = await (await call({ action: 'read' })).json()
  state.catalog.standard.categories[0].name = '自定义'
  const save = { action: 'save', ...state }
  const responses = await Promise.all([call(save), call(save)])
  assert.deepEqual(responses.map(result => result.status).sort(), [200, 409])
  assert.deepEqual((await (await mount()({ action: 'read' })).json()).catalog, state.catalog)
  assert.equal((await call({ action: 'save', catalog: {} })).status, 400)
})

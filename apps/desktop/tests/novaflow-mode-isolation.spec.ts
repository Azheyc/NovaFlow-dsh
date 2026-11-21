import { expect, it } from 'vitest'
import SkillRegistry from '../../../packages/skill/skill/src/index.ts'
import { contribution, declare, harness } from '../../../packages/preset/agent-preset-registry/tests/harness.ts'

it('shares NovaFlow content skills across preset scopes and resolves retired IDs', async () => {
  const plugin = await import(new URL('../../novaflow-modes/index.js', import.meta.url).href)
  const ctx = await harness()
  try {
    await ctx.plugin(SkillRegistry)
    ctx.provide('profileContext', { dir: process.cwd() } as never)
    ctx.provide('connection', { fetch: { register: () => () => {} } } as never)
    ctx.provide('webServer', {} as never)
    await declare(ctx, contribution('standard'))
    await declare(ctx, contribution('another'))
    await ctx.plugin(plugin)

    const expected = ['laotang-asset-extractor', 'laotang-character-board', 'laotang-cinematic-storyboard-s10-free', 'laotang-scene-reference-zh', 'laotang-storycraft-zh']
    await using standard = await ctx.agentPresets.acquireScope('standard')
    await using another = await ctx.agentPresets.acquireScope('another')
    for (const scope of [undefined, standard.key, another.key]) {
      expect((await ctx.skills.list({ scope })).map(skill => skill.name).sort()).toEqual(expected)
      for (const name of expected) {
        const skill = await ctx.skills.get(name, { scope })
        expect(skill).toMatchObject({ source: 'bundled', provider: 'novaflow-content-platform' })
        expect(skill?.content).toBeTruthy()
      }
    }
    expect((await ctx.agentPresets.list()).map(row => row.id).sort()).toEqual(['another', 'standard'])
    for (const retired of ['novaflow-modeling', 'novaflow-media-creation']) {
      expect(await ctx.agentPresets.resolve(retired)).toEqual({ id: 'standard' })
    }
  } finally { await ctx.fiber.dispose() }
})

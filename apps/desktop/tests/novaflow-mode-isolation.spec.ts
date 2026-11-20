/** Mode additions are visible only to agents selecting that mode, not the global or other mode scope. */
import { expect, it } from 'vitest'
import SkillRegistry from '../../../packages/skill/skill/src/index.ts'
import type { PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry'
import { harness, declare, contribution, agentOn } from '../../../packages/preset/agent-preset-registry/tests/harness.ts'

it('loads the five bundled skills only in the content platform preset', async () => {
  const { modes } = await import(new URL('../../novaflow-modes/modes.js', import.meta.url).href) as { modes: PresetDefinition[] }
  const ctx = await harness()
  try {
    ctx.baseUrl = new URL('../../../packages/bundle/web-app/', import.meta.url).href
    await ctx.plugin(SkillRegistry)
    await declare(ctx, contribution('standard'))
    for (const mode of modes) await declare(ctx, mode)
    await using content = await ctx.agentPresets.acquireScope('novaflow-media-creation')
    const options = { scope: content.key }
    const expected = ['laotang-asset-extractor', 'laotang-character-board', 'laotang-cinematic-storyboard-s10-free', 'laotang-scene-reference-zh', 'laotang-storycraft-zh']
    expect((await ctx.skills.list(options)).map(skill => skill.name).sort()).toEqual(expected)
    for (const name of expected) expect((await ctx.skills.get(name, options))?.content).toBeTruthy()
    expect((await ctx.skills.get('laotang-cinematic-storyboard-s10-free', options))?.content).toContain('s10至臻版')
    await using standard = await ctx.agentPresets.acquireScope('standard')
    expect(await ctx.skills.list({ scope: standard.key })).toEqual([])
    expect(await ctx.skills.list()).toEqual([])
  } finally { await ctx.fiber.dispose() }
})

it('keeps future specialist tools scoped while inheriting standard capabilities', async () => {
  const moduleUrl = new URL('../../novaflow-modes/modes.js', import.meta.url).href
  const { composeModes, modes } = await import(moduleUrl) as {
    modes: PresetDefinition[]
    composeModes: (standard: PresetDefinition['plugins'], definitions: PresetDefinition[]) => PresetDefinition[]
  }
  const ctx = await harness()
  try {
    const standard = contribution('standard')
    await declare(ctx, standard)
    const definitions = modes.map(mode => ({ ...mode, plugins: contribution('media_only').plugins }))
    for (const definition of composeModes(standard.plugins, definitions)) await declare(ctx, definition)
    const disposeAlias = ctx.agentPresets.registerAlias('novaflow-modeling', 'standard')
    const ordinary = await agentOn(ctx, 'nova-standard', 'standard')
    const media = await agentOn(ctx, 'nova-media', 'novaflow-media-creation')
    expect(ctx.tools.schemas(ordinary).map(row => row.name)).toEqual(['standard'])
    expect(ctx.tools.schemas(media).map(row => row.name).sort()).toEqual(['media_only', 'standard'])
    expect(ctx.tools.schemas()).toEqual([])
    expect(ctx.agentPresets.defaultId).toBe('standard')
    expect((await ctx.agentPresets.list()).map(row => row.id)).not.toContain('novaflow-modeling')
    expect(await ctx.agentPresets.resolve('novaflow-modeling')).toEqual({ id: 'standard' })
    disposeAlias()
    await expect(ctx.agentPresets.resolve('novaflow-modeling')).rejects.toThrow('Unknown agent preset')
  } finally { await ctx.fiber.dispose() }
})

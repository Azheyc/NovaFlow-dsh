/** Mode additions are visible only to agents selecting that mode, not the global or other mode scope. */
import { expect, it } from 'vitest'
import type { PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry'
import { harness, declare, contribution, agentOn } from '../../../packages/preset/agent-preset-registry/tests/harness.ts'

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
    const definitions = modes.map((mode, index) => ({ ...mode, plugins: contribution(index === 0 ? 'modeling_only' : 'media_only').plugins }))
    for (const definition of composeModes(standard.plugins, definitions)) await declare(ctx, definition)
    const ordinary = await agentOn(ctx, 'nova-standard', 'standard')
    const modeling = await agentOn(ctx, 'nova-modeling', 'novaflow-modeling')
    const media = await agentOn(ctx, 'nova-media', 'novaflow-media-creation')
    expect(ctx.tools.schemas(ordinary).map(row => row.name)).toEqual(['standard'])
    expect(ctx.tools.schemas(modeling).map(row => row.name).sort()).toEqual(['modeling_only', 'standard'])
    expect(ctx.tools.schemas(media).map(row => row.name).sort()).toEqual(['media_only', 'standard'])
    expect(ctx.tools.schemas()).toEqual([])
    expect(ctx.agentPresets.defaultId).toBe('standard')
  } finally { await ctx.fiber.dispose() }
})

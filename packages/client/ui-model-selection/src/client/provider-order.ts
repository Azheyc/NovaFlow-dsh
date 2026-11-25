/** Shared provider display order for the composer and command model pickers. */
import type { ModelProviderGroup } from '@deepseek-ai/dsh-api-session-controller/types'

const families = [/(?:^|[^a-z0-9])(?:gpt|openai|o[134])(?=$|[^a-z])/i,
  /(?:^|[^a-z0-9])(?:claude|anthropic)(?=$|[^a-z])/i, /(?:^|[^a-z0-9])gemini(?=$|[^a-z])/i]

function familyOf(group: ModelProviderGroup): number {
  const named = families.findIndex(pattern => pattern.test(group.name))
  if (named >= 0) return named
  const inferred = families.findIndex(pattern => group.models.some(model => pattern.test(model.id)))
  return inferred < 0 ? families.length : inferred
}

const legacyPriority = (id: string) => id === 'deepseek-account' ? 0 : id === 'deepseek-official' ? 1 : 2

/**
 * Order groups by model family and then account price, with unpriced groups last in each family.
 * @param groups - Provider groups in catalog order.
 * @returns a sorted copy; model order within each group is unchanged.
 */
export function orderModelProviders(groups: readonly ModelProviderGroup[]): ModelProviderGroup[] {
  return groups.map(group => ({ group, family: familyOf(group) }))
    .sort((a, b) => a.family - b.family
      || (a.group.priceMultiplier ?? Infinity) - (b.group.priceMultiplier ?? Infinity)
      || legacyPriority(a.group.id) - legacyPriority(b.group.id))
    .map(entry => entry.group)
}

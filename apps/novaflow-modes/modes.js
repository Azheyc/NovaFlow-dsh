/** Session-scoped additions only: every listed module must be shipped before the mode is exposed. */
export const modes = [
  { id: 'novaflow-modeling', name: '建模模式', description: '用于建模类任务；当前使用标准模式能力，专用插件将在后续版本中加入。', order: 30, plugins: [] },
  { id: 'novaflow-media-creation', name: '自媒体创作模式', description: '用于自媒体创作任务；当前使用标准模式能力，专用插件将在后续版本中加入。', order: 31, plugins: [] },
]

/** Compose standard capabilities with each preset's independently owned additions. */
export function composeModes(standardPlugins, definitions = modes) {
  return definitions.map(mode => ({ ...mode, plugins: [...standardPlugins, ...mode.plugins] }))
}

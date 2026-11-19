import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const skillDirectory = fileURLToPath(new URL('./skills/', import.meta.url)).replace(/([/\\])app\.asar([/\\])/, '$1app.asar.unpacked$2')

export const modes = [
  { id: 'novaflow-modeling', name: '建模模式', description: '用于建模类任务；当前使用标准模式能力，专用插件将在后续版本中加入。', order: 30, plugins: [] },
  { id: 'novaflow-media-creation', name: '内容平台模式', description: '创作故事，提取故事资产，制作角色板、场景参考与电影级分镜。', order: 31, plugins: [
    { id: 'content-platform-skills', name: '@deepseek-ai/dsh-skill-filesystem', config: {
      providerName: 'novaflow-content-platform', includeDefaultRoots: false, watch: false,
      customSkillDirs: [relative(process.cwd(), skillDirectory) || '.'],
    } },
  ] },
]

/** Compose standard capabilities with each preset's independently owned additions. */
export function composeModes(standardPlugins, definitions = modes) {
  return definitions.map(mode => ({ ...mode, plugins: [...standardPlugins, ...mode.plugins] }))
}

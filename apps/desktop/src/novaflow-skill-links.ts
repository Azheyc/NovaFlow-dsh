import { existsSync, lstatSync, mkdirSync, readlinkSync, realpathSync, symlinkSync, unlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const skills = {
  storycraft: '故事创作',
  assetExtractor: '故事资产提取',
  characterBoard: '角色资产板',
  sceneReference: '全能场景',
  cinematicStoryboard: 'S10 电影级分镜',
}

/** Expose the bundled skill directories to the Skills settings scanner under the Desktop profile lock.
 * @param profile - Desktop profile under the active DSH home.
 * @param runtime - Current Desktop runtime, including the NovaFlow modes package.
 */
export function linkNovaFlowSkills(profile: string, runtime: string): void {
  const source = join(runtime, 'node_modules', '@local', 'novaflow-modes', 'skills').replace(/([/\\])app\.asar([/\\])/, '$1app.asar.unpacked$2')
  if (!existsSync(source)) return
  const root = join(dirname(dirname(profile)), 'skills')
  mkdirSync(root, { recursive: true })
  if (!lstatSync(root).isDirectory()) return

  const alias = join(profile, '.novaflow-content-skills')
  const type = process.platform === 'win32' ? 'junction' : 'dir'
  const target = realpathSync(source)
  const existing = lstatSync(alias, { throwIfNoEntry: false })
  if (existing && !existing.isSymbolicLink()) return
  if (!existing || resolve(dirname(alias), readlinkSync(alias)) !== target) {
    if (existing) unlinkSync(alias)
    symlinkSync(target, alias, type)
  }
  for (const [folder, label] of Object.entries(skills)) {
    const link = join(root, label)
    if (!lstatSync(link, { throwIfNoEntry: false }) && existsSync(join(source, folder, 'SKILL.md'))) {
      symlinkSync(join(alias, folder), link, type)
    }
  }
}

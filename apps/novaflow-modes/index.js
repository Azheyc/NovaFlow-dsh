import { fileURLToPath } from 'node:url'
import * as SkillFileSystem from '@deepseek-ai/dsh-skill-filesystem'

const bundledSkillDir = fileURLToPath(new URL('./skills/', import.meta.url)).replace(/([/\\])app\.asar([/\\])/, '$1app.asar.unpacked$2')

export const name = 'novaflow-modes'
export const inject = ['agentPresets', 'skills', 'systemPrompt', 'webServer']
export function apply(ctx) {
  ctx.effect(() => ctx.agentPresets.registerAlias('novaflow-modeling', 'standard'))
  ctx.effect(() => ctx.agentPresets.registerAlias('novaflow-media-creation', 'standard'))
  ctx.plugin(SkillFileSystem, { providerName: 'novaflow-content-platform', includeDefaultRoots: false, watch: false, bundledSkillDir })
  ctx.on('webserver/index-inject', table => {
    table.push({ kind: 'global', name: '__DSH_HIDDEN_PRESET_CHOICES__', value: ['cordis', 'ops-ptc', 'ptc'] })
    table.push({ kind: 'global', name: '__DSH_HIDE_TEAM_MODEL_OPTION__', value: true })
    table.push({ kind: 'global', name: '__DSH_COMPACT_MODEL_PICKER__', value: true })
  })
  ctx.systemPrompt.section({
    name: 'novaflow:client-identity',
    order: ctx.systemPrompt.getSectionOrder('HARNESS_IDENTITY') + 1,
    text: '用户正在 NovaFlow 客户端中与你对话。提及当前应用或会话时，使用「NovaFlow 客户端」或「当前 NovaFlow 客户端会话」，其他语言使用对应的自然表达。DeepSeek Harness（DSH）是底层框架。讲解底层实现、引用文档或给出操作步骤时，保留 `dsh-doc`、`dsh`、包名、命令和路径的原名。',
  })
}

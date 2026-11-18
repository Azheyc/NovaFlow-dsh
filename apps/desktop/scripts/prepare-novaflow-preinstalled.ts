/** Materialize the pinned community plugins at build time, without executing package scripts. */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

/**
 * Prepare a self-contained hoisted dependency tree; no package downloads occur on user startup.
 * @returns Directory copied into the Desktop runtime as novaflow-preinstalled.
 */
export function prepareNovaFlowPreinstalled(): string {
  const desktop = fileURLToPath(new URL('../', import.meta.url))
  const source = join(desktop, 'preinstalled')
  const files = ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml']
  const promptSource = resolve(desktop, '../../plugins/prompt-presets')
  const promptFiles = ['package.json', 'index.js', 'catalog.js', 'cordis.patch.yml', 'README.md']
  const promptManifest = JSON.parse(readFileSync(join(promptSource, 'package.json'), 'utf8')) as { name: string; version: string }
  const hash = createHash('sha256')
  for (const file of files) hash.update(readFileSync(join(source, file)))
  for (const file of [...promptFiles, 'client.jsx', 'style.css']) hash.update(readFileSync(join(promptSource, file)))
  const digest = hash.digest('hex')
  const target = join(desktop, '.desktop-build', 'preinstalled-seeds', digest)
  const promptTarget = join(target, 'node_modules', promptManifest.name)
  const stamp = join(target, '.prepared')
  if (existsSync(stamp) && readFileSync(stamp, 'utf8') === digest && existsSync(join(promptTarget, 'client.js')) && existsSync(join(target, 'node_modules', 'dshmarket', 'package.json'))) return target
  mkdirSync(target, { recursive: true })
  for (const file of files) cpSync(join(source, file), join(target, file))
  const pnpm = fileURLToPath(new URL('../../../node_modules/pnpm/bin/pnpm.mjs', import.meta.url))
  execFileSync(process.execPath, [pnpm, 'install', '--ignore-workspace', '--frozen-lockfile', '--ignore-scripts', '--config.auto-install-peers=false', '--config.node-linker=hoisted', '--config.enable-global-virtual-store=false', '--config.registry=https://registry.npmmirror.com'],
    { cwd: target, stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } })
  mkdirSync(promptTarget, { recursive: true })
  for (const file of promptFiles) cpSync(join(promptSource, file), join(promptTarget, file))
  const client = readFileSync(join(promptSource, 'client.jsx'), 'utf8').replace("'__PROMPT_STYLES__'", () => JSON.stringify(readFileSync(join(promptSource, 'style.css'), 'utf8')))
  writeFileSync(join(promptTarget, 'client.js'), ts.transpileModule(client, { fileName: 'client.jsx', compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, allowJs: true } }).outputText)
  const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
  manifest.dependencies[promptManifest.name] = promptManifest.version
  writeFileSync(join(target, 'package.json'), JSON.stringify(manifest, null, 2))
  writeFileSync(stamp, digest)
  return target
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) prepareNovaFlowPreinstalled()

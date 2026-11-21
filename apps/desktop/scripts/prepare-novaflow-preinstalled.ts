/** Materialize the pinned community plugins at build time, without executing package scripts. */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { imBundle, novaFlowMediaDesk } from '../src/novaflow-preinstalled.ts'

function prepareLocalMediaDesk(target: string, source: string): string {
  const local = join(target, 'node_modules', novaFlowMediaDesk)
  const checkout = join(source, 'media-desk', 'source')
  for (const file of ['package.json', 'cordis.patch.yml', 'src', 'assets', 'LICENSE', 'README.md', 'README.zh.md']) {
    cpSync(join(checkout, file), join(local, file), { recursive: true })
  }
  execFileSync(process.execPath, [join(checkout, 'scripts', 'build.mjs'), join(local, 'dist', 'client.js')], { cwd: checkout, stdio: 'inherit' })
  const manifest = JSON.parse(readFileSync(join(local, 'package.json'), 'utf8')) as { version: string }
  return manifest.version
}

function includeLocalDependencies(target: string, name: string, extra: string[] = []): void {
  const modules = join(target, 'node_modules')
  const plugin = join(modules, name)
  const dependencies = new Set<string>()
  const visit = (importer: string): void => {
    const manifest = JSON.parse(readFileSync(join(importer, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
    }
    for (const child of Object.keys(manifest.dependencies ?? {})) collect(child, importer)
    for (const child of Object.keys(manifest.optionalDependencies ?? {})) collect(child, importer, true)
  }
  const collect = (name: string, importer: string, optional = false): void => {
    const search = createRequire(join(importer, 'package.json')).resolve.paths(name) ?? []
    const directory = search.map(path => join(path, name)).find(path =>
      path.startsWith(`${modules}${sep}`) && existsSync(join(path, 'package.json')))
    if (!directory) {
      if (optional) return
      throw new Error(`Desktop plugin dependency ${name} is missing from the seed (${importer})`)
    }
    if (dependencies.has(directory)) return
    dependencies.add(directory)
    visit(directory)
  }
  visit(plugin)
  for (const name of extra) collect(name, plugin)
  for (const directory of [...dependencies].sort()) {
    if (directory.startsWith(`${plugin}${sep}`)) continue
    const nested = join(plugin, 'node_modules', relative(modules, directory))
    if (!existsSync(nested)) cpSync(directory, nested, { recursive: true, dereference: true })
  }
}

function prepareLocalIm(target: string): void {
  const entry = join(target, 'node_modules', imBundle, 'lib', 'client.js')
  let client = readFileSync(entry, 'utf8')
  const replace = (original: string | RegExp, replacement: string): void => {
    const patched = client.replace(original, () => replacement)
    if (patched === client) throw new Error(`Cannot apply the NovaFlow DSH-IM client change: ${original}`)
    client = patched
  }
  replace(/^  const githubTooltipId = .*;\n/m, '')
  const updatePanel = new RegExp(
    String.raw`^          h2\(UpdatePanel, \{\n[\s\S]*?^          h2\(\n`
    + String.raw`            "span",\n            \{ className: "dim-generalSettingsAction" \}`,
    'm',
  )
  replace(updatePanel, '          h2(\n            "span",\n            { className: "dim-generalSettingsAction" }')
  replace('sidebarVisible = false', 'sidebarVisible = true')
  replace(/  ctx\.effect\(\(\) => \{\n    sidebarSync = installSidebarVisibilitySync\([\s\S]*?\n  \}, "im-settings: sidebar visibility"\);\n/, '')
  replace('  let sidebarSync;\n', '')
  replace('      const dsBotRead = channel7 === DELIVERY_RPC_CHANNEL && endpoint === "ds-bot.status";\n', '')
  replace(
    '      if (endpoint === SIDEBAR_SETTINGS_ENDPOINTS.set) sidebarSync?.apply(result2);\n'
    + '      else if (!dsBotRead && endpoint !== SIDEBAR_SETTINGS_ENDPOINTS.get) sidebarSync?.refresh();\n',
    '',
  )
  replace('h2(SidebarSettings, { rpcCall }), h2(GroupHistorySettings, { rpcCall })', 'h2(GroupHistorySettings, { rpcCall })')
  replace(String.raw`pageCtx.locale.bind(IM_LOCALE_NAMESPACE)("IM\u673A\u5668\u4EBA")`, 'pageCtx.locale.bind(IM_LOCALE_NAMESPACE)("连接手机")')
  replace(String.raw`"IM\u673A\u5668\u4EBA": "IM bots",`, '"连接手机": "Connect phone",\n  "IM机器人": "IM bots",')
  replace(/"\\u8BA9 DeepSeek Harness \\u89E6\\u624B\\u53EF\\u53CA"/g, '"让NovaFlow触手可及"')
  replace('"让NovaFlow触手可及": "Connecting DeepSeek Harness",', '"让NovaFlow触手可及": "NovaFlow at your fingertips",')
  replace('"让NovaFlow触手可及": "DeepSeek Harness ', '"让NovaFlow触手可及": "NovaFlow ')
  replace(/  const \[runningVersion, setRunningVersion\] = .*;\n/, '  const runningVersion = IM_PLUGIN_VERSION;\n')
  replace(/  const reportUpdateStatus = [^\n]+\n    setRunningVersion\(snapshot.runningVersion\);\n  \}, \[\]\);\n/, '')
  writeFileSync(entry, client)
  includeLocalDependencies(target, imBundle)
}

/**
 * Prepare a self-contained hoisted dependency tree; no package downloads occur on user startup.
 * @returns Directory copied into the Desktop runtime as novaflow-preinstalled.
 */
export function prepareNovaFlowPreinstalled(): string {
  const desktop = fileURLToPath(new URL('../', import.meta.url))
  const source = join(desktop, 'preinstalled')
  const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
  const marketPatch = `patches/dshmarket@${manifest.dependencies.dshmarket}.patch`
  const files = ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', marketPatch]
  const promptSource = resolve(desktop, '../../plugins/prompt-presets')
  const promptFiles = ['package.json', 'index.js', 'catalog.js', 'cordis.patch.yml', 'README.md']
  const promptManifest = JSON.parse(readFileSync(join(promptSource, 'package.json'), 'utf8')) as { name: string; version: string }
  const hash = createHash('sha256').update(readFileSync(import.meta.filename))
  for (const file of files) hash.update(readFileSync(join(source, file)))
  const deskSource = join(source, 'media-desk', 'source')
  for (const item of ['assets', 'client', 'src', 'scripts', 'LICENSE', 'README.md', 'package.json', 'cordis.patch.yml']) {
    const path = join(deskSource, item)
    const entries = lstatSync(path).isDirectory() ? readdirSync(path, { recursive: true, encoding: 'utf8' }).sort().map(name => join(path, name)) : [path]
    for (const file of entries) if (lstatSync(file).isFile()) hash.update(relative(deskSource, file)).update(readFileSync(file))
  }
  for (const file of [...promptFiles, 'client.jsx', 'style.css']) hash.update(readFileSync(join(promptSource, file)))
  hash.update(novaFlowMediaDesk)
  const digest = hash.digest('hex')
  const cache = join(desktop, '.desktop-build', 'preinstalled-seeds')
  const completed = join(cache, digest)
  const stamp = 'market-build.sha256'
  const ready = () => existsSync(join(completed, stamp)) && readFileSync(join(completed, stamp), 'utf8') === digest
  if (ready()) return completed
  mkdirSync(cache, { recursive: true })
  const target = mkdtempSync(join(cache, '.building-'))
  const promptTarget = join(target, 'node_modules', promptManifest.name)
  try {
    mkdirSync(join(target, 'patches'), { recursive: true })
    for (const file of files) cpSync(join(source, file), join(target, file))
    const pnpm = fileURLToPath(new URL('../../../node_modules/pnpm/bin/pnpm.mjs', import.meta.url))
    execFileSync(process.execPath, [pnpm, 'install', '--frozen-lockfile', '--ignore-scripts', '--config.registry=https://registry.npmjs.org'],
      { cwd: target, stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } })
    includeLocalDependencies(target, 'dshmarket', ['@deepseek-ai/schemastery'])
    prepareLocalIm(target)
    manifest.dependencies[novaFlowMediaDesk] = prepareLocalMediaDesk(target, source)
    mkdirSync(promptTarget, { recursive: true })
    for (const file of promptFiles) cpSync(join(promptSource, file), join(promptTarget, file))
    const client = readFileSync(join(promptSource, 'client.jsx'), 'utf8').replace("'__PROMPT_STYLES__'", () => JSON.stringify(readFileSync(join(promptSource, 'style.css'), 'utf8')))
    writeFileSync(join(promptTarget, 'client.js'), ts.transpileModule(client, { fileName: 'client.jsx', compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, allowJs: true } }).outputText)
    manifest.dependencies[promptManifest.name] = promptManifest.version
    writeFileSync(join(target, 'package.json'), JSON.stringify(manifest, null, 2))
    writeFileSync(join(target, stamp), digest)
    try { renameSync(target, completed) }
    catch (error) { if (!ready()) throw error }
    return completed
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
}

/**
 * Refresh the preinstalled resources of an existing development project.
 * @param project - Disposable development runtime directory, separate from the user profile.
 * @returns Once the current seed is installed in the development project.
 */
export async function syncDevelopmentPreinstalled(project: string): Promise<void> {
  if (!existsSync(join(project, 'desktop-runtime.json'))) throw new Error(`Desktop development project is missing at ${project}`)
  const destination = join(project, 'novaflow-preinstalled')
  await withFileLock(destination, async () => {
    const seed = prepareNovaFlowPreinstalled()
    const stamp = 'market-build.sha256'
    const existingStamp = join(destination, stamp)
    if (existsSync(existingStamp) && readFileSync(existingStamp, 'utf8') === readFileSync(join(seed, stamp), 'utf8')
      && existsSync(join(destination, 'node_modules', 'dshmarket', 'client', 'client.js'))
      && existsSync(join(destination, 'node_modules', imBundle, 'lib', 'client.js'))
      && existsSync(join(destination, 'node_modules', novaFlowMediaDesk, 'dist', 'client.js'))) return
    const staging = mkdtempSync(join(project, '.novaflow-preinstalled-'))
    const replacement = join(staging, 'next')
    const backup = join(staging, 'previous')
    try {
      cpSync(seed, replacement, { recursive: true, dereference: true })
      const replacing = lstatSync(destination, { throwIfNoEntry: false }) !== undefined
      if (replacing) renameSync(destination, backup)
      try { renameSync(replacement, destination) }
      catch (error) {
        if (replacing) renameSync(backup, destination)
        throw error
      }
      rmSync(backup, { recursive: true, force: true })
    } finally {
      if (!existsSync(backup)) rmSync(staging, { recursive: true, force: true })
    }
  })
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) {
  const project = process.argv[2]
  if (project === undefined) prepareNovaFlowPreinstalled()
  else await syncDevelopmentPreinstalled(resolve(project))
}

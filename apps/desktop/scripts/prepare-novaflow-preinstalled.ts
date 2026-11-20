/** Materialize the pinned community plugins at build time, without executing package scripts. */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'

function prepareLocalMarket(target: string): void {
  const market = join(target, 'node_modules', 'dshmarket')
  const dependencies = new Map<string, string>()
  const collect = (name: string, importer: string): void => {
    const search = createRequire(join(importer, 'package.json')).resolve.paths(name) ?? []
    const directory = search.map(path => join(path, name)).find(path =>
      path.startsWith(`${target}${sep}`) && existsSync(join(path, 'package.json')))
    if (!directory) throw new Error(`Desktop market dependency ${name} is missing from the seed`)
    const previous = dependencies.get(name)
    if (previous === directory) return
    if (previous !== undefined) throw new Error(`Desktop market depends on multiple copies of ${name}`)
    dependencies.set(name, directory)
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> }
    for (const child of Object.keys(manifest.dependencies ?? {})) collect(child, directory)
  }
  const manifest = JSON.parse(readFileSync(join(market, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
  for (const name of [...Object.keys(manifest.dependencies), '@deepseek-ai/schemastery']) collect(name, market)
  for (const [name, directory] of dependencies) {
    const nested = join(market, 'node_modules', name)
    if (nested !== directory) cpSync(directory, nested, { recursive: true, dereference: true })
  }
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
  for (const file of [...promptFiles, 'client.jsx', 'style.css']) hash.update(readFileSync(join(promptSource, file)))
  const digest = hash.digest('hex')
  const target = join(desktop, '.desktop-build', 'preinstalled-seeds', digest)
  const promptTarget = join(target, 'node_modules', promptManifest.name)
  const stamp = join(target, 'market-build.sha256')
  if (existsSync(stamp) && readFileSync(stamp, 'utf8') === digest && existsSync(join(promptTarget, 'client.js')) && existsSync(join(target, 'node_modules', 'dshmarket', 'package.json'))) return target
  mkdirSync(join(target, 'patches'), { recursive: true })
  for (const file of files) cpSync(join(source, file), join(target, file))
  const pnpm = fileURLToPath(new URL('../../../node_modules/pnpm/bin/pnpm.mjs', import.meta.url))
  execFileSync(process.execPath, [pnpm, 'install', '--frozen-lockfile', '--ignore-scripts', '--config.registry=https://registry.npmjs.org'],
    { cwd: target, stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } })
  prepareLocalMarket(target)
  mkdirSync(promptTarget, { recursive: true })
  for (const file of promptFiles) cpSync(join(promptSource, file), join(promptTarget, file))
  const client = readFileSync(join(promptSource, 'client.jsx'), 'utf8').replace("'__PROMPT_STYLES__'", () => JSON.stringify(readFileSync(join(promptSource, 'style.css'), 'utf8')))
  writeFileSync(join(promptTarget, 'client.js'), ts.transpileModule(client, { fileName: 'client.jsx', compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, allowJs: true } }).outputText)
  manifest.dependencies[promptManifest.name] = promptManifest.version
  writeFileSync(join(target, 'package.json'), JSON.stringify(manifest, null, 2))
  writeFileSync(stamp, digest)
  return target
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
      && existsSync(join(destination, 'node_modules', 'dshmarket', 'client', 'client.js'))) return
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

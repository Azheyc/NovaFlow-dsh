/** Compare release pins to the npm latest tag without changing customized plugins. */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseDocument, isMap, isSeq } from 'yaml'

const source = resolve(import.meta.dirname, '../preinstalled')
const registry = 'https://registry.npmjs.org'
const customized = new Set(['dshmarket', '@xmanrui/dsh-im', 'dsh-media-desk', 'ds-bot', 'dsh-auto-memory'])

/** Compare all registry plugins and optionally refresh only unmodified package pins and their lockfile. */
export async function checkNovaFlowPluginVersions(refresh = false): Promise<void> {
  const manifestPath = join(source, 'package.json')
  const workspacePath = join(source, 'pnpm-workspace.yaml')
  const lockPath = join(source, 'pnpm-lock.yaml')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { dependencies: Record<string, string> }
  const workbench = JSON.parse(readFileSync(join(source, 'media-desk/source/package.json'), 'utf8')) as { version: string }
  const pinned = { ...manifest.dependencies, 'dsh-media-desk': workbench.version.split('+')[0]! }
  const versions = await Promise.all(Object.entries(pinned).map(async ([name, current]) => {
    const response = await fetch(`${registry}/${encodeURIComponent(name)}/latest`, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`${name}: npm returned ${response.status}`)
    const { version } = await response.json() as { version: string }
    if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$/.test(version)) throw new Error(`${name}: invalid npm version`)
    return { name, current, version }
  }))
  const updates = versions.filter(row => row.version !== row.current)
  for (const row of updates) console.log(`${row.name} ${row.current} → ${row.version}${customized.has(row.name) ? ' (local fork: assess upstream and request approval before merging)' : ''}`)
  const plain = updates.filter(row => !customized.has(row.name))
  if (!plain.length) return
  if (!refresh) throw new Error('Update the unmodified NovaFlow plugins before packaging: run check-novaflow-plugin-versions.ts --refresh and commit the resulting pins and lockfile.')
  const originals = [manifestPath, workspacePath, lockPath].map(path => ({ path, data: readFileSync(path) }))
  const workspace = parseDocument(readFileSync(workspacePath, 'utf8'))
  const excludes = workspace.get('minimumReleaseAgeExclude')
  if (!isSeq(excludes)) throw new Error('Cannot read the exact release-age exceptions')
  for (const { name, version } of plain) {
    manifest.dependencies[name] = version
    if (!excludes.items.some(item => String(item) === `${name}@${version}`)) excludes.add(`${name}@${version}`)
  }
  try {
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    writeFileSync(workspacePath, String(workspace))
    execFileSync(process.execPath, [resolve(source, '../../../node_modules/pnpm/bin/pnpm.mjs'), 'install', '--lockfile-only', '--ignore-scripts', `--config.registry=${registry}`], { cwd: source, stdio: 'inherit' })
    const packages = parseDocument(readFileSync(lockPath, 'utf8')).get('packages', true)
    for (const { name, current } of plain) {
      const previous = `${name}@${current}`
      if (isMap(packages) && packages.has(previous)) continue
      const index = excludes.items.findIndex(item => String(item) === previous)
      if (index >= 0) excludes.delete(index)
    }
    writeFileSync(workspacePath, String(workspace))
  } catch (error) {
    for (const file of originals) writeFileSync(file.path, file.data)
    throw error
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await checkNovaFlowPluginVersions(process.argv.includes('--refresh'))

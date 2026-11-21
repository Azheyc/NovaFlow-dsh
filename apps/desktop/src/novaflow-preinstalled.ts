/** Offline community-plugin seeding and the desktop-owned market installation. */
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync, renameSync, statSync, symlinkSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { isMap, isSeq, parseDocument } from 'yaml'

const exaBundle = '@tonydua/dsh-web-search-exa'
const officialExaBundle = '@deepseek-ai/dsh-web-search-exa'
const market = 'dshmarket'
const promptPresets = 'novaflow-dsh-prompt-presets'
/** Package identity retained by the desktop-managed IM bundle. */
export const imBundle = '@xmanrui/dsh-im'
/** Package identity of the desktop-owned content workbench. */
export const novaFlowMediaDesk = 'novaflow-media-desk'
/** Upstream package identity used to build and migrate the content workbench. */
export const upstreamMediaDesk = 'dsh-media-desk'
const promptLocation = `.novaflow-bundled/${promptPresets}`
const promptSpec = `link:./${promptLocation}`
/** Electron can read ASAR directories but cannot pass them to the native recursive copy operation. */
function copySeedDirectory(source: string, destination: string): void {
  mkdirSync(destination, { recursive: true })
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name), to = join(destination, entry.name)
    if (entry.isDirectory()) copySeedDirectory(from, to)
    else writeFileSync(to, readFileSync(from), { mode: statSync(from).mode })
  }
}

function placeSeedDirectory(source: string, destination: string): void {
  mkdirSync(dirname(destination), { recursive: true })
  const staging = mkdtempSync(join(dirname(destination), '.novaflow-seed-'))
  try {
    copySeedDirectory(source, staging)
    renameSync(staging, destination)
  } finally { rmSync(staging, { recursive: true, force: true }) }
}

/** Point the profile at a complete copy of the package from the current desktop seed. */
function prepareBundledPackage(profile: string, seed: string, name: string): string {
  const build = readFileSync(join(seed, 'market-build.sha256'), 'utf8')
  if (!/^[a-f0-9]{64}$/.test(build)) throw new Error('Invalid NovaFlow seed identity')
  const location = `.novaflow-bundled/${name}/${build}`
  const local = join(profile, location)
  const installed = join(profile, 'node_modules', name)
  if (!existsSync(local)) placeSeedDirectory(join(seed, 'node_modules', name), local)
  mkdirSync(dirname(installed), { recursive: true })
  const existing = lstatSync(installed, { throwIfNoEntry: false })
  if (existing?.isSymbolicLink() && existsSync(installed) && realpathSync(installed) === realpathSync(local)) return `link:./${location}`
  const staging = mkdtempSync(join(dirname(installed), '.novaflow-package-'))
  const backup = join(staging, basename(installed))
  if (existing !== undefined) renameSync(installed, backup)
  try {
    symlinkSync(local, installed, process.platform === 'win32' ? 'junction' : 'dir')
  } catch (error) {
    if (existing !== undefined) renameSync(backup, installed)
    throw error
  }
  rmSync(staging, { recursive: true, force: true })
  return `link:./${location}`
}

function seedExaSearchDefault(profile: string): void {
  const patch = join(profile, 'cordis.patch.yml')
  const document = parseDocument(existsSync(patch) ? readFileSync(patch, 'utf8') : '[]\n', {
    customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (value: string) => value }],
  })
  const error = document.errors[0]
  if (error) throw error
  if (!isSeq(document.contents)) throw new Error('Desktop profile patch must be a YAML sequence')
  const rows = document.contents.items.flatMap(row => isMap(row) ? [row] : [])
  const webRows = rows.filter(row => row.getIn(['id']) === 'web'
    && (!row.has('name') || row.getIn(['name']) === '@deepseek-ai/dsh-web'))
  const exaRows = rows.filter(row => row.getIn(['id']) === 'web-search-exa')
  if (exaRows.some(row => (row.has('disabled') && row.getIn(['disabled']) !== false)
    || (row.has('config') && !isMap(row.get('config', true)))
    || (row.hasIn(['config', 'providerId']) && row.getIn(['config', 'providerId']) !== 'exa'))) return
  if (webRows.some(row => row.has('config') && (!isMap(row.get('config', true)) || row.hasIn(['config', 'searchProvider'])))) return
  const web = webRows.findLast(row => row.has('config'))
  if (web === undefined) document.add({ id: 'web', config: { searchProvider: 'exa', fetchProvider: 'http' } })
  else web.setIn(['config', 'searchProvider'], 'exa')
  const temporary = `${patch}.novaflow-tmp`
  writeFileSync(temporary, String(document), { mode: 0o600 })
  renameSync(temporary, patch)
}

/**
 * Copy absent shipped packages and record that this profile has received its initial plugin set.
 * Preserve package choices and refresh desktop-managed packages.
 * @param profile - Mutable Desktop plugin profile, under the caller's profile lock.
 * @param runtime - Immutable Desktop runtime containing the prepared seed.
 * @param fresh - Whether this profile was created by this launch.
 */
export function seedNovaFlowPlugins(profile: string, runtime: string, fresh: boolean): void {
  const seed = join(runtime, 'novaflow-preinstalled')
  const marker = join(profile, '.novaflow-preinstalled-v1.json')
  if (!existsSync(seed)) return
  const seeded = JSON.parse(readFileSync(join(seed, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
  const recorded = existsSync(marker)
    ? (JSON.parse(readFileSync(marker, 'utf8')) as { packages: Record<string, string> }).packages
    : {}
  const pending = Object.entries(seeded.dependencies).filter(([name]) => !Object.hasOwn(recorded, name))
  const manifestPath = join(profile, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    dependencies?: Record<string, string>
    dsh: { profile: { bundles: string[] } }
  }
  const dependencies = manifest.dependencies ??= {}
  const bundles = manifest.dsh.profile.bundles
  const promptVersion = seeded.dependencies[promptPresets]
  const missing = new Map(pending.filter(([name]) => !Object.hasOwn(dependencies, name)))
  if (bundles.includes(officialExaBundle)) missing.delete(exaBundle)
  const existingPrompt = dependencies[promptPresets]
  const useBundledPrompt = promptVersion !== undefined && (missing.has(promptPresets)
    || existingPrompt === promptSpec
    || (existingPrompt?.startsWith(`${promptSpec}/`) && /^[a-f0-9]{64}$/.test(existingPrompt.slice(promptSpec.length + 1)))
    || (existingPrompt !== undefined && recorded[promptPresets] === existingPrompt))
  const nextPromptSpec = useBundledPrompt ? prepareBundledPackage(profile, seed, promptPresets) : existingPrompt
  const existingMarket = dependencies[market]
  const marketSpec = seeded.dependencies[market] !== undefined && (missing.has(market) || existingMarket !== undefined)
    ? prepareBundledPackage(profile, seed, market)
    : existingMarket
  const existingDesk = dependencies[novaFlowMediaDesk]
  const existingIm = dependencies[imBundle]
  const imSpec = seeded.dependencies[imBundle] !== undefined && (missing.has(imBundle) || existingIm !== undefined)
    ? prepareBundledPackage(profile, seed, imBundle)
    : existingIm
  const migrateDesk = seeded.dependencies[novaFlowMediaDesk] !== undefined && Object.hasOwn(dependencies, upstreamMediaDesk)
    && (existingDesk !== undefined || missing.has(novaFlowMediaDesk))
  const deskSpec = seeded.dependencies[novaFlowMediaDesk] !== undefined && (missing.has(novaFlowMediaDesk) || existingDesk !== undefined)
    ? prepareBundledPackage(profile, seed, novaFlowMediaDesk)
    : existingDesk
  if (pending.length === 0 && nextPromptSpec === existingPrompt && marketSpec === existingMarket
    && deskSpec === existingDesk && imSpec === existingIm && !migrateDesk) return
  const modules = join(profile, 'node_modules')
  mkdirSync(modules, { recursive: true })
  const names = missing.size === 0 ? [] : readdirSync(join(seed, 'node_modules'), { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.')) return []
    return entry.name.startsWith('@')
      ? readdirSync(join(seed, 'node_modules', entry.name)).map(name => `${entry.name}/${name}`)
      : [entry.name]
  })
  // Never merge into an existing package: its files must all belong to the same version.
  for (const name of names) {
    if (name === promptPresets || name === market || name === novaFlowMediaDesk || name === imBundle) continue
    if (Object.hasOwn(seeded.dependencies, name) && !missing.has(name)) continue
    const destination = join(modules, name)
    if (!existsSync(destination)) placeSeedDirectory(join(seed, 'node_modules', name), destination)
  }
  for (const [name, version] of missing) {
    dependencies[name] = version
    if (!bundles.includes(name) && !(migrateDesk && name === novaFlowMediaDesk)) bundles.push(name)
  }
  if (pending.some(([name]) => name === exaBundle) && bundles.includes(exaBundle) && !bundles.includes(officialExaBundle)) {
    seedExaSearchDefault(profile)
  }
  if (nextPromptSpec !== undefined) dependencies[promptPresets] = nextPromptSpec
  if (marketSpec !== undefined) dependencies[market] = marketSpec
  if (deskSpec !== undefined) dependencies[novaFlowMediaDesk] = deskSpec
  if (imSpec !== undefined) dependencies[imBundle] = imSpec
  if (migrateDesk) {
    delete dependencies['dsh-media-desk']
    manifest.dsh.profile.bundles = [...new Set(bundles.map(name => name === upstreamMediaDesk ? novaFlowMediaDesk : name))]
  }
  const temporary = `${manifestPath}.novaflow-tmp`
  writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`)
  renameSync(temporary, manifestPath)
  if (pending.length === 0) return
  const guide = join(profile, '.novaflow-mode-guide.json')
  if (!existsSync(guide)) writeFileSync(guide, JSON.stringify({ version: 1, seen: !fresh }))
  const temporaryMarker = `${marker}.tmp`
  const packages = Object.fromEntries(pending)
  writeFileSync(temporaryMarker, JSON.stringify({ version: 1, packages: { ...recorded, ...packages } }))
  renameSync(temporaryMarker, marker)
}

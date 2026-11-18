/** One-time offline community-plugin seeding; subsequent management remains profile-owned. */
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, renameSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

const promptPresets = 'novaflow-dsh-prompt-presets'
const promptLocation = `.novaflow-bundled/${promptPresets}`
const promptSpec = `link:./${promptLocation}`
const originalPromptCatalog = {
  'index.js': ['b55fd26111ddac8a9f914f8822bb2484234205a0a0120ce31fd52d5b6b0cf686'],
  'catalog.js': ['c0342e00ecc775c68d95483869c724fee37a9e913f875d4a7dd3a44ce3ec3f3f'],
}
const originalPromptClient = {
  'client.js': [
    '944740e50de5b579a9d393c7cb676c56fd4a3163fa63a0cbacfd8d6d9fbae99a',
    '1c4797184a4653f35193eaac812f14265fffc3ffdd12a7c4aeec2082cdd843aa',
    'c09ad42666f1a59de36a8604dd786778d68b25d4da779640a9b5eed042348030',
  ],
}

/** Refresh a set of files only when they match known bundled versions. */
function refreshPromptFiles(bundled: string, installed: string, originals: Record<string, string[]>): void {
  const files = []
  for (const [name, hashes] of Object.entries(originals)) {
    const path = join(installed, name)
    const stat = lstatSync(path, { throwIfNoEntry: false })
    if (!stat?.isFile()) return
    const current = readFileSync(path)
    const next = readFileSync(join(bundled, name))
    if (current.equals(next)) continue
    if (!hashes.includes(createHash('sha256').update(current).digest('hex'))) return
    files.push({ path, next, mode: stat.mode })
  }
  // The reader accepts either catalog so a restart can finish an interrupted refresh.
  for (const { path, next, mode } of files) {
    const temporary = `${path}.${randomUUID()}.tmp`
    try {
      writeFileSync(temporary, next, { mode, flag: 'wx' })
      renameSync(temporary, path)
    } finally { rmSync(temporary, { force: true }) }
  }
}

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

/** Keep the private package resolvable when pnpm reprocesses the profile's dependencies. */
function preparePromptPackage(profile: string, bundled: string): void {
  const local = join(profile, promptLocation)
  const installed = join(profile, 'node_modules', promptPresets)
  const existing = lstatSync(installed, { throwIfNoEntry: false })
  const refresh = (directory: string): void => {
    refreshPromptFiles(bundled, directory, originalPromptCatalog)
    refreshPromptFiles(bundled, directory, originalPromptClient)
  }
  if (!existsSync(local)) {
    placeSeedDirectory(existing?.isDirectory() ? installed : bundled, local)
  }
  refresh(local)
  // The Host boots offline before pnpm has created a link on a fresh profile.
  if (existing === undefined) placeSeedDirectory(local, installed)
  else if (existing.isDirectory()) refresh(installed)
}

/**
 * Copy absent shipped packages and record that this profile has received its initial plugin set.
 * Preserve package choices and refresh known bundled prompt preset files in place.
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
  const existingPrompt = dependencies[promptPresets]
  const useBundledPrompt = promptVersion !== undefined && (missing.has(promptPresets)
    || existingPrompt === promptSpec
    || (recorded[promptPresets] === promptVersion && existingPrompt === promptVersion))
  if (useBundledPrompt) preparePromptPackage(profile, join(seed, 'node_modules', promptPresets))
  const migratePromptSpec = useBundledPrompt && existingPrompt !== promptSpec
  if (pending.length === 0 && !migratePromptSpec) return
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
    if (name === promptPresets) continue
    if (Object.hasOwn(seeded.dependencies, name) && !missing.has(name)) continue
    const destination = join(modules, name)
    if (!existsSync(destination)) placeSeedDirectory(join(seed, 'node_modules', name), destination)
  }
  for (const [name, version] of missing) {
    dependencies[name] = version
    if (!bundles.includes(name)) bundles.push(name)
  }
  if (migratePromptSpec) dependencies[promptPresets] = promptSpec
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

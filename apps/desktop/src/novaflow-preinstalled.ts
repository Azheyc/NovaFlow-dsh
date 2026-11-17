/** One-time offline community-plugin seeding; subsequent management remains profile-owned. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, renameSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Electron can read ASAR directories but cannot pass them to the native recursive copy operation. */
function copySeedDirectory(source: string, destination: string): void {
  mkdirSync(destination, { recursive: true })
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name), to = join(destination, entry.name)
    if (entry.isDirectory()) copySeedDirectory(from, to)
    else writeFileSync(to, readFileSync(from), { mode: statSync(from).mode })
  }
}

/**
 * Copy absent shipped packages and record that this profile has received its initial plugin set.
 * Existing package versions, disabled bundles and user configuration win over the seed.
 * @param profile - Mutable Desktop plugin profile, under the caller's profile lock.
 * @param runtime - Immutable Desktop runtime containing the prepared seed.
 * @param fresh - Whether this profile was created by this launch.
 */
export function seedNovaFlowPlugins(profile: string, runtime: string, fresh: boolean): void {
  const seed = join(runtime, 'novaflow-preinstalled')
  const marker = join(profile, '.novaflow-preinstalled-v1.json')
  if (existsSync(marker) || !existsSync(seed)) return
  const manifestPath = join(profile, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    dependencies?: Record<string, string>
    dsh: { profile: { bundles: string[] } }
  }
  const seeded = JSON.parse(readFileSync(join(seed, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
  const dependencies = manifest.dependencies ??= {}
  const bundles = manifest.dsh.profile.bundles
  const modules = join(profile, 'node_modules')
  mkdirSync(modules, { recursive: true })
  const names = readdirSync(join(seed, 'node_modules'), { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.')) return []
    return entry.name.startsWith('@')
      ? readdirSync(join(seed, 'node_modules', entry.name)).map(name => `${entry.name}/${name}`)
      : [entry.name]
  })
  // Never merge into an existing package: its files must all belong to the same version.
  for (const name of names) {
    const destination = join(modules, name)
    if (!existsSync(destination)) {
      mkdirSync(dirname(destination), { recursive: true })
      const staging = mkdtempSync(join(dirname(destination), '.novaflow-seed-'))
      copySeedDirectory(join(seed, 'node_modules', name), staging)
      renameSync(staging, destination)
    }
  }
  for (const [name, version] of Object.entries(seeded.dependencies)) {
    if (dependencies[name] !== undefined) continue
    dependencies[name] = version
    if (!bundles.includes(name)) bundles.push(name)
  }
  const temporary = `${manifestPath}.novaflow-tmp`
  writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`)
  renameSync(temporary, manifestPath)
  const guide = join(profile, '.novaflow-mode-guide.json')
  if (!existsSync(guide)) writeFileSync(guide, JSON.stringify({ version: 1, seen: !fresh }))
  writeFileSync(marker, JSON.stringify({ version: 1, packages: seeded.dependencies }))
}

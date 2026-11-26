/** Write platform feeds and checksums beside a completed NovaFlow release build. */
import { createReadStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import yaml from 'js-yaml'
import { valid } from 'semver'

const [directory, version, notesFile] = process.argv.slice(2)
if (!directory || !version || !valid(version) || !notesFile) throw new Error('Usage: node prepare-novaflow-release.mjs <artifact-directory> <version> <release-notes-file>')
const releaseNotes = readFileSync(notesFile, 'utf8').trim()
if (!releaseNotes) throw new Error('Release notes are empty')
const root = resolve(directory)
const publicUpdates = new Set([`NovaFlow-${version}-win-x64.exe`, `NovaFlow-${version}-mac-arm64.zip`])
const updates = readdirSync(root).filter(name => publicUpdates.has(name))
if (updates.length !== 1) throw new Error('Expected one NovaFlow platform update package with the public filename for the selected version')
const update = updates[0]
const mac = update.endsWith('.zip')
const assets = [update, `${update}.blockmap`]
if (mac) {
  const dmg = update.replace(/\.zip$/, '.dmg')
  assets.push(dmg)
  if (existsSync(join(root, `${dmg}.blockmap`))) assets.push(`${dmg}.blockmap`)
}
async function hash(name, algorithm, format) {
  const digest = createHash(algorithm)
  for await (const chunk of createReadStream(join(root, name))) digest.update(chunk)
  return digest.digest(format)
}
const files = await Promise.all(assets.filter(name => !name.endsWith('.blockmap')).map(async name => ({
  url: `https://gh-proxy.com/https://github.com/Azheyc/NovaFlow-dsh/releases/download/v${version}/${encodeURIComponent(name)}`,
  sha512: await hash(name, 'sha512', 'base64'), size: statSync(join(root, name)).size,
})))
const feed = yaml.dump({ version, files, path: files[0].url, sha512: files[0].sha512, releaseNotes, releaseDate: new Date().toISOString() })
for (const channel of ['stable', 'nightly']) {
  const name = `${channel}${mac ? '-mac' : ''}.yml`
  writeFileSync(join(root, name), feed)
  assets.push(name)
}
const checksums = await Promise.all(assets.map(async name => `${await hash(name, 'sha256', 'hex')}  ${name}\n`))
writeFileSync(join(root, 'SHA256SUMS'), checksums.join(''))
console.log(JSON.stringify({version, assets:[...assets, 'SHA256SUMS']}))

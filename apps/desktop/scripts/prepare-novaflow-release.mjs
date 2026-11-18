/** Write platform feeds and checksums beside a completed NovaFlow release build. */
import { createReadStream, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import yaml from 'js-yaml'
import { valid } from 'semver'

const [directory, version] = process.argv.slice(2)
if (!directory || !version || !valid(version)) throw new Error('Usage: node prepare-novaflow-release.mjs <artifact-directory> <version>')
const root = resolve(directory)
const files = readdirSync(root).filter(name => name.startsWith(`NovaFlow-${version}-`))
const updates = files.filter(name => name.endsWith('.exe') || name.endsWith('.zip'))
if (updates.length !== 1) throw new Error('Expected one platform update package for the selected version')
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
const url = `https://gh-proxy.com/https://github.com/Azheyc/NovaFlow-dsh/releases/download/v${version}/${encodeURIComponent(update)}`
const sha512 = await hash(update, 'sha512', 'base64')
const feed = yaml.dump({ version, files: [{ url, sha512, size: statSync(join(root, update)).size }], path: url, sha512, releaseDate: new Date().toISOString() })
for (const channel of ['stable', 'nightly']) {
  const name = `${channel}${mac ? '-mac' : ''}.yml`
  writeFileSync(join(root, name), feed)
  assets.push(name)
}
const checksums = await Promise.all(assets.map(async name => `${await hash(name, 'sha256', 'hex')}  ${name}\n`))
writeFileSync(join(root, 'SHA256SUMS'), checksums.join(''))
console.log(JSON.stringify({version, assets:[...assets, 'SHA256SUMS']}))

/** Prepare immutable mirrored asset URLs and checksums for a completed Windows build; never uploads. */
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import yaml from 'js-yaml'
import { valid } from 'semver'

const [directory, version] = process.argv.slice(2)
if (!directory || !version || !valid(version)) throw new Error('Usage: node prepare-novaflow-release.mjs <artifact-directory> <version>')
const root = resolve(directory)
const installers = readdirSync(root).filter(name => name.startsWith(`NovaFlow-${version}-`) && name.endsWith('.exe'))
if (installers.length !== 1) throw new Error('Expected exactly one NovaFlow installer for the selected version')
const installer = installers[0]
const blockmap = `${installer}.blockmap`
if (!statSync(join(root, blockmap)).isFile()) throw new Error('Missing installer blockmap')
const bytes = readFileSync(join(root, installer))
const url = `https://gh-proxy.com/https://github.com/Azheyc/NovaFlow-dsh/releases/download/v${version}/${encodeURIComponent(installer)}`
const sha512 = createHash('sha512').update(bytes).digest('base64')
const feed = yaml.dump({ version, files: [{ url, sha512, size: bytes.length }], path: url, sha512, releaseDate: new Date().toISOString() })
for (const channel of ['stable', 'nightly']) writeFileSync(join(root, `${channel}.yml`), feed)
const assets = [installer, blockmap, 'stable.yml', 'nightly.yml']
writeFileSync(join(root, 'SHA256SUMS'), assets.map(name => `${createHash('sha256').update(readFileSync(join(root, name))).digest('hex')}  ${name}\n`).join(''))
console.log(JSON.stringify({ version, directory: root, assets: [...assets, 'SHA256SUMS'] }, null, 2))

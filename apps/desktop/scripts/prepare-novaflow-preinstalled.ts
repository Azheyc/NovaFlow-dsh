/** Materialize the pinned community plugins at build time, without executing package scripts. */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Prepare a self-contained hoisted dependency tree; no package downloads occur on user startup.
 * @returns Directory copied into the Desktop runtime as novaflow-preinstalled.
 */
export function prepareNovaFlowPreinstalled(): string {
  const desktop = fileURLToPath(new URL('../', import.meta.url))
  const source = join(desktop, 'preinstalled')
  const target = join(desktop, '.desktop-build', 'novaflow-preinstalled')
  const files = ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml']
  const hash = createHash('sha256')
  for (const file of files) hash.update(readFileSync(join(source, file)))
  const digest = hash.digest('hex')
  const stamp = join(target, '.prepared')
  if (existsSync(stamp) && readFileSync(stamp, 'utf8') === digest && existsSync(join(target, 'node_modules', 'dshmarket', 'package.json'))) return target
  mkdirSync(target, { recursive: true })
  for (const file of files) cpSync(join(source, file), join(target, file))
  const pnpm = fileURLToPath(new URL('../../../node_modules/pnpm/bin/pnpm.mjs', import.meta.url))
  execFileSync(process.execPath, [pnpm, 'install', '--ignore-workspace', '--frozen-lockfile', '--ignore-scripts', '--config.auto-install-peers=false', '--config.node-linker=hoisted', '--config.enable-global-virtual-store=false', '--config.registry=https://registry.npmmirror.com'],
    { cwd: target, stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } })
  writeFileSync(stamp, digest)
  return target
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) prepareNovaFlowPreinstalled()

/** Materialize the pinned community plugins at build time, without executing package scripts. */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { imBundle, novaFlowMediaDesk } from '../src/novaflow-preinstalled.ts'
import { desktopTargetPlatform, resolveDesktopBuildTarget } from './desktop-build-paths.mjs'

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
  replace('  const { openBotSettings } = React8.useContext(BotSettingsContext);', `  const { openBotSettings } = React8.useContext(BotSettingsContext);
  const openAccount = (initialTab) => openBotSettings?.({ ...channelSettings, channel: channel7, botId, botName, connected: Boolean(connected), accessPolicy, initialTab });`)
  replace(/onClick: \(\) => openBotSettings\?\.\(\{\n[\s\S]*?\n        \}\)/, 'onClick: () => openAccount("general")')
  replace('    { className: "dim-botSettingsAction" },', `    { className: "dim-botSettingsAction" },
    h2("button", { type: "button", className: "dim-botSettingsButton", onClick: () => openAccount("ds-bot") }, "对话对象"),`)
  replace('React40.useState(BOT_SETTINGS_TABS[0].id)', 'React40.useState(account.initialTab ?? BOT_SETTINGS_TABS[0].id)')
  replace('"连接手机": "Connect phone",', '"对话对象": "Conversation partner",\n  "连接手机": "Connect phone",')
  replace(String.raw`Object.freeze({ id: "ds-bot", label: "\u7ED1\u5B9A DS Bot" })`, 'Object.freeze({ id: "ds-bot", label: "对话对象" })')
  replace(String.raw`h2("h3", null, "\u7ED1\u5B9A DS Bot")`, 'h2("h3", null, "对话对象")')
  const imSource = resolve(import.meta.dirname, '../preinstalled/im')
  const picker = readFileSync(join(imSource, 'setup-partner-client.js'), 'utf8')
  replace('function IMSettingsTab({', `${picker}\nfunction IMSettingsTab({\n  setupPartnerRpc,`)
  replace('          loopbackRecovery ? h2(LoopbackRecoveryNotice, {', `          !globalSettingsSelected && !deliverySettings && !["email", "office"].includes(active.id)
            ? h2(SetupPartnerPicker, { key: active.id, channel: active.id, rpc: setupPartnerRpc }) : null,
          loopbackRecovery ? h2(LoopbackRecoveryNotice, {`)
  replace('  const panelDependencies = {', `  const panelDependencies = {
    setupPartnerRpc: (method, payload, signal) => callManagementRpc(ctx.connection, "/novaflow-partner", method, payload, signal),`)
  replace('account: deliverySettings,', 'account: deliverySettings, setupPartnerRpc,')
  replace('function DeliveryTargetSettingsPage({', 'function DeliveryTargetSettingsPage({\n  setupPartnerRpc,')
  replace('activeTab.id === "ds-bot" ? h2(DsBotSettingsPage, {', 'activeTab.id === "ds-bot" ? h2(DsBotSettingsPage, { channel: channel7, setupPartnerRpc,')
  replace('function DsBotSettingsPage({ botId, rpcCall })', 'function DsBotSettingsPage({ botId, channel, setupPartnerRpc, rpcCall })')
  replace('    void refresh(controller.signal);\n    return () => {\n      controller.abort();\n      requests.current.revision++;', `    void refresh(controller.signal).then(async () => {
      if (controller.signal.aborted) return;
      try {
        const choice = unwrapRpcResult16(await setupPartnerRpc("get", { channel, botId }, controller.signal));
        if (!controller.signal.aborted) setDsBotId(current => current || choice.selected);
      } catch { /* Explicit binding remains available if setup preferences are unavailable. */ }
    });
    return () => {
      controller.abort();
      requests.current.revision++;`)
  writeFileSync(entry, client)

  // Desktop-owned bundles are omitted from pluginManager.listBundles(). Let the
  // existing owner-scoped Bot RPC determine availability when its row is hidden.
  const hostEntry = join(dirname(entry), 'index.js')
  let host = readFileSync(hostEntry, 'utf8')
  const check = 'if(!r?.installed)return{state:"missing",bots:[]};if(!r.enabled)return{state:"disabled",bots:[]}'
  if (host.split(check).length !== 2) throw new Error('Cannot locate the DSH-IM Bot availability check')
  host = host.replace(check, 'if(r&&!r.installed)return{state:"missing",bots:[]};if(r&&!r.enabled)return{state:"disabled",bots:[]}')
  // Hook account setup after the workspace exists but before its inbound runtime starts.
  const setupHooks = [
    ['dsBot:hZ(G)});if(typeof F.listSessionSyncTargets', 'dsBot:hZ(G)});installSetupPartners(G,U,F);if(typeof F.listSessionSyncTargets'],
    ['let et=yi(Ae,{dsBot:t.deliveryService?.dsBot,botId:Ue', 'await t.deliveryService?.applySetupPartner("feishu",Ue,le,_);let et=yi(Ae,{dsBot:t.deliveryService?.dsBot,botId:Ue'],
    ['let Ie=yi(q,{dsBot:t.deliveryService?.dsBot,botId:V', 'await t.deliveryService?.applySetupPartner("weixin",V,ce,_);let Ie=yi(q,{dsBot:t.deliveryService?.dsBot,botId:V'],
  ] as const
  for (const [original, replacement] of setupHooks) {
    if (host.split(original).length !== 2) throw new Error('Cannot locate the DSH-IM account setup hook')
    host = host.replace(original, replacement)
  }
  cpSync(join(imSource, 'setup-partner.mjs'), join(dirname(hostEntry), 'setup-partner.mjs'))
  writeFileSync(hostEntry, `import { installSetupPartners } from './setup-partner.mjs';\n${host}`)
}

/**
 * Prepare a self-contained hoisted dependency tree; no package downloads occur on user startup.
 * @param buildTarget - Desktop target whose optional dependencies and native worker are shipped.
 * @returns Directory copied into the Desktop runtime as novaflow-preinstalled.
 */
export function prepareNovaFlowPreinstalled(buildTarget = resolveDesktopBuildTarget()): string {
  const { platform, arch } = desktopTargetPlatform(buildTarget)
  const nativeTarget = `${platform}-${arch}`
  const desktop = fileURLToPath(new URL('../', import.meta.url))
  const source = join(desktop, 'preinstalled')
  const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
  const marketPatch = `patches/dshmarket@${manifest.dependencies.dshmarket}.patch`
  const botPatch = `patches/ds-bot@${manifest.dependencies['ds-bot']}.patch`
  const memoryPatch = `patches/dsh-auto-memory@${manifest.dependencies['dsh-auto-memory']}.patch`
  const files = ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', marketPatch, botPatch, memoryPatch]
  const promptSource = resolve(desktop, '../../plugins/prompt-presets')
  const promptFiles = ['package.json', 'index.js', 'catalog.js', 'cordis.patch.yml', 'README.md']
  const promptManifest = JSON.parse(readFileSync(join(promptSource, 'package.json'), 'utf8')) as { name: string; version: string }
  const hash = createHash('sha256').update(nativeTarget).update(readFileSync(import.meta.filename))
  for (const file of ['setup-partner-client.js', 'setup-partner.mjs']) hash.update(readFileSync(join(source, 'im', file)))
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
  const payload = join(target, 'payload')
  const promptTarget = join(target, 'node_modules', promptManifest.name)
  try {
    mkdirSync(join(target, 'patches'), { recursive: true })
    for (const file of files) cpSync(join(source, file), join(target, file))
    const pnpm = fileURLToPath(new URL('../../../node_modules/pnpm/bin/pnpm.mjs', import.meta.url))
    const installArgs = [pnpm, 'install', '--os', platform, '--cpu', arch,
      '--frozen-lockfile', '--ignore-scripts', '--config.registry=https://registry.npmjs.org']
    execFileSync(process.execPath, installArgs, { cwd: target, stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } })
    for (const name of Object.keys(manifest.dependencies)) {
      includeLocalDependencies(target, name, name === 'dshmarket' ? ['@deepseek-ai/schemastery'] : [])
    }
    prepareLocalIm(target)
    manifest.dependencies[novaFlowMediaDesk] = prepareLocalMediaDesk(target, source)
    mkdirSync(promptTarget, { recursive: true })
    for (const file of promptFiles) cpSync(join(promptSource, file), join(promptTarget, file))
    const client = readFileSync(join(promptSource, 'client.jsx'), 'utf8').replace("'__PROMPT_STYLES__'", () => JSON.stringify(readFileSync(join(promptSource, 'style.css'), 'utf8')))
    writeFileSync(join(promptTarget, 'client.js'), ts.transpileModule(client, { fileName: 'client.jsx', compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, allowJs: true } }).outputText)
    manifest.dependencies[promptManifest.name] = promptManifest.version
    const names = [...Object.keys(manifest.dependencies), '@local/novaflow-dsh-plugin', '@local/novaflow-modes']
    const repositories = Object.keys(manifest.dependencies).flatMap((name) => {
      const metadata = JSON.parse(readFileSync(join(target, 'node_modules', name, 'package.json'), 'utf8'))
      const url = typeof metadata.repository === 'string' ? metadata.repository : metadata.repository?.url
      return typeof url === 'string' ? [url.replace(/^git\+/, '').replace(/\.git$/, '').toLowerCase()] : []
    })
    const policy = JSON.stringify({ names, repositories }, null, 2)
    writeFileSync(join(target, 'node_modules/dshmarket/lib/novaflow-builtins.json'), policy)
    const opsRuntime = join(target, 'node_modules', 'dsh-ops', 'runtime')
    const requiredRuntimes = platform === 'win32' ? [nativeTarget, 'linux-x64'] : [nativeTarget]
    for (const required of requiredRuntimes) {
      const worker = join(opsRuntime, required, required === 'win32-x64' ? 'dsh-ops-worker.exe' : 'dsh-ops-worker')
      if (!lstatSync(worker).isFile()) throw new Error(`Missing packaged dsh-ops worker: ${worker}`)
    }
    const foreignRuntimes = new Set(['darwin-arm64', 'darwin-x64', 'linux-x64', 'win32-x64']
      .filter(name => !requiredRuntimes.includes(name)).map(name => join(opsRuntime, name)))
    for (const name of Object.keys(manifest.dependencies)) {
      const origin = join(target, 'node_modules', name)
      cpSync(origin, join(payload, 'node_modules', name), { recursive: true, dereference: true,
        filter: path => !foreignRuntimes.has(path) })
    }
    writeFileSync(join(payload, 'novaflow-builtins.json'), policy)
    writeFileSync(join(payload, 'package.json'), JSON.stringify(manifest, null, 2))
    writeFileSync(join(payload, stamp), digest)
    try { renameSync(payload, completed) }
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
  const descriptor = join(project, 'desktop-runtime.json')
  if (!existsSync(descriptor)) throw new Error(`Desktop development project is missing at ${project}`)
  const runtime = JSON.parse(readFileSync(descriptor, 'utf8')) as { platform?: NodeJS.Platform; arch?: string }
  const buildTarget = resolveDesktopBuildTarget({}, runtime.platform, runtime.arch)
  const destination = join(project, 'novaflow-preinstalled')
  await withFileLock(destination, async () => {
    const seed = prepareNovaFlowPreinstalled(buildTarget)
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

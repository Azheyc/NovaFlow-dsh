# NovaFlow development

English | [中文](NOVAFLOW-DEVELOPMENT.zh.md)

This reference maps NovaFlow customization to its owning source and validation. Start with the repository AGENTS.md and use the workspace's develop.ps1 and start-novaflow.ps1 when available. The fork uses upstream [`dsh-v0.2.2-rc.5`](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.5). Source lives in the independent deepseek-harness checkout.

## Feature ownership

| Area | Source and owning documentation |
| --- | --- |
| Welcome, automatic authorization validation | src/novaflow-account-backend.ts, src/client/WelcomePage.tsx; [account integration](../novaflow-plugin/INTEGRATION.md) |
| Account, balance, model synchronization | apps/novaflow-plugin; [integration](../novaflow-plugin/INTEGRATION.md) takes precedence over historical standalone-plugin instructions |
| Offline plugin seeding | preinstalled/package.json, scripts/prepare-novaflow-preinstalled.ts, src/novaflow-preinstalled.ts |
| Plugin market account access | The account plugin uses the platform’s `identity_scope` to control market activation. Enterprise sign-in removes the market routes and client entry. Account changes re-evaluate access. |
| Connect phone | `prepareLocalIm()` adapts the [`@xmanrui/dsh-im`](https://github.com/xmanrui/dsh-im) client for the offline seed. The plugin always registers its sidebar entry when enabled. Desktop updates replace the bundled files with the same package name and bot configuration. |
| NovaFlow Media Desk | Desktop builds compile `novaflow-media-desk` from `preinstalled/media-desk/source/` for offline installation. The source is based on [dsh-media-desk v2.7.2](https://github.com/woniuniuniu/dsh-media-desk/tree/v2.7.2) and ships its MIT license. |
| Shared skills and legacy presets | [NovaFlow skills and presets](../novaflow-modes/README.md) |
| Home prompts and settings | [Prompt presets](../../plugins/prompt-presets/README.md). Edit `catalog.js` to release built-ins shared by every mode. `index.js` saves the custom library. `client.jsx` shows suggestions in new conversations and opens the custom editor in Settings. |
| Model endpoints and requests | [Model synchronization](../novaflow-plugin/src/native-models.js) migrates managed URLs, [request authentication](../novaflow-plugin/src/model-bridge.js) supplies the platform token and group header, and the [adapter entry](../../packages/llm/llm-pi-ai/src/index.ts) connects inference and discovery. |
| Logo and home animation | resources/novaflow, scripts/render-novaflow-brand.ts, scripts/render-novaflow-animation.ts, packages/client/ui-brand-official |
| macOS and Windows installers and mirrored updates | [release manual](novaflow-release/README.md), scripts/novaflow-distribution.mjs |
| Update dialog | [Release card](src/client/release-card.tsx), [update dialog](src/update-dialog.ts), [Mac DMG download](src/updates/novaflow-dmg.ts) |

Paths in the table are relative to apps/desktop unless prefixed with apps/ or packages/, which refer to the repository root. The account extension is protected client functionality; keep community-plugin management independent. Login does not install plugins. Mode selection is session-local; settings determine new-session defaults.

## Development workflow

Use the repository's pinned pnpm and Node version requirements. The workspace wrapper provides install, build and check commands. build produces Host, Client and Desktop artifacts and checks their types. Run tests for the affected feature, rebuild stale artifacts, then restart only this workspace's development processes and confirm the new Host is ready.

The workspace review launcher preserves .desktop-build/novaflow-review and uses debugger ports 9329, 9322 and 9330. Ordinary upstream development uses .desktop-build/development and ports 9229, 9222 and 9230. Test fresh installation with a separate home, never by clearing an existing user's login, conversations or model settings. Logs can contain local authentication tokens and must remain private.

On macOS, the NovaFlow development shortcut runs `node --import tsx apps/desktop/scripts/prepare-novaflow-preinstalled.ts apps/desktop/.desktop-build/novaflow-review/project` from the repository before opening Electron. The command refreshes the review runtime's preinstalled resources with the current lockfile and leaves the review profile and session directories in place.

## Bundled plugin upgrades

Read versions from the [seed manifest](preinstalled/package.json) and [lockfile](preinstalled/pnpm-lock.yaml). `prepareNovaFlowPreinstalled()` applies the market patch, prepares the IM and Media Desk variants, and compiles the prompt plugin. Read the shipped inventory from the generated `novaflow-preinstalled/package.json`.

The build caches a separate seed for each target OS and architecture. Only the manifest's plugins and their private dependencies are copied from the pnpm installation into the deliverable. `dsh-ops` includes the target worker and its receipt. Windows x64 also includes Niubash, Git and the Linux x64 worker used for offline WSL reads.

| Plugin | Behavior and source to preserve when merging upstream |
| --- | --- |
| Team mode | Signing in from the welcome page opens the standard interface. Enter team mode opens DS Bot. Its shell withdraws the standard home's prompt categories and recommendations until the user returns to standard mode. DSH-IM provides channel setup and team Bot selection. |
| Persistent memory | The bundled dsh-auto-memory patch creates its data directory before acquiring the settings lock. The default Companion preset uses a 32 KB budget and minimum importance 1. Existing user overrides take precedence. |
| Plugin market | `preinstalled/patches/dshmarket@<version>.patch` keeps the online catalog live, hides the sponsor area and top-level update-check notice, and ships market updates with the desktop. The Plugins page tab is available by default. The sidebar entry is opt-in. Route requests return the install or update result after a Host remount. |
| Connect phone | `prepareLocalIm()` retains the package name and bot settings, removes the GitHub and self-update actions, and always registers the sidebar entry while the plugin is enabled. The page subtitle is “NovaFlow at your fingertips”. |
| Media Desk | Preserve the separate Infinite canvas entry, per-canvas DSH sessions and NovaFlow Image integration. The default directory is `$DSH_HOME/media-desk/files`. Users can change or restore it, and older files resolve to their original roots. Image nodes offer 1K and 2K and use the image model selected in client settings. |
| Prompt presets | `plugins/prompt-presets/` supplies one built-in library across all modes and shows only custom presets in Settings. Desktop updates replace built-ins and retain user presets. |
| Exa and Agent presets | `seedExaSearchDefault()` defaults unconfigured search to Exa. NovaFlow's preset filters keep OPS and Creator hidden. |

Media Desk opens Inspiration on first use. The separate Infinite canvas entry opens the last-used canvas, falling back to the first item if needed. `POST /media-desk/canvas/open` checks the list in the save queue and creates one Untitled canvas when the list is empty. Preserve node and toolbar interactions in `preinstalled/media-desk/source/client/board/` and canvas sessions, generation jobs and storage in `src/canvas*.js` when merging upstream.

1. Update the manifest and lockfile together for third-party version changes. Port the market patch and check the IM and Media Desk adaptations against the new packages. Regenerate the seed and resolve any patch or adaptation failures before packaging.
2. Before packaging, run `novaflow-preinstalled.spec.ts`, `welcome-flow.e2e.ts` and `novaflow-market-install.e2e.ts`. Check offline seeding in a fresh profile, settings and enabled states in an existing profile, and operation results after a market remount. Run the prompt or image plugin tests when those features change.

## Validation by change

The desktop build compiles the prompt plugin into the offline seed. To create a standalone archive, run the following PowerShell from the repository root. The directory returned by the preparation script contains the `client.js` entry loaded by the Host.

```powershell
$seed = node --import tsx --input-type=module -e "import {prepareNovaFlowPreinstalled} from './apps/desktop/scripts/prepare-novaflow-preinstalled.ts'; console.log(prepareNovaFlowPreinstalled())" | Select-Object -Last 1
if ($LASTEXITCODE -ne 0) { throw 'Plugin preparation failed' }
npm.cmd pack (Join-Path $seed 'node_modules/novaflow-dsh-prompt-presets') --pack-destination apps/desktop/.desktop-build
```

Run commands from the repository root. Prefix Vitest commands with node node_modules/pnpm/bin/pnpm.mjs exec. Use vitest.e2e.config.ts for welcome-flow.e2e.ts; build first. Set DSH_INSTALL_DIR to the absolute apps/cli path before running node --test apps/novaflow-plugin/test/*.test.js.

| Change | Targeted validation |
| --- | --- |
| Account | Account Node tests; desktop welcome/account renderer tests; built welcome-flow.e2e.ts with synthetic platform transport |
| Prompt presets | `node --test plugins/prompt-presets/catalog.test.mjs` covers read-only built-ins, migration across modes and concurrent saves. `novaflow-preinstalled.spec.ts` checks that seed upgrades preserve custom files. `welcome-flow.e2e.ts` checks the shared library on first launch. |
| Model synchronization | `native-models.test.js` covers endpoint migration, renamed groups, custom titles and explicit refresh. `media-service.test.js` covers media catalog metadata and stable selections. `model-bridge.test.js` covers destinations, authentication and group headers. `welcome-flow.e2e.ts` covers Host login and discovery. |
| Preinstallation | novaflow-preinstalled.spec.ts, project-manager.spec.ts, runtime-manifests.spec.ts; actual packaged first-profile initialization offline |
| Plugin market | `novaflow-market-install.e2e.ts` installs and updates against a local test registry. After a market remount, the active Host supplies activation state and the original request completes version validation and returns its result. |
| Shared skills and retired presets | `novaflow-mode-isolation.spec.ts`, `novaflow-client-identity.e2e.ts` and the Host preset roster |
| Infinite canvas | The Media Desk plugin’s `test/*.test.js` covers documents and nodes. `novaflow-board-interaction.spec.tsx` covers node and toolbar interactions. `novaflow-board.e2e.ts` covers default storage, concurrent first opens, assistant edits and reopening after restart. |
| Updates | `novaflow-distribution.spec.ts` checks asset names, hashes and release notes in both channels. `novaflow-dmg.spec.ts` covers progress, checksum and partial files. `update-coordinator.spec.ts` checks download and installer handoff. `fixtures/update-dialogs.mjs` exercises the renderer. Check packaged `app-update.yml`, mirrored feeds and upgrades on both target systems. |
| Installer | scripts/test-windows-installer.mjs; complete package-target build including its packaged-runtime smoke |

Preinstalled packages inside ASAR require recursive read/write copying, not native cpSync. Apply archive manifest cleanup before sealing the runtime inventory. Preserve these checks when changing seeding or packaging. Mock-platform tests do not establish real account or paid-model availability.

## Releases and handoff

Follow the [NovaFlow release manual](novaflow-release/README.md). Source is published to Azheyc/NovaFlow-dsh main; the local customization branch can retain its own name. The upstream origin is reference-only; the novaflow remote is the fork. Never reuse an already published version or overwrite its assets. Current unsigned releases do not claim a verified publisher. Both update channels currently receive the same release through gh-proxy.com.

The five content skills ship in `apps/novaflow-modes/skills/` and register in the Host's global skill registry. Existing Content platform sessions and defaults resolve to Standard. Persistent authorization depends on the platform accepting the documented credential protocol.

## Documentation maintenance

Keep current behavior in the owning documents linked above. Keep dated test results in the workspace verification records; do not rewrite historical failures as successful runs. Update both language counterparts and record their pairing after repository documentation changes. Generated catalogs must be regenerated through their scripts. Keep migration originals, credentials, user profiles, dependencies and build outputs out of source commits.

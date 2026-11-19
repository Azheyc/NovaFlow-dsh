# NovaFlow development

English | [中文](NOVAFLOW-DEVELOPMENT.zh.md)

This reference maps NovaFlow customization to its owning source and validation. Start with the repository AGENTS.md and use the workspace's develop.ps1 and start-novaflow.ps1 when available. The fork uses upstream `dsh-v0.2.2-rc.5` (`9c2670d3bc`). Source lives in the independent deepseek-harness checkout.

## Feature ownership

| Area | Source and owning documentation |
| --- | --- |
| Welcome, automatic authorization validation | src/novaflow-account-backend.ts, src/client/WelcomePage.tsx; [account integration](../novaflow-plugin/INTEGRATION.md) |
| Account, balance, model synchronization | apps/novaflow-plugin; [integration](../novaflow-plugin/INTEGRATION.md) takes precedence over historical standalone-plugin instructions |
| Offline plugin seeding | preinstalled/package.json, scripts/prepare-novaflow-preinstalled.ts, src/novaflow-preinstalled.ts |
| Session modes and first guide | [mode extension](../novaflow-modes/README.md), apps/novaflow-modes/modes.js |
| Home prompts and settings | [Prompt presets](../../plugins/prompt-presets/README.md). `catalog.js` supplies the defaults, `client.jsx` and `style.css` render the interface, and `index.js` saves changes in the current profile. |
| Model endpoints and requests | [Model synchronization](../novaflow-plugin/src/native-models.js) migrates managed URLs, [request authentication](../novaflow-plugin/src/model-bridge.js) supplies the platform token and group header, and the [adapter entry](../../packages/llm/llm-pi-ai/src/index.ts) connects inference and discovery. |
| Logo and home animation | resources/novaflow, scripts/render-novaflow-brand.ts, scripts/render-novaflow-animation.ts, packages/client/ui-brand-official |
| Windows installer and mirrored updates | [release manual](novaflow-release/README.md), scripts/novaflow-distribution.mjs |

Paths in the table are relative to apps/desktop unless prefixed with apps/ or packages/, which refer to the repository root. The account extension is protected client functionality; keep community-plugin management independent. Login does not install plugins. Mode selection is session-local; settings determine new-session defaults.

## Development workflow

Use the repository's pinned pnpm and Node version requirements. The workspace wrapper provides install, build and check commands. build produces Host, Client and Desktop artifacts and checks their types. Run tests for the affected feature, rebuild stale artifacts, then restart only this workspace's development processes and confirm the new Host is ready.

The workspace review launcher preserves .desktop-build/novaflow-review and uses debugger ports 9329, 9322 and 9330. Ordinary upstream development uses .desktop-build/development and ports 9229, 9222 and 9230. Test fresh installation with a separate home, never by clearing an existing user's login, conversations or model settings. Logs can contain local authentication tokens and must remain private.

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
| Prompt presets | Run `node --test plugins/prompt-presets/catalog.test.mjs`. In a new conversation on upstream DSH and NovaFlow, check category switching, hover preview, replacement confirmation and settings persistence. |
| Model URLs | `native-models.test.js` covers migration and user edits. `model-bridge.test.js` covers destinations, dynamic authentication and group headers. `welcome-flow.e2e.ts` covers Host login and discovery for each group. |
| Preinstallation | novaflow-preinstalled.spec.ts, project-manager.spec.ts, runtime-manifests.spec.ts; actual packaged first-profile initialization offline |
| Mode isolation | novaflow-mode-isolation.spec.ts and real Host preset list; check temporary selection leaves defaults and drafts intact |
| Updates | novaflow-distribution.spec.ts, desktop-auto-update-environment.spec.ts, desktop-policy-environment.spec.ts; packaged app-update.yml and mirrored assets |
| Installer | scripts/test-windows-installer.mjs; complete package-target build including its packaged-runtime smoke |

Preinstalled packages inside ASAR require recursive read/write copying, not native cpSync. Apply archive manifest cleanup before sealing the runtime inventory. Preserve these checks when changing seeding or packaging. Mock-platform tests do not establish real account or paid-model availability.

## Releases and handoff

Follow the [Windows release manual](novaflow-release/README.md). Source is published to Azheyc/NovaFlow-dsh main; the local customization branch can retain its own name. The upstream origin is reference-only; the novaflow remote is the fork. Never reuse an already published version or overwrite its assets. Current unsigned releases do not claim a verified publisher. Both update channels currently receive the same release through gh-proxy.com.

Future specialist plugins belong in the two lists in modes.js and must also ship in the offline distribution. Only session-isolated capabilities may be added; missing or non-isolated plugins must remain visibly unavailable. No server change is required for modes or preinstallation. Persistent authorization still depends on the platform accepting the documented credential protocol.

## Documentation maintenance

Keep current behavior in the owning documents linked above. Keep dated test results in the workspace verification records; do not rewrite historical failures as successful runs. Update both language counterparts and record their pairing after repository documentation changes. Generated catalogs must be regenerated through their scripts. Keep migration originals, credentials, user profiles, dependencies and build outputs out of source commits.

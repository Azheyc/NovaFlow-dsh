# NovaFlow session modes

English | [中文](README.zh.md)

The Host adds the NovaFlow client identity to the shared system prompt in every shipped mode. DeepSeek Harness remains the framework name, and skills, commands and paths retain their upstream names.

The new-session picker and Agent presets settings hide Creator (`cordis`), OPS (PTC) (`ops-ptc`), and PTC (`ptc`). The settings page omits the Creator entry as well. The Host keeps these presets registered for existing sessions and plugin workflows.

The Host registers the skills in `skills/` as a global bundled filesystem source. Story writing, asset extraction, character boards, scene references and S10 cinematic storyboarding are available to every preset with skill loading. The bundled skills keep their names and supporting files.

In Settings → Skills → Global skills, expand DSH or search by the Chinese skill name. Desktop startup links the five Chinese directory entries to their bundled skills. Details retain the original `laotang-` invocation names. Existing user directories with matching names take precedence.

Modeling (`novaflow-modeling`) and Content platform (`novaflow-media-creation`) resolve to Standard for saved sessions and defaults. All modes share the same prompt library, including modeling prompts.

The first-workspace guide registers in `settings.onboarding` and introduces the shared skills once Standard is ready. Closing, pressing Escape or choosing Got it dismisses the guide. `/api/novaflow-modes` accepts owner-authenticated JSON POST actions `state` and `dismiss` and returns `{seen, ready}`.

Desktop seeding creates `.novaflow-mode-guide.json` under the user profile: unseen for a new profile and seen for an existing profile. Missing state outside that initialization means no automatic guide. Dismissal persists independently of account credentials. Changes to this plugin ship as a local package, not as an overwritten community release.

The built `novaflow-client-identity.e2e.ts` verifies skill discovery and invocation in Standard and a restored Content platform session. `welcome-flow.e2e.ts` checks the preset roster, offline installation, protected account management and guide persistence.

# NovaFlow session modes

English | [中文](README.zh.md)

The Host adds the NovaFlow client identity to the shared system prompt in every shipped mode. DeepSeek Harness remains the framework name, and skills, commands and paths retain their upstream names.

The new-session picker and Agent presets settings hide Creator (`cordis`), OPS (PTC) (`ops-ptc`), and PTC (`ptc`). The settings page omits the Creator entry as well. The Host keeps these presets registered for existing sessions and plugin workflows.

The Host registers the skills in `skills/` as a global bundled filesystem source. Story writing, asset extraction, character boards, scene references and S10 cinematic storyboarding are available to every preset with skill loading. The bundled skills keep their names and supporting files.

In Settings → Skills → Global skills, expand DSH or search by the Chinese skill name. Desktop startup links the five Chinese directory entries to their bundled skills. Details retain the original `laotang-` invocation names. Existing user directories with matching names take precedence.

Modeling (`novaflow-modeling`) and Content platform (`novaflow-media-creation`) resolve to Standard for saved sessions and defaults. All modes share the same prompt library, including modeling prompts.

The built `novaflow-client-identity.e2e.ts` verifies skill discovery and invocation in Standard and a restored Content platform session. `welcome-flow.e2e.ts` checks the preset roster, offline installation and protected account management.

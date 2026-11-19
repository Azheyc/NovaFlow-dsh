# NovaFlow session modes

English | [中文](README.zh.md)

The Host adds the NovaFlow client identity to the shared system prompt in every shipped mode. DeepSeek Harness remains the framework name, and skills, commands and paths retain their upstream names.

The new-session picker and Agent presets settings hide Creator (`cordis`) and OPS (PTC) (`ops-ptc`). The settings page omits the Creator entry as well. The Host keeps both presets registered for existing sessions and plugin workflows.

This plugin registers Modeling and Content platform modes using the shipped Standard preset template. Content platform keeps its `novaflow-media-creation` ID for existing conversations and prompt libraries. Its preset adds five bundled skills for story writing, asset extraction, character boards, scene references and S10 cinematic storyboarding. Settings → Skills lists them under the Content platform preset. Each skill ships with its supporting files in `skills/`.

The first-workspace guide contributes to `settings.onboarding` and reuses the shared Modal and Button primitives. It waits for the preset roster, offers View Agent presets or Got it, and treats closing or Escape as dismissal. Navigation opens `agent-presets` without selecting a mode or changing the default. `/api/novaflow-modes` accepts owner-authenticated JSON POST actions `state` and `dismiss`; the state is `{seen, ready}`. No model requests or downloads occur.

Desktop seeding creates `.novaflow-mode-guide.json` under the user profile: unseen for a new profile and seen for an existing profile. Missing state outside that initialization means no automatic guide. Dismissal persists independently of account credentials. Changes to this plugin ship as a local package, not as an overwritten community release.

Use the Desktop seeding tests, `novaflow-mode-isolation.spec.ts` and built `welcome-flow.e2e.ts` to verify offline installation, session capability isolation, protected account management and guide persistence. The package itself neither installs packages nor owns the global plugin enable state.

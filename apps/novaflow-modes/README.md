# NovaFlow session modes

English | [中文](README.zh.md)

This local development plugin registers `novaflow-modeling` and `novaflow-media-creation` using the shipped Standard preset template. Each adds its own `plugins` array from `modes.js`; both arrays are currently empty. Only session-scoped capabilities belong there. The preset registry reports missing modules, activation failures and leaked root services rather than enabling global plugins. Existing conversation selection and new-task defaults keep their upstream behavior.

The first-workspace guide contributes to `settings.onboarding` and reuses the shared Modal and Button primitives. It waits for the preset roster, offers View Agent presets or Got it, and treats closing or Escape as dismissal. Navigation opens `agent-presets` without selecting a mode or changing the default. `/api/novaflow-modes` accepts owner-authenticated JSON POST actions `state` and `dismiss`; the state is `{seen, ready}`. No model requests or downloads occur.

Desktop seeding creates `.novaflow-mode-guide.json` under the user profile: unseen for a new profile and seen for an existing profile. Missing state outside that initialization means no automatic guide. Dismissal persists independently of account credentials. Changes to this plugin ship as a local package, not as an overwritten community release.

Use the Desktop seeding tests, `novaflow-mode-isolation.spec.ts` and built `welcome-flow.e2e.ts` to verify offline installation, session capability isolation, protected account management and guide persistence. The package itself neither installs packages nor owns the global plugin enable state.

---
kind: upgrade-guide
description: "All NovaFlow session modes share built-in and custom prompts."
---

# Shared prompt presets across modes

English | [中文](guide.zh.md)

## Change

NovaFlow Desktop removes Modeling from the preset roster. Existing Modeling sessions and saved defaults resolve to Standard. Every mode uses the same enterprise prompt library. Built-ins update with the desktop release. Custom presets are stored in the user's profile.

## Migration

1. Open an existing Modeling conversation and continue it under Standard. If you maintain an overlay that names `novaflow-modeling`, update the reference to `standard`.
2. Open CAD and modeling in any new session. Find previously added or edited prompts in Settings → Prompt presets.

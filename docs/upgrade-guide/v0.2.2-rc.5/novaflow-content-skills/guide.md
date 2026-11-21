---
kind: upgrade-guide
description: "NovaFlow Desktop moves Content platform skills to the global catalog and retires the preset."
---

# Shared NovaFlow content skills

English | [中文](guide.zh.md)

## Change

NovaFlow Desktop removes Content platform from the Agent presets roster. The five bundled skills are now available globally to sessions that support skill loading. Existing sessions and saved defaults that reference `novaflow-media-creation` resolve to `standard`.

## Migration

1. Open an existing Content platform conversation and continue in Standard. If a profile overlay declares a preset with ID `novaflow-media-creation`, remove that declaration. Use `standard` in overlays that select it.
2. In a Standard conversation, ask the assistant to load the cinematic storyboard skill. Its skill ID remains `laotang-cinematic-storyboard-s10-free`.

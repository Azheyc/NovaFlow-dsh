---
kind: upgrade-guide
description: "NovaFlow replaces account-driven recommended installation with offline Desktop seeding and session modes."
---

# NovaFlow preinstalled plugins and session modes

English | [中文](guide.zh.md)

## Change

NovaFlow account snapshots no longer expose pluginSetup. The confirm_plugins, dismiss_plugins and retry_plugins actions return UNSUPPORTED_ACTION, and autoInstallPlugins no longer controls an installation flow. Desktop ships four pinned community plugins. The core account package is no longer an editable plugin-management entry.

## Migration

1. Remove callers of the three installation actions and stop reading pluginSetup. Remove autoInstallPlugins from custom account configuration.
2. Use normal plugin management for community-plugin changes. Preserve the Desktop profile and its .novaflow-preinstalled-v1.json marker during upgrades so user removals remain respected.
3. Use novaflow-modeling or novaflow-media-creation for session presets; both initially inherit Standard capabilities. Session choices remain temporary; Settings controls the new-session default.
4. Confirm the four preinstalled plugins are present, the account page has no installer, and both modes are available. Existing user profiles should not show first-run mode guidance.

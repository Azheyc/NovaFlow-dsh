---
kind: upgrade-guide
description: "NovaFlow Windows uses its own mirrored GitHub release feed and application identity."
---

# NovaFlow Windows distribution

English | [中文](guide.zh.md)

## Change

The NovaFlow application id is vip.ycnovaflow.desktop. Its Windows x64 installer keeps the existing NSIS and electron-updater workflow, but reads updates from Azheyc/NovaFlow-dsh GitHub releases through gh-proxy.com. Both channels currently receive the same release. DeepSeek's mandatory-update policy is not included. Unsigned NovaFlow builds include update metadata and retain an unsigned filename suffix; they do not claim a verified publisher.

## Migration

1. Build with the tracked apps/desktop/novaflow-release/presets/test.env settings and an explicit increasing build version.
2. Publish the installer, blockmap, stable.yml, nightly.yml and SHA256SUMS together as a GitHub release marked Latest. Keep old release assets for clients downloading older versions.
3. Install NovaFlow separately from upstream DSH and preserve the user's existing profile. Verify the packaged app-update.yml names the mirrored NovaFlow repository and no DeepSeek policy is present.
4. Check for updates in the existing Desktop settings. Downloads require the configured mirror; this distribution does not fall back to upstream DSH.

# NovaFlow Windows releases

English | [中文](README.zh.md)

This directory contains public packaging settings only. The application id selects NovaFlow branding, its mirrored GitHub feed, and no upstream mandatory-update policy. Signing credentials must never be placed here. Windows C++ Build Tools and the Windows SDK are required.

## Build

Run from the repository root with the pinned pnpm, passing the chosen increasing version:

```powershell
$env:DSH_PACKAGING_PRESET = 'test'
$env:DSH_PACKAGING_CONFIG_DIR = (Resolve-Path apps/desktop/novaflow-release).Path
node node_modules/pnpm/bin/pnpm.mjs --filter @deepseek-ai/dsh-desktop exec tsx scripts/package-target.ts win-x64 --unsigned --build-version 0.2.2-rc.3.20261118.1
```

The test preset isolates release settings; it does not invoke the upstream test policy service. The installer keeps the unsigned suffix and Windows may show an unknown publisher. A signed release requires NovaFlow's own certificate and the existing signing pipeline, not an upstream certificate.

## Publish

Run scripts/prepare-novaflow-release.mjs from the desktop package with the artifact directory and version. It writes stable.yml, nightly.yml and SHA256SUMS; both channels currently receive the same version. Its URLs reference the immutable GitHub version tag through gh-proxy.com. Upload those files together with the installer and its blockmap to Azheyc/NovaFlow-dsh, then publish that release as Latest. Never overwrite assets for a published version. Verify the mirrored metadata and installer against the locally built checksums before announcing availability.

Existing version comparison, download progress, NSIS installation and restart behavior remain intact. The mirror must support HTTPS release assets and byte-range requests for differential downloads; the upstream updater retains its full-download fallback. There is no fallback to DeepSeek's release feed. Keep old release assets accessible.

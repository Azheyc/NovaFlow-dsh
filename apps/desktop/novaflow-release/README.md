# NovaFlow desktop releases

English | [中文](README.zh.md)

This directory contains public packaging settings only. The application id selects NovaFlow branding, its mirrored GitHub feed, and no upstream mandatory-update policy. Signing credentials must never be placed here. Windows C++ Build Tools and the Windows SDK are required.

## Build

Build from the repository root with the pinned pnpm and a new increasing version. This command builds Windows x64.

```powershell
$version = Read-Host 'New, approved version; never reuse a published version'
$env:DSH_PACKAGING_PRESET = 'test'
$env:DSH_PACKAGING_CONFIG_DIR = (Resolve-Path apps/desktop/novaflow-release).Path
node node_modules/pnpm/bin/pnpm.mjs --filter @deepseek-ai/dsh-desktop exec tsx scripts/package-target.ts win-x64 --unsigned --build-version $version
```

Build macOS Apple Silicon on macOS with the same release version in `$version`.

```sh
DSH_PACKAGING_PRESET=test DSH_PACKAGING_CONFIG_DIR="$PWD/apps/desktop/novaflow-release" NODE_USE_ENV_PROXY=1 node node_modules/pnpm/bin/pnpm.mjs --filter @deepseek-ai/dsh-desktop exec tsx scripts/package-target.ts mac-arm64 --unsigned --build-version "$version"
```

The test preset isolates release settings; it does not invoke the upstream test policy service. The installer keeps the unsigned suffix and Windows may show an unknown publisher. A signed release requires NovaFlow's own certificate and the existing signing pipeline, not an upstream certificate.

## Publish

From the repository root, run `node apps/desktop/scripts/prepare-novaflow-release.mjs <artifact-directory> <version>`. Windows emits `stable.yml` and `nightly.yml`. macOS emits `stable-mac.yml` and `nightly-mac.yml`. Both channels use the same version. Download URLs go through gh-proxy.com and reference the immutable GitHub version tag. Combine the platform checksums in one `SHA256SUMS`.

Existing version comparison, download progress, NSIS installation and restart behavior remain intact. The mirror must support HTTPS release assets and byte-range requests for differential downloads; the upstream updater retains its full-download fallback. There is no fallback to DeepSeek's release feed. Keep old release assets accessible.

## Release checklist

1. Confirm a new version and the source commit. Run relevant tests and the full build. Keep the working tree clean for a traceable artifact.
2. Build `win-x64` and `mac-arm64` on their respective platforms. Collect artifacts only after packaging and packaged-runtime checks finish successfully. Run Windows packaging and `start-novaflow.ps1` sequentially because they share a runtime directory. Check the integrity of the macOS DMG and ZIP.
3. Generate update metadata from each `apps/desktop/.desktop-build/targets/<target>/unsigned-artifacts` directory. Check the version, file names, installer SHA-512 and immutable version URLs.
4. Push the intended source to the novaflow remote. Create a draft GitHub release targeting that exact commit. Upload the EXE, DMG, ZIP, generated blockmaps, four channel files and combined `SHA256SUMS`.
5. Compare GitHub asset digests with local hashes, then publish as Latest. Verify mirrored metadata, full installer SHA-256 and blockmap bytes. Since the feed uses releases/latest/download, marking a release only as a GitHub prerelease will not make it the ordinary latest feed.
6. Record the version, commit, checks and limitations. Record distribution file checks and actual version-to-version upgrade results separately.

## Data and known limits

Do not test by deleting the existing review profile. Use a separate home and Electron user-data directory for fresh-install tests. The current unsigned package cannot establish publisher authenticity through a Windows signing certificate. HTTPS and update file hashes check transport and consistency, but do not replace code signing. Mirror outages must be reported as failed update checks, not as absence of newer releases.

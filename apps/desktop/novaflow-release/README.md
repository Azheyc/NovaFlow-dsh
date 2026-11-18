# NovaFlow Windows releases

English | [中文](README.zh.md)

This directory contains public packaging settings only. The application id selects NovaFlow branding, its mirrored GitHub feed, and no upstream mandatory-update policy. Signing credentials must never be placed here. Windows C++ Build Tools and the Windows SDK are required.

## Build

Run from the repository root with the pinned pnpm, passing the chosen increasing version:

```powershell
$version = Read-Host 'New, approved version; never reuse a published version'
$env:DSH_PACKAGING_PRESET = 'test'
$env:DSH_PACKAGING_CONFIG_DIR = (Resolve-Path apps/desktop/novaflow-release).Path
node node_modules/pnpm/bin/pnpm.mjs --filter @deepseek-ai/dsh-desktop exec tsx scripts/package-target.ts win-x64 --unsigned --build-version $version
```

The test preset isolates release settings; it does not invoke the upstream test policy service. The installer keeps the unsigned suffix and Windows may show an unknown publisher. A signed release requires NovaFlow's own certificate and the existing signing pipeline, not an upstream certificate.

## Publish

Run scripts/prepare-novaflow-release.mjs from the desktop package with the artifact directory and version. It writes stable.yml, nightly.yml and SHA256SUMS; both channels currently receive the same version. Its URLs reference the immutable GitHub version tag through gh-proxy.com. Upload those files together with the installer and its blockmap to Azheyc/NovaFlow-dsh, then publish that release as Latest. Never overwrite assets for a published version. Verify the mirrored metadata and installer against the locally built checksums before announcing availability.

Existing version comparison, download progress, NSIS installation and restart behavior remain intact. The mirror must support HTTPS release assets and byte-range requests for differential downloads; the upstream updater retains its full-download fallback. There is no fallback to DeepSeek's release feed. Keep old release assets accessible.

## Release checklist

1. Confirm a new version and the source commit. Run relevant tests and the full build. Keep the working tree clean for a traceable artifact.
2. Run the Windows build above. Require success from archive integrity and packaged-runtime smoke checks; do not publish an installer merely because an exe exists after a failed build.
3. From the repository root, run node apps/desktop/scripts/prepare-novaflow-release.mjs apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts $version. Check the resulting five assets match this version.
4. Push the intended source to the novaflow remote. Create a draft GitHub release targeting that exact commit and upload only the exe, its blockmap, stable.yml, nightly.yml and SHA256SUMS. Do not upload win-unpacked, logs or test fixtures.
5. Compare GitHub asset digests with local hashes, then publish as Latest. Verify mirrored metadata, full installer SHA-256 and blockmap bytes. Since the feed uses releases/latest/download, marking a release only as a GitHub prerelease will not make it the ordinary latest feed.
6. Record the version, commit, checks and limitations. Restart the existing development profile and confirm Host readiness. A first release verifies distribution; actual version-to-version update acceptance requires a later release or isolated qualification versions.

## Data and known limits

Do not test by deleting the existing review profile. Use a separate home and Electron user-data directory for fresh-install tests. The current unsigned package cannot establish publisher authenticity through a Windows signing certificate. HTTPS and update file hashes check transport and consistency, but do not replace code signing. Mirror outages must be reported as failed update checks, not as absence of newer releases.

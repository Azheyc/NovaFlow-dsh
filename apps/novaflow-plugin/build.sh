#!/usr/bin/env bash
set -euo pipefail
# Run from the package directory; pnpm converts workspace dependencies for the archive.
node --check index.js
node --check client.js
node --test test/client-contract.test.js test/plugin-install-flow.test.js
pnpm pack

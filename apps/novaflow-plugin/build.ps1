param(
    [string]$NodeExecutable = 'node',
    [string]$PnpmExecutable = 'pnpm.cmd'
)
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    & $NodeExecutable --check index.js
    if ($LASTEXITCODE -ne 0) { throw 'index.js syntax check failed' }
    & $NodeExecutable --check client.js
    if ($LASTEXITCODE -ne 0) { throw 'client.js syntax check failed' }
    & $NodeExecutable --test test/client-contract.test.js test/plugin-install-flow.test.js
    if ($LASTEXITCODE -ne 0) { throw 'Build contract tests failed' }
    & $PnpmExecutable pack
    if ($LASTEXITCODE -ne 0) { throw 'pnpm pack failed' }
} finally {
    Pop-Location
}

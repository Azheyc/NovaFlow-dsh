# Windows 开发迁移说明

快照日期：2026-11-17（Asia/Shanghai）。插件版本仍为2.6.1；此开发快照包含尚未提交、尚未发布的模型路由和思考策略修复，不能仅用版本号区分旧2.6.1包。

## 1. 迁移包内容

- source/：当前工作树源码、package-lock.json、全部测试和文档，包含未提交修复。
- install/：从本次源码重新生成的插件tgz，供DSH官方插件管理器安装。
- handoff/：基线提交、工作树状态、已跟踪文件未提交差异、SHA256清单与打包核验结果。source已包含这些修改，不要重复应用补丁。

不携带node_modules、DSH应用、个人profile、设备登录凭据、媒体文件或旧发布目录。Windows端重新安装依赖并由用户在浏览器授权NovaFlow。Mac的端口、文件路径和设备会话无需复制。handoff/SOURCE-MANIFEST.sha256覆盖source文件，外层zip旁附SHA256供传输后核对。

## 2. 准备环境

安装Git、Node.js 24及以上版本（含npm），以及DeepSeek Harness Desktop 0.2.2-rc.2或0.2.2-rc.3。其他DSH版本需重新核验契约，不能只放宽engines。

解压到普通可写目录，例如 C:\dev\novaflow-migration；避免直接在zip内编辑。PowerShell进入解压后的source：

```powershell
Set-Location 'C:\dev\novaflow-migration\source'
node --version
npm.cmd --version
npm.cmd ci --ignore-scripts --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
npm.cmd run check
if ($LASTEXITCODE -ne 0) { throw 'Syntax check failed' }
```

npm ci遵守随包锁文件；npm.cmd可避开npm.ps1执行策略问题。source不含原仓库.git目录，可用git init建立新仓库后提交快照；handoff内基线提交记录供追溯。

## 3. 完整测试

完整测试依赖Desktop随附的Config、adapter、SDK、WebServer及MCP库。普通Node不能自动读取app.asar；从桌面快捷方式“打开文件所在的位置”确认真实exe及resources目录，以下安装路径只是占位，需替换。

在source的同一PowerShell窗口执行：

```powershell
$desktopExe = 'C:\实际安装目录\DeepSeek Harness.exe'
if (-not (Test-Path -LiteralPath $desktopExe -PathType Leaf)) { throw 'Set desktopExe to the installed executable' }
$env:DSH_INSTALL_DIR = Join-Path (Split-Path -Parent $desktopExe) 'resources\app.asar\dsh\node_modules\@deepseek-ai\dsh'
$priorElectronMode = $env:ELECTRON_RUN_AS_NODE
try {
    $env:ELECTRON_RUN_AS_NODE = '1'
    & $desktopExe -e 'const p=require(process.env.DSH_INSTALL_DIR+"/package.json"); console.log("DSH",p.version,"Node",process.version)'
    if ($LASTEXITCODE -ne 0) { throw 'Check Desktop resources path and Electron Node support' }
    $testFiles = @(Get-ChildItem -LiteralPath '.\test' -Filter '*.test.js' -File | ForEach-Object { $_.FullName })
    if ($testFiles.Count -eq 0) { throw 'No test files found' }
    & $desktopExe --test @testFiles
    if ($LASTEXITCODE -ne 0) { throw 'Tests failed' }
} finally {
    if ($null -eq $priorElectronMode) { Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue }
    else { $env:ELECTRON_RUN_AS_NODE = $priorElectronMode }
}
```

显式展开文件，避免依赖PowerShell与Unix shell不同的通配符行为。DSH_INSTALL_DIR指向官方DSH包，不是插件；工具已提供环境变量时可核实后沿用，普通终端没有这些变量是正常情况。

本次Mac打包阶段的实际验证结果见handoff/PACKAGING-REPORT.json；修复阶段此前227项通过。尚未在Windows实机运行，Windows结果以迁移后输出为准。测试拦截模型请求，不代表平台逐模型付费推理通过。

## 4. 加载与继续开发

用Windows DSH官方插件管理器安装install内本次生成的tgz。如当前版本支持开发目录或工作目录链接，使用官方能力指向source。tarball安装是独立副本，修改source不会自动更新；需重打包后经官方管理器更新，或确认开发链接实际指向source。不要用shell npm向profile手动安装。

首次加载后由用户重新授权NovaFlow，核对账户连接和模型目录：应无default/off、提供商默认high；新配置的默认模型为high，后续主动选择low会保留。已有会话显式档位需重选。检查官方安装结果、实际Client资源和原生模型配置；仅显示2.6.1不足以证明加载本次修复。

接续开发入口：

- [开发手册](docs/DEVELOPMENT.md)：模块职责、接口、归属、路由和思考策略。
- [模型修复记录](docs/MODEL_405_REPAIR.md)：405证据、404诊断边界及high迁移。
- [测试与发布](docs/RELEASE.md)：测试、官方加载与实际资源核验。
- [验证记录](VERIFICATION.md)：各历史阶段的证据与限制。

## 5. Windows重打包

先按上节跑完整测试，再执行：

```powershell
npm.cmd run check
if ($LASTEXITCODE -ne 0) { throw 'Syntax check failed' }
npm.cmd pack --ignore-scripts
if ($LASTEXITCODE -ne 0) { throw 'Packaging failed' }
Get-FileHash '.\local-novaflow-dsh-plugin-2.6.1.tgz' -Algorithm SHA256
```

也可运行随源码提供的build.ps1，执行入口语法检查和两组分发／确认门槛测试后打包；可从PowerShell用 & .\build.ps1 调用。它与build.sh一样不替代完整测试、不安装到profile、不重载GUI。按本机执行策略运行脚本，无需更改全局策略。文档与源码更新后必须重新打包，不能复用旧tgz冒充新内容。

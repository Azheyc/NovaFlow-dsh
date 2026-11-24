# NovaFlow 桌面发布

[English](README.md) | 中文

本目录只存放公开打包配置。应用标识选择 NovaFlow 品牌、经镜像访问的 GitHub 更新源，并排除上游强制更新策略。禁止将签名凭据放在此处。构建需要 Windows C++ Build Tools 与 Windows SDK。

## 构建

打包前运行 `node --import tsx apps/desktop/scripts/check-novaflow-plugin-versions.ts --refresh`，提交普通预装插件的版本和锁文件。macOS 和 Windows 构建均重新核对 npm `latest`。插件市场、DSH-IM、DS Bot、dsh-auto-memory 和自媒体工作台保留 NovaFlow 修改。逐项评估上游功能、冲突和测试范围，向维护人申请同意后再合并。NovaFlow 自有插件随本仓库维护。

在仓库根目录用固定版本 pnpm 构建，传入新的递增版本。以下是 Windows x64 命令。

```powershell
$version = Read-Host 'New, approved version; never reuse a published version'
$env:DSH_PACKAGING_PRESET = 'test'
$env:DSH_PACKAGING_CONFIG_DIR = (Resolve-Path apps/desktop/novaflow-release).Path
node node_modules/pnpm/bin/pnpm.mjs --filter @deepseek-ai/dsh-desktop exec tsx scripts/package-target.ts win-x64 --unsigned --build-version $version
```

macOS Apple Silicon 在 macOS 上执行以下命令，`$version` 为同一个发行版本。

```sh
DSH_PACKAGING_PRESET=test DSH_PACKAGING_CONFIG_DIR="$PWD/apps/desktop/novaflow-release" NODE_USE_ENV_PROXY=1 node node_modules/pnpm/bin/pnpm.mjs --filter @deepseek-ai/dsh-desktop exec tsx scripts/package-target.ts mac-arm64 --unsigned --build-version "$version"
```

test 预设隔离发布配置，不调用上游测试策略服务。安装包保留 unsigned 后缀，Windows 可能显示未知发布者。签名版本需要 NovaFlow 自己的证书并沿用现有签名流程，不使用上游证书。

## 发布

在仓库根目录运行 `node apps/desktop/scripts/prepare-novaflow-release.mjs <产物目录> <版本>`。Windows 生成 `stable.yml`、`nightly.yml`，macOS 生成 `stable-mac.yml`、`nightly-mac.yml`。两个频道使用同一版本，下载 URL 通过 gh-proxy.com 引用不可变的 GitHub 版本标签。用两个平台产物的摘要合并生成一份 `SHA256SUMS`。

保留现有版本比较、下载进度、NSIS 安装与重启行为。镜像需支持 HTTPS Release 资产与差分下载的字节范围请求；上游更新器仍保留完整下载回退。不会回退至 DeepSeek 更新源。保留旧 Release 资产可访问。

## 发布检查清单

1. 确认新版本号和源码提交，运行相关测试及完整构建。保持工作树干净，使产物可追溯。
2. 在各自的平台构建 `win-x64` 和 `mac-arm64`。两端都等打包命令成功退出，包内运行时检查通过，再收集产物。Windows 打包脚本与 `start-novaflow.ps1` 共享运行时目录，依次执行。macOS 校验 DMG 和 ZIP 完整性。
3. 对每个平台的 `apps/desktop/.desktop-build/targets/<目标>/unsigned-artifacts` 目录生成更新元数据。校验版本、安装包名、安装包 SHA-512 和按版本固定的 URL。
4. 将目标源码推送到 novaflow remote。创建指向确切提交的 GitHub 草稿 Release。上传 EXE、DMG、ZIP、生成的 blockmap、四份频道文件和合并的 `SHA256SUMS`。
5. 比较 GitHub 资产摘要与本地哈希，再发布为 Latest。核对镜像元数据、完整安装包 SHA-256 和 blockmap 字节。由于更新源使用 releases/latest/download，只标记为 GitHub prerelease 不会成为普通 latest 更新源。
6. 记录版本、提交、检查与限制。分发文件的校验记录和真实版本间升级结果分别记录。

## 数据与已知限制

不得删除现有 review 配置来测试。首次安装使用独立 home 与 Electron user-data 目录。当前未签名安装包无法通过 Windows 签名证书确认发布者身份。HTTPS 与更新文件哈希检查传输和内容一致性，不能代替代码签名。镜像不可用时应报告更新检查失败，不能当作没有新版本。

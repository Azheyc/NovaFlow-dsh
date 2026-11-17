# NovaFlow Windows 发布

[English](README.md) | 中文

本目录只存放公开打包配置。应用标识选择 NovaFlow 品牌、经镜像访问的 GitHub 更新源，并排除上游强制更新策略。禁止将签名凭据放在此处。构建需要 Windows C++ Build Tools 与 Windows SDK。

## 构建

在仓库根目录通过固定版本 pnpm 运行，传入选定的递增版本：

```powershell
$env:DSH_PACKAGING_PRESET = 'test'
$env:DSH_PACKAGING_CONFIG_DIR = (Resolve-Path apps/desktop/novaflow-release).Path
node node_modules/pnpm/bin/pnpm.mjs --filter @deepseek-ai/dsh-desktop exec tsx scripts/package-target.ts win-x64 --unsigned --build-version 0.2.2-rc.3.20261118.1
```

test 预设隔离发布配置，不调用上游测试策略服务。安装包保留 unsigned 后缀，Windows 可能显示未知发布者。签名版本需要 NovaFlow 自己的证书并沿用现有签名流程，不使用上游证书。

## 发布

在 desktop 包中运行 scripts/prepare-novaflow-release.mjs，传入产物目录与版本。脚本生成 stable.yml、nightly.yml 和 SHA256SUMS；目前两个频道接收同一版本。下载 URL 通过 gh-proxy.com 引用不可变的 GitHub 版本标签。将这些文件、安装包及其 blockmap 一起上传至 Azheyc/NovaFlow-dsh，再将 Release 发布为 Latest。不得覆盖已发布版本的资产。宣布可用前，检查镜像返回的元数据和安装包是否符合本地构建校验值。

保留现有版本比较、下载进度、NSIS 安装与重启行为。镜像需支持 HTTPS Release 资产与差分下载的字节范围请求；上游更新器仍保留完整下载回退。不会回退至 DeepSeek 更新源。保留旧 Release 资产可访问。

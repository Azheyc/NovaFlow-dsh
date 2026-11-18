# NovaFlow Windows 发布

[English](README.md) | 中文

本目录只存放公开打包配置。应用标识选择 NovaFlow 品牌、经镜像访问的 GitHub 更新源，并排除上游强制更新策略。禁止将签名凭据放在此处。构建需要 Windows C++ Build Tools 与 Windows SDK。

## 构建

在仓库根目录通过固定版本 pnpm 运行，传入选定的递增版本：

```powershell
$version = Read-Host 'New, approved version; never reuse a published version'
$env:DSH_PACKAGING_PRESET = 'test'
$env:DSH_PACKAGING_CONFIG_DIR = (Resolve-Path apps/desktop/novaflow-release).Path
node node_modules/pnpm/bin/pnpm.mjs --filter @deepseek-ai/dsh-desktop exec tsx scripts/package-target.ts win-x64 --unsigned --build-version $version
```

test 预设隔离发布配置，不调用上游测试策略服务。安装包保留 unsigned 后缀，Windows 可能显示未知发布者。签名版本需要 NovaFlow 自己的证书并沿用现有签名流程，不使用上游证书。

## 发布

在 desktop 包中运行 scripts/prepare-novaflow-release.mjs，传入产物目录与版本。脚本生成 stable.yml、nightly.yml 和 SHA256SUMS；目前两个频道接收同一版本。下载 URL 通过 gh-proxy.com 引用不可变的 GitHub 版本标签。将这些文件、安装包及其 blockmap 一起上传至 Azheyc/NovaFlow-dsh，再将 Release 发布为 Latest。不得覆盖已发布版本的资产。宣布可用前，检查镜像返回的元数据和安装包是否符合本地构建校验值。

保留现有版本比较、下载进度、NSIS 安装与重启行为。镜像需支持 HTTPS Release 资产与差分下载的字节范围请求；上游更新器仍保留完整下载回退。不会回退至 DeepSeek 更新源。保留旧 Release 资产可访问。

## 发布检查清单

1. 确认新版本号和源码提交，运行相关测试及完整构建。保持工作树干净，使产物可追溯。
2. 执行上面的 Windows 构建。归档完整性和打包运行时检查必须成功，不能因为失败构建留下了 exe 就发布。
3. 在仓库根目录运行 node apps/desktop/scripts/prepare-novaflow-release.mjs apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts $version，核对生成的五个资产均对应本次版本。
4. 将目标源码推送到 novaflow remote。创建指向确切提交的 GitHub 草稿 Release，只上传 exe、对应 blockmap、stable.yml、nightly.yml 和 SHA256SUMS。不上传 win-unpacked、日志或测试材料。
5. 比较 GitHub 资产摘要与本地哈希，再发布为 Latest。核对镜像元数据、完整安装包 SHA-256 和 blockmap 字节。由于更新源使用 releases/latest/download，只标记为 GitHub prerelease 不会成为普通 latest 更新源。
6. 记录版本、提交、检查与限制。重启已有开发配置并确认 Host 就绪。首个版本验证分发链路，真实版本间升级验收需要后续版本或独立测试版本。

## 数据与已知限制

不得删除现有 review 配置来测试。首次安装使用独立 home 与 Electron user-data 目录。当前未签名安装包无法通过 Windows 签名证书确认发布者身份。HTTPS 与更新文件哈希检查传输和内容一致性，不能代替代码签名。镜像不可用时应报告更新检查失败，不能当作没有新版本。

# NovaFlow 开发文档

[English](NOVAFLOW-DEVELOPMENT.md) | 中文

本文列出 NovaFlow 定制功能对应的源码与验证入口。先阅读仓库 AGENTS.md，本工作区优先使用 develop.ps1 与 start-novaflow.ps1。当前客户端基于官方 [`dsh-v0.2.2-rc.5`](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.5)，源码位于独立的 deepseek-harness 仓库。

## 功能归属

| 领域 | 源码与维护文档 |
| --- | --- |
| 开屏、自动校验授权 | src/novaflow-account-backend.ts、src/client/WelcomePage.tsx；[账户整合](../novaflow-plugin/INTEGRATION.zh.md) |
| 账户、余额、模型同步 | apps/novaflow-plugin；[整合说明](../novaflow-plugin/INTEGRATION.zh.md)优先于历史独立插件说明 |
| 离线预装 | preinstalled/package.json、scripts/prepare-novaflow-preinstalled.ts、src/novaflow-preinstalled.ts |
| 插件市场账户权限 | 账户插件根据平台的 `identity_scope` 控制市场加载。登录企业账号后，Host 撤下市场接口和客户端入口。权限随身份切换重新计算。 |
| 连接手机 | `prepareLocalIm()` 将 [`@xmanrui/dsh-im`](https://github.com/xmanrui/dsh-im) 的客户端适配纳入离线预装。插件启用时始终注册「连接手机」入口。客户端更新替换本地插件文件，沿用现有包名和机器人配置。 |
| 自媒体工作台 | 从 `preinstalled/media-desk/source/` 编译 `novaflow-media-desk`，随客户端离线预装。该目录基于 [dsh-media-desk v2.7.2](https://github.com/woniuniuniu/dsh-media-desk/tree/v2.7.2)，MIT 许可随包保留。 |
| 全局技能与旧预设兼容 | [NovaFlow 技能与预设](../novaflow-modes/README.zh.md) |
| 首页提示词与设置 | [提示词插件](../../plugins/prompt-presets/README.zh.md)。维护所有模式共用的内置预设时编辑 `catalog.js`。`index.js` 保存自定义库，`client.jsx` 在新会话展示预设，并在设置中直接打开自定义编辑器。 |
| 模型地址与请求 | [模型同步](../novaflow-plugin/src/native-models.js)负责受管地址迁移；[请求鉴权](../novaflow-plugin/src/model-bridge.js)负责平台令牌和分组头；[适配器入口](../../packages/llm/llm-pi-ai/src/index.ts)接入推理与发现 |
| Logo 与首页动画 | resources/novaflow、scripts/render-novaflow-brand.ts、scripts/render-novaflow-animation.ts、packages/client/ui-brand-official |
| macOS、Windows 安装及镜像更新 | [发布手册](novaflow-release/README.zh.md)、scripts/novaflow-distribution.mjs |
| 更新弹窗 | [版本卡片](src/client/release-card.tsx)、[更新弹窗](src/update-dialog.ts)、[Mac DMG 下载](src/updates/novaflow-dmg.ts) |

表中路径默认相对于 apps/desktop；以 apps/ 或 packages/ 开头的路径相对于仓库根目录。账户扩展是受保护的客户端功能，社区插件管理保持独立。登录不安装插件。会话内的模式选择仅影响当前会话，设置中的选择决定新会话默认值。

## 开发流程

使用仓库固定的 pnpm 和要求的 Node 版本。工作区脚本提供 install、build、check 命令；build 生成 Host、Client、Desktop 产物并检查类型。按改动运行测试，产物过期时重新构建，然后只重启本工作区的开发进程，确认新 Host 就绪。

工作区 review 启动脚本保留 .desktop-build/novaflow-review，调试端口为 9329、9322、9330。上游普通开发入口使用 .desktop-build/development，端口为 9229、9222、9230。首次安装测试使用独立 home，不能清空已有用户的登录、会话或模型设置。日志可能含本地认证令牌，必须保留在私有本机目录。

macOS 的 NovaFlow 开发版快捷方式会在启动 Electron 前从仓库执行 `node --import tsx apps/desktop/scripts/prepare-novaflow-preinstalled.ts apps/desktop/.desktop-build/novaflow-review/project`。该命令按当前锁文件同步 review 运行时的预装资源，保留独立的用户配置和会话目录。

## 预装插件升级

以 [预装清单](preinstalled/package.json) 和 [锁文件](preinstalled/pnpm-lock.yaml) 为版本依据。`prepareNovaFlowPreinstalled()` 应用市场补丁、生成连接手机及自媒体工作台的本地版，并编译提示词插件。最终发货清单读取构建产物 `novaflow-preinstalled/package.json`。

预装资源按目标系统和架构分别缓存。打包时从 pnpm 安装目录提取清单中的插件及各自的私有依赖。`dsh-ops` 随包提供目标平台的 worker 和校验记录。Windows x64 另保留 Niubash、Git 和离线读取 WSL 文件所需的 Linux x64 worker。

| 插件 | 合并上游时保留的行为与源码 |
| --- | --- |
| 团队模式 | 从欢迎页登录后进入标准界面，通过「进入团队模式」打开 DS Bot。团队模式接管会话期间撤下标准首页的提示词分类和推荐，返回标准模式后恢复。连接手机负责渠道配置和团队 Bot 选择。 |
| 持久记忆 | 内置 dsh-auto-memory 补丁在获取设置锁之前创建数据目录。「陪伴（日常）」默认使用 32 KB 预算和重要度门槛 1。已有的用户设置优先。 |
| 插件市场 | `preinstalled/patches/dshmarket@<version>.patch`。在线目录继续更新，隐藏赞助区及顶部检查失败提示，市场自身随客户端更新。默认可从「插件」页进入市场，侧栏入口可手动开启。市场因 Host 重载时正常返回插件安装和更新结果。 |
| 连接手机 | `prepareLocalIm()`。保留包名和机器人配置，隐藏 GitHub 和插件自身更新入口，启用插件时始终显示「连接手机」。页面副标题为「让NovaFlow触手可及」。 |
| 自媒体工作台 | 保留独立「无限画布」入口、每张画布独立的 DSH 会话和 NovaFlow Image 接入。默认目录是 `$DSH_HOME/media-desk/files`，用户可修改或恢复默认，旧文件按原目录读取。图像节点支持 1K、2K，使用客户端模型页选中的生图模型。 |
| 提示词预设 | `plugins/prompt-presets/`。所有模式共用内置库，设置只开放自定义预设，客户端升级替换内置库并保留用户自定义内容。 |
| Exa 与 Agent 预设 | `seedExaSearchDefault()` 为未配置的搜索提供方默认选 Exa。NovaFlow 模式筛选继续隐藏 OPS 和创造模式。 |

自媒体工作台首次进入「灵感」。点击独立的「无限画布」入口会直接打开上次使用的画布，找不到时打开列表首项。`POST /media-desk/canvas/open` 在保存队列中检查画布列表，列表为空时只创建一张「未命名」。合并上游时在 `preinstalled/media-desk/source/client/board/` 保留节点编辑与工具栏交互，在 `src/canvas*.js` 保留画布会话、生成任务和存储流程。

1. 更新第三方版本时同时更新清单与锁文件。将市场补丁移植至新包，并核对连接手机与自媒体工作台的构建适配。重新生成预装资源，任何补丁或适配失败均须修复后再打包。
2. 打包前运行 `novaflow-preinstalled.spec.ts`、`welcome-flow.e2e.ts` 和 `novaflow-market-install.e2e.ts`。验证全新 profile 的离线预装、旧 profile 的配置与启停状态保留，以及市场重载后的操作结果。涉及提示词或生图时，同时运行对应插件测试。

## 按改动选择验证

提示词随桌面安装时，构建脚本将插件源码编译到离线预装资源。生成独立安装包时，在源码仓库根目录运行以下 PowerShell。打包输入取自构建脚本实际返回的目录，其中包含宿主加载的 `client.js`。

```powershell
$seed = node --import tsx --input-type=module -e "import {prepareNovaFlowPreinstalled} from './apps/desktop/scripts/prepare-novaflow-preinstalled.ts'; console.log(prepareNovaFlowPreinstalled())" | Select-Object -Last 1
if ($LASTEXITCODE -ne 0) { throw 'Plugin preparation failed' }
npm.cmd pack (Join-Path $seed 'node_modules/novaflow-dsh-prompt-presets') --pack-destination apps/desktop/.desktop-build
```

命令在仓库根目录运行。Vitest 命令使用 node node_modules/pnpm/bin/pnpm.mjs exec 前缀。welcome-flow.e2e.ts 使用 vitest.e2e.config.ts，先完成构建。运行 node --test apps/novaflow-plugin/test/*.test.js 前，将 DSH_INSTALL_DIR 设为 apps/cli 的绝对路径。

| 改动 | 针对性验证 |
| --- | --- |
| 账户 | 账户 Node 测试；桌面 welcome/account 渲染测试；模拟平台传输的真实 Host welcome-flow.e2e.ts |
| 提示词 | `node --test plugins/prompt-presets/catalog.test.mjs` 验证内置写入拒绝、跨模式旧数据迁移和并发保存。`novaflow-preinstalled.spec.ts` 验证更新预装包后保留自定义文件；`welcome-flow.e2e.ts` 核对首次启动的共享库。 |
| 模型同步 | `native-models.test.js` 验证地址迁移、分组改名、自定义标题及手动刷新。`media-service.test.js` 验证媒体模型分组元数据和已有选择。`model-bridge.test.js` 验证请求地址、鉴权和分组头。`welcome-flow.e2e.ts` 验证 Host 登录和模型发现。 |
| 预装 | novaflow-preinstalled.spec.ts、project-manager.spec.ts、runtime-manifests.spec.ts；实际安装包的离线首次配置初始化 |
| 插件市场 | `novaflow-market-install.e2e.ts` 使用本地测试仓库验证安装和更新。市场重载后由当前 Host 提供加载状态，原请求继续完成版本校验并返回结果。 |
| 全局技能与旧预设兼容 | `novaflow-mode-isolation.spec.ts`、`novaflow-client-identity.e2e.ts` 和 Host 预设列表 |
| 无限画布 | 工作台插件的 `test/*.test.js` 覆盖文档和节点。`novaflow-board-interaction.spec.tsx` 覆盖节点和工具栏交互，`novaflow-board.e2e.ts` 验证默认存储、并发首次打开、助手修改及重启复用。 |
| 更新 | `novaflow-distribution.spec.ts` 验证资产命名、摘要和两频道日志。`novaflow-dmg.spec.ts` 验证进度、摘要和不完整文件。`update-coordinator.spec.ts` 验证下载和安装交接。`fixtures/update-dialogs.mjs` 验证弹窗渲染。发布前核对包内 `app-update.yml`、镜像清单与两端实机升级。 |
| 安装器 | scripts/test-windows-installer.mjs；完整 package-target 构建及其打包运行时检查 |

ASAR 中的预装包必须递归读取并写出，不能使用原生 cpSync。生成运行时完整性清单前先应用归档元数据清理。修改预装或打包逻辑时保留这些验证。模拟平台测试不证明真实账号或付费模型已可用。

## 发布与交接

遵循 [NovaFlow 发布手册](novaflow-release/README.zh.md)。源码发布到 Azheyc/NovaFlow-dsh 的 main，本地定制分支可保留独立名称。上游 origin 仅供参考，novaflow remote 指向个人仓库。不得复用已发布版本或覆盖资产。当前未签名发行不声称具备已验证发布者身份，两个更新频道目前通过 gh-proxy.com 接收同一版本。

五项内容技能随 `apps/novaflow-modes/skills/` 打包，由 Host 注册到全局技能目录。已有内容平台会话及默认预设按标准模式运行。长期授权取决于平台接受文档约定的凭据协议。

## 文档维护

当前行为维护在上面链接的归属文档中。带日期的测试结果保留在工作区验收记录，不把历史失败改写为已经通过。仓库文档修改时同步双语并更新配对记录。生成目录必须通过脚本重新生成。原始迁移资料、凭据、用户配置、依赖和构建产物不进入源码提交。

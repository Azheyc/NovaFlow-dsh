# NovaFlow 开发文档

[English](NOVAFLOW-DEVELOPMENT.md) | 中文

本文列出 NovaFlow 定制功能对应的源码与验证入口。先阅读仓库 AGENTS.md，本工作区优先使用 develop.ps1 与 start-novaflow.ps1。当前客户端基于官方 `dsh-v0.2.2-rc.5`（`9c2670d3bc`），源码位于独立的 deepseek-harness 仓库。

## 功能归属

| 领域 | 源码与维护文档 |
| --- | --- |
| 开屏、自动校验授权 | src/novaflow-account-backend.ts、src/client/WelcomePage.tsx；[账户整合](../novaflow-plugin/INTEGRATION.zh.md) |
| 账户、余额、模型同步 | apps/novaflow-plugin；[整合说明](../novaflow-plugin/INTEGRATION.zh.md)优先于历史独立插件说明 |
| 离线预装 | preinstalled/package.json、scripts/prepare-novaflow-preinstalled.ts、src/novaflow-preinstalled.ts |
| 会话模式与首次指引 | [模式扩展](../novaflow-modes/README.zh.md)、apps/novaflow-modes/modes.js |
| 首页提示词与设置 | [提示词插件](../../plugins/prompt-presets/README.md)；`catalog.js` 定义默认内容，`client.jsx` 和 `style.css` 控制界面，`index.js` 在当前 profile 中保存修改 |
| 模型地址与请求 | [模型同步](../novaflow-plugin/src/native-models.js)负责受管地址迁移；[请求鉴权](../novaflow-plugin/src/model-bridge.js)负责平台令牌和分组头；[适配器入口](../../packages/llm/llm-pi-ai/src/index.ts)接入推理与发现 |
| Logo 与首页动画 | resources/novaflow、scripts/render-novaflow-brand.ts、scripts/render-novaflow-animation.ts、packages/client/ui-brand-official |
| Windows 安装及镜像更新 | [发布手册](novaflow-release/README.zh.md)、scripts/novaflow-distribution.mjs |

表中路径默认相对于 apps/desktop；以 apps/ 或 packages/ 开头的路径相对于仓库根目录。账户扩展是受保护的客户端功能，社区插件管理保持独立。登录不安装插件。会话内的模式选择仅影响当前会话，设置中的选择决定新会话默认值。

## 开发流程

使用仓库固定的 pnpm 和要求的 Node 版本。工作区脚本提供 install、build、check 命令；build 生成 Host、Client、Desktop 产物并检查类型。按改动运行测试，产物过期时重新构建，然后只重启本工作区的开发进程，确认新 Host 就绪。

工作区 review 启动脚本保留 .desktop-build/novaflow-review，调试端口为 9329、9322、9330。上游普通开发入口使用 .desktop-build/development，端口为 9229、9222、9230。首次安装测试使用独立 home，不能清空已有用户的登录、会话或模型设置。日志可能含本地认证令牌，必须保留在私有本机目录。

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
| 提示词 | `node --test plugins/prompt-presets/catalog.test.mjs`；分别在原版 DSH 与 NovaFlow 的新会话验证切换类型、悬停预览、确认替换和设置重载 |
| 模型地址 | `native-models.test.js` 验证旧地址迁移和手工修改保留；`model-bridge.test.js` 验证请求目的地、动态鉴权及分组头；`welcome-flow.e2e.ts` 验证 Host 登录和分组模型发现 |
| 预装 | novaflow-preinstalled.spec.ts、project-manager.spec.ts、runtime-manifests.spec.ts；实际安装包的离线首次配置初始化 |
| 模式隔离 | novaflow-mode-isolation.spec.ts 与真实 Host 预设列表；检查临时选择不改变默认值或丢失草稿 |
| 更新 | novaflow-distribution.spec.ts、desktop-auto-update-environment.spec.ts、desktop-policy-environment.spec.ts；包内 app-update.yml 和镜像资产 |
| 安装器 | scripts/test-windows-installer.mjs；完整 package-target 构建及其打包运行时检查 |

ASAR 中的预装包必须递归读取并写出，不能使用原生 cpSync。生成运行时完整性清单前先应用归档元数据清理。修改预装或打包逻辑时保留这些验证。模拟平台测试不证明真实账号或付费模型已可用。

## 发布与交接

遵循 [Windows 发布手册](novaflow-release/README.zh.md)。源码发布到 Azheyc/NovaFlow-dsh 的 main，本地定制分支可保留独立名称。上游 origin 仅供参考，novaflow remote 指向个人仓库。不得复用已发布版本或覆盖资产。当前未签名发行不声称具备已验证发布者身份，两个更新频道目前通过 gh-proxy.com 接收同一版本。

后续专用插件加入 modes.js 的两份清单，同时纳入离线发行资源。只允许会话隔离能力，缺失或不支持隔离的插件必须明确显示不可用。模式和预装不需要服务端变更；长期授权仍取决于平台接受文档约定的凭据协议。

## 文档维护

当前行为维护在上面链接的归属文档中。带日期的测试结果保留在工作区验收记录，不把历史失败改写为已经通过。仓库文档修改时同步双语并更新配对记录。生成目录必须通过脚本重新生成。原始迁移资料、凭据、用户配置、依赖和构建产物不进入源码提交。

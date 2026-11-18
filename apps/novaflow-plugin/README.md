# NovaFlow for DeepSeek Harness

本目录为定制桌面端内置的 workspace 副本。开发与打包入口见[桌面整合说明](INTEGRATION.zh.md)；下文的独立插件安装说明供原插件分发方式参考。

版本 **2.6.1**，兼容 DeepSeek Harness **0.2.2-rc.2 和 0.2.2-rc.3**。通过 NovaFlow 浏览器设备授权登录，使用 DSH 官方模型配置管理连接与思考深度，无需复制平台 API Key。

## 获取与安装

源码仓库：[Azheyc/novaflow-dsh-plugin](https://github.com/Azheyc/novaflow-dsh-plugin)。

从 [GitHub Releases](https://github.com/Azheyc/novaflow-dsh-plugin/releases) 下载与当前DSH版本匹配的 `.tgz` 安装包，通过DSH官方插件管理能力安装并启用。Release同时提供 `SHA256SUMS`，用于核对下载文件。2.6.1继续适配DSH **0.2.2-rc.2、0.2.2-rc.3**，不自动放行后续未验证版本；详细步骤见[安装与快速开始](docs/GETTING_STARTED.md)。

这是独立插件包，无需替换DSH应用。仓库保留 `private:true`，不通过npm公共仓库发布；GitHub源码仓库和Release安装包公开提供。

## 文档入口

- [文档索引](docs/README.md)：按任务选择阅读路径与当前行为基线。
- [安装与快速开始](docs/GETTING_STARTED.md)：安装、升级、登录、首次使用和退出。
- [开发手册](docs/DEVELOPMENT.md)：架构、源码地图、配置、接口、凭据和生命周期。
- [测试与发布](docs/RELEASE.md)：环境、测试矩阵、打包及实际客户端资源核验。
- [故障排查](docs/TROUBLESHOOTING.md)：登录、原生模型、预装资源和MCP冲突。
- [验证记录](VERIFICATION.md)：各版本实际执行的检查与未验收范围。

## 登录与模型配置

1. 打开 **账户与余额 → 登录 NovaFlow**，在网页登录并由本人确认授权。
2. 插件将授权连接保存到官方 **设置 → 模型** 的提供商配置中。已登录的2.0用户升级后会自动迁移。
3. 在 **设置 → 模型** 中展开 NovaFlow 提供商，可使用原生的获取模型、添加、编辑、删除和保存流程。
4. 模型名称默认使用原始模型 ID，不追加分组名称。相同模型在不同分组中的路由仍然独立，分组只由提供商归属区分。
5. 新的首次登录会选择首个可用模型作为新会话默认模型。2.5.0按模型家族拆分提供商时，默认选择会随同一模型转到新提供商；已有会话若引用被拆走的模型，需要在会话中重新选择。

账户页负责登录、同步与余额展示，模型编辑和选择使用官方模型页。

后台每 10 分钟同步账户授权目录，保留用户修改的模型名称、能力设置及删除操作。点击「刷新账户与模型」时按当前授权目录重建 NovaFlow 受管配置，还原改动并补回被删除的模型和分组。

## 账户余额

2.6.0通过 NovaFlow New API 已有的 `GET /api/novaflow/v1/plugin/usage` 路由读取余额，使用当前 `nfds_` 设备 access token；无需 Cookie、PAT、后台模型 Key 或后端改造。这是平台既有的插件用量接口。标准 `/v1/dashboard/billing/subscription`、`/v1/dashboard/billing/usage` 不接受 creator 令牌，也不适用于企业钱包，因此这里不使用标准 billing 端点。

账户页主显可用余额（`available`），并展示总额（`balance`）、冻结（`frozen`）与更新时间（`as_of`）。个人账户展示个人钱包；企业账户展示公司共享钱包。金额均由服务端换算为 CNY decimal 字符串，客户端直接展示，不再除以 `QuotaPerUnit` 或乘汇率。成员日／月限额、已用和剩余额度另行展示，不当作公司总余额；`null`／不限额不显示成0，`canUse=false` 会提示额度限制。

登录成功、账户刷新和默认每10分钟的后台刷新完成后，插件非阻塞读取余额；也可点击“刷新余额”或调用 `novaflow_account` 的 `refresh_balance` 单独刷新。界面约1.8秒轮询只查询当前 Host 状态，不重复调用平台余额接口。余额失败不影响模型登录：界面明确显示 error／unavailable；已有成功数据保留并标注旧数据，无成功数据时不显示假0。退出、授权拒绝或身份切换会清除余额，并中止或忽略旧请求。

2.6.0历史核验时账户为 `AUTH_REQUIRED`，尚无真实在线金额验收结果；这不是2.6.1的新现场记录。需用户自行恢复设备授权后，对照平台核验当前钱包、限额和更新时间；不为验收自动登录或退出。执行证据见[验证记录](VERIFICATION.md)。

## 桌面预装与 Agent 模式

当前桌面版从随包资源一次性初始化四个社区插件，无需登录后下载。版本与迁移规则见[桌面整合说明](INTEGRATION.zh.md)。账户插件不再提供推荐清单、安装弹窗、进度、运行时预检或安装动作；旧安装状态不参与登录。旧 confirm_plugins、dismiss_plugins、retry_plugins 请求返回 UNSUPPORTED_ACTION。

建模模式与自媒体创作模式由独立的 [NovaFlow 模式扩展](../novaflow-modes/README.zh.md) 提供，当前均继承标准能力。账户与余额为客户端核心功能，不能通过插件管理关闭、卸载、独立更新或编辑配置。

## 配置思考深度

1. **设置 → 模型 → 对应 NovaFlow 提供商 → 模型编辑 → 高级**：检查模型的思考档位和请求值，受管配置统一去掉default／off并保留high。
2. 在对话底部的原生模型选择器中选择模型，再选择实际使用的思考深度。

2.5.0按原始模型ID选择协议：**Claude系列使用 Anthropic Messages，其余文本模型使用 OpenAI Responses**。Claude匹配不区分大小写，支持原始ID开头及常见vendor前缀、斜杠、冒号或点分隔形式。历史source提供商标识保留；纯家族提供商原地更新协议和本机URL，混合source按家族拆出确定性child提供商。原生名称、容量、已删除模型和 `modelOverrides` 随家族保留，分组继续按授权group路由。

2026-11-17本地修复统一移除NovaFlow受管模型的 **default、off**，提供商默认思考强度设为 **high**。模型和显式覆盖配置保留有效自定义映射，并补足high；优先采用官方模型metadata，无metadata时Claude回退为low／medium／high，Responses回退为low／medium／high／xhigh／max，不额外声明adaptive。

新配置的默认模型使用high；首次迁移会把当前受管NovaFlow默认选择也设为high，后续用户主动选择low等有效档位会保留。已有会话的显式档位需自行重选。未指定档位的请求由官方Config、catalog、adapter与SDK使用提供商的high默认值；这些配置不保证平台逐模型支持图片和全部档位。

图片能力的首次启用遵循原有开关语义。`novaflow_account` 的 `migrate_protocols` 只迁移尚未应用家族策略的旧受管协议，保留图片设置和有效自定义档位，同时应用上述思考规则；可离线编辑已保存受管配置，离线不发布缓存桥权限。`configure_models` 显式重新应用家族协议、text/image输入与协议原生档位，跨协议清理不适用compat。普通刷新保留名称、容量、删除、图片和无关override，但持续规范思考档位。该修复尚未发布，已安装的旧分发包需更新；本地链接需重载插件或重启后核对生效，详见[模型修复记录](docs/MODEL_405_REPAIR.md)。

## 内置 NovaFlow Image MCP

插件内提供同名 MCP 服务，并通过 DSH 官方 MCP 客户端连接；不依赖 Magpie 应用、Magpie Gateway 或其模型设置。旧的外部 Magpie MCP 入口会停用，内置工具名称如下：

- `mcp__novaflow-image__generate_image`：默认使用「设置 → 模型」中选择的图片模型和分组。支持文字生图、本地/HTTPS参考图编辑、1～4张输出及 size/quality/background。
- `mcp__novaflow-image__generate_video`：使用「设置 → 模型」中选择的视频模型和分组。
- `mcp__novaflow-image__list_models`：只读列出当前账户授权的图片/视频模型和分组。多组同名模型要求明确group，不自动选择计费路由。
- `mcp__novaflow-image__generation_result`：查询返回的作业ID并取得本地结果文件。

工具描述和MCP服务器instructions已同步修改。DSH将服务器instructions加入模型系统提示词，不再提示到Magpie选择模型。图片模型没有权限时明确失败，不自动切换其他模型。

长任务短暂等待后返回作业ID；继续查询，不重复提交。网络中断或重启导致结果未知时显示unknown，提醒可能已计费，须检查平台历史后再决定下一步。视频轮询使用可信平台内容接口，不要求手动复制下载链接。

结果默认写入DSH默认工作目录的`generated-images/`或`generated-videos/`；相对path和参考图也按该默认工作目录解析。已有输出文件在提交前拒绝，路径不越出默认工作目录、不穿过符号链接。作业元数据在该工作目录`.novaflow-media/jobs/`持久保存，不含平台凭据。

媒体服务使用NovaFlow当前设备凭据，退出/卸载会中止在途本机工作。原生模型页的图片输入选项与这里的图片生成功能是独立操作。当前视频实现采用平台标准`/v1/videos`；各模型的参考图上传能力仍以其后端为准，不承诺适配全部非标准视频扩展。

## 连接与凭据

原生提供商的本机连接地址由插件管理，保留插件填入的地址即可。该地址使用仅本机可用的独立连接凭据；平台设备访问/刷新凭据不写入模型配置。真实模型请求仅转发到固定 NovaFlow 平台，并由插件附加设备 Bearer 与分组标识。

模型发现走官方“获取模型”流程；调用正文中的思考、工具及协议字段由原生 SDK 生成，本机转接不重写它们。平台撤销某个组或模型权限后，即使保留了原生模型配置，该连接也无法继续调用该模型。

## 退出与保留

退出会清除本机登录、插件持有的连接凭据及 NovaFlow 受管提供商和模型配置，中止运行中的 NovaFlow 请求，并尝试撤销当前设备。重新登录时按当前授权目录重建模型配置。若默认模型仍指向 NovaFlow，会恢复登录前的默认模型；后来切换到其他供应商的选择保留。

普通后台刷新不会覆盖用户改过的连接地址、协议或密钥。若用户将某个原生提供商改作其他连接，插件停止管理该连接，不删除后来替换的密钥。

远端撤销失败会明确提示在 NovaFlow“安全与访问”手动撤销设备，不会退出网页登录或撤销其他设备。刷新响应丢失时不重放旧refresh，要求重新登录。

## 范围与限制

- 对话模型接入 `kind=text` 的授权目录；图片/视频生成由内置MCP独立提供，使用平台图片/视频endpoint目录。
- 余额来自平台 New API 的既有 `plugin/usage` 设备接口；真实金额与当前身份以服务端响应为准，读取失败不显示假0，历史缓存明确标旧。
- 容量、输出上限与能力先采用可确认的内置目录；未知型号采用32768上下文预算、4096默认输出上限、文本输入，可在官方模型页修改。
- 网页账户入口替换官方账户UI；不修改应用安装文件或原生首次启动欢迎窗口。
- 当前仅适配指定DSH版本。升级DSH后须核对官方配置和SDK契约。

## 开发与验证

开发使用Node.js 24及以上，并准备当前DSH安装供官方库集成测试解析。普通Node环境可在包目录运行：

```bash
npm install --ignore-scripts --no-audit --no-fund
npm run check
npm test
```

DSH工具环境使用自带Electron运行时时，测试命令为：

```bash
ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" --test test/*.test.js
```

全量检查通过后按[测试与发布](docs/RELEASE.md)打包。构建脚本仅执行语法检查和两组契约测试，不能代替全量测试。测试使用内存凭据、mock上游和临时回环HTTP服务器，不发生付费模型请求；真实官方Config、catalog、adapter与SDK进入思考深度测试。已执行的结果见[验证记录](VERIFICATION.md)。

Agent工具 `novaflow_account` 支持 `state`、`refresh`、`refresh_balance`、`cancel`、`signout`、`configure_models`、`migrate_protocols`。`state`返回不含密钥的账户、余额、原生配置及分发摘要，不发起平台余额请求；`refresh_balance`单独刷新余额；`configure_models`显式重设能力，`migrate_protocols`仅做一次家族协议迁移。`start` 仅对交互HTTP开放，详见[开发手册](docs/DEVELOPMENT.md#4-本机接口与调用权限)。

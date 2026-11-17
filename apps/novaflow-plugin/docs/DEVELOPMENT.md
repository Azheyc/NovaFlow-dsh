# NovaFlow 插件开发手册

适用：插件 2.6.1，DSH 0.2.2-rc.2／0.2.2-rc.3，Node.js ≥24。核对日期：2026-11-17，包含本地尚未发布的模型路由与思考策略修复。本文描述当前源码，功能入口见[使用说明](../README.md)，测试与分发见[测试与发布](RELEASE.md)，现场修复证据见[模型修复记录](MODEL_405_REPAIR.md)。

## 1. 项目边界与依据

本项目是通过官方 PluginManager 安装到当前 profile 的 Host／Client bundle，不修改 DSH 应用安装文件。包名为 `@local/novaflow-dsh-plugin`，Host 插件名为 `novaflow-account`。清单和入口见[包清单](../package.json)、[Host 入口](../index.js)、[Client 入口](../client.js)、[加载补丁](../cordis.patch.yml)。

平台契约依据 NovaFlow 平台内部的《35 创作工作台登录与凭据》专题。该内部文档不随公开仓库分发；接入实现和必要协议摘要见下文，平台契约变更由维护者对照内部文档核对。

平台文档中的旧桌面客户端已归档说明，不代表本独立插件停止维护。平台接口存在也不代表本插件已集成全部接口：例如本插件不取得 `/creator/content/credential` 的共享内容凭据。2.6.0余额采用平台 New API 既有的 `/plugin/usage` 设备接口，无需修改后端；它不是标准 dashboard billing 端点，具体契约见下文。

DSH API 以当前安装的运行时 Inspect 与官方源码为准。需要新接口时先调用 `cordis_inspect_list`，再按返回的 provider、method 和 schema 查询；Inspect 仅提供只读契约，不能把 Inspect 方法当作业务 Service 使用。此次配置表已与实时 `Config.listConfigs` 核对。

## 2. 架构与源码地图

```mermaid
flowchart TD
  UI[账户页与安装弹窗] -->|已认证的交互请求| Host[Host 操作入口]
  Agent[novaflow_account 工具] -->|受限动作| Host
  Host --> Account[PKCE 与设备会话]
  Account --> Platform[NovaFlow 平台]
  Account --> Binding[原生模型配置绑定]
  Binding --> Config[官方 ConfigEditor 与模型页]
  Config --> SDK[官方 adapter 与 SDK]
  SDK --> Bridge[本机鉴权桥]
  Bridge --> Platform
  Host --> Flow[用户确认门槛]
  Flow --> Bootstrap[固定插件安装队列]
  Bootstrap --> Manager[官方 PluginManager]
  MCP[官方 MCP 客户端] --> Media[内置媒体 MCP 与作业服务]
  Media --> Platform
```

| 文件 | 职责与修改时应关注的边界 |
|---|---|
| [Host 入口](../index.js) | 注入服务、配置、HTTP／工具动作、回调、定时刷新和清理 |
| [Client 入口](../client.js) | 动态模块、账户视图、安装弹窗、共享状态与轮询、中英字典 |
| [协议层](../src/protocol.js) | 固定发行方、请求封装、令牌形状与回调地址校验、安全错误码 |
| [账户状态机](../src/account.js) | PKCE、取消、回调、轮换、退出和撤销 |
| [原生模型绑定](../src/native-models.js) | 读取随 DSH 分发的库、官方配置写入、受管归属及用户编辑保留 |
| [模型桥](../src/model-bridge.js) | 本机连接鉴权、动态设备凭据、分组及协议转发、流式响应 |
| [媒体 MCP](../src/media-mcp.js) | Streamable HTTP、工具 schema、鉴权与协议响应 |
| [媒体作业服务](../src/media-service.js) | 模型和分组选择、生成、轮询、结果文件及持久作业恢复 |
| [分发诊断](../src/release.js) | 发布版本、安装流程标识、真实客户端 revision 与资源地址 |
| [中文资源](../locale/zh.json)、[英文资源](../locale/en.json) | 与 Client 内嵌字典保持一致，由分发契约测试校验 |

## 3. Host 配置与服务

配置由 `Schema` 的默认导出构建，应用时要求 `maxTokens < contextWindow`。保存配置通过官方编辑能力完成，不手工改写 profile 文件。

| 字段 | 默认值 | 范围与语义 |
|---|---|---|
| `enableAllCapabilities` | `true` | 控制首次图片输入等能力增强，协议按模型家族选择；`configure_models`显式重新启用能力。无论此开关取值，受管模型均应用明确的思考策略：移除default/off、补足high、提供商默认high |
| `contextWindow` | `32768` | 8192～1048576；缺少已知模型元数据时的上下文预算 |
| `maxTokens` | `4096` | 1024～131072，并小于上下文预算；初始化时的输出上限参数 |
| `modelsRefreshInterval` | `600000` | 60000～3600000 毫秒；仅已连接时定时刷新 |

Host 必需注入 `credentials`、`connection`、`webServer`、`llm`、`agentDefaultModel`、`tools`、`configEditor`、`mcpManager`、`workingDirectory`、`pluginManager`、`storageDomain`。可选的 `clientModules` 用于分发诊断，不应作为登录前置条件。

Client 使用 `window.__ModuleLoader__.load` 注册动态模块，注入 `slots`、`locale`，通过运行时加载 React。主要 Slot 为 `settings.section`、`settings.launcher`、`settings.models.sign-in`、`settings.models.footer` 与 `shell.overlay`；安装弹窗 ID 是 `novaflow-plugin-install-confirmation`。

## 4. 本机接口与调用权限

| 入口 | 用途与限制 |
|---|---|
| POST `/api/novaflow-account` | 通过 Connection 认证，要求 owner 且 `interactions=answer`；JSON 请求，只接受 `action`、可选 `attemptId`、可选 `confirmationId`，正文最多4096字符 |
| GET `/novaflow/callback` | 浏览器授权回调；核对 Host、当前 state、发行方、期限和登录代次 |
| `/novaflow/models/<provider>` 前缀 | 本机模型桥；独立本机凭据，按受管路由限定模型、协议和分组 |
| POST `/novaflow/magpie-image/mcp` | 回环 Streamable HTTP MCP；独立 Bearer、本机来源和 Host 校验 |

### 模型路由的注册与匹配

在 `src/native-models.js` 注册 `kind=prefix`、`path=/novaflow/models`，此处不能带尾部斜杠：当前 WebServer 用 `prefix` 或 `prefix + /` 匹配，注册成 `/novaflow/models/` 会使正常子路径落入静态资源回退，POST 返回405且可能带 `Allow: GET, HEAD`。`src/model-bridge.js` 内部用于校验原始请求路径的 `PREFIX=/novaflow/models/` 则必须保留尾部斜杠，两处用途不同。

Responses提供商的baseURL为 `http://127.0.0.1:<port>/novaflow/models/<provider>/v1`，Anthropic提供商为 `http://127.0.0.1:<port>/novaflow/models/<provider>`；官方SDK生成的请求分别到达 `/v1/responses` 和 `/v1/messages`。地址使用当前Host origin，不固定端口。桥仅允许已授权provider、模型、端点和查询参数；Anthropic Messages仅额外允许 `?beta=true`，不能放开任意查询来消除404。

无凭据请求返回401 `BRIDGE_UNAUTHORIZED` 只能证明已命中已恢复路由的桥鉴权；它不能证明模型推理成功。404 `ROUTE_NOT_FOUND` 需检查响应来源、provider、路径与目录。用户确认过default失败而low成功，不能据此把该次404归因为启动时序；具体证据见[模型修复记录](MODEL_405_REPAIR.md)。

账户 HTTP 成功响应为 `{ok:true,value:...}`，业务失败为 `{ok:false,error:{code:...}}`。认证失败为403，非 JSON 为415，操作错误通常为400。不能把某个 HTTP200 或浏览器完成跳转单独当作已连接证明。

| 动作 | 交互 HTTP | `novaflow_account` 工具 | 作用 |
|---|---|---|---|
| `state` | 是 | 是 | 脱敏账户、余额、原生配置摘要、媒体状态与分发信息；只读 Host 当前状态 |
| `refresh` | 是 | 是 | 刷新会话／目录，随后非阻塞刷新余额，不开始安装 |
| `refresh_balance` | 是 | 是 | 单独发起平台余额读取，不刷新模型目录或触发安装 |
| `cancel` | 是，可带 `attemptId` | 是，无 attempt 参数 | 取消当前待授权过程；交互侧用 attempt ID 防止取消错代次 |
| `signout` | 是 | 是 | 清理本机登录，尝试撤销当前设备 |
| `configure_models` | 是 | 是 | 显式重新应用家族协议，并重新启用text/image输入和协议原生思考档位 |
| `migrate_protocols` | 是 | 是 | 一次迁移旧受管协议，保留图片设置与有效自定义档位，并统一应用明确的思考策略；可离线编辑已保存受管配置，不发布缓存桥权限 |
| `start` | 是 | 否 | 发起浏览器登录 |

工具 schema 不接收任意包名、令牌或确认 ID。开发排查不得通过扩展工具权限来代替用户点击。

## 5. 登录、凭据与原生模型

平台固定为 `https://www.ycnovaflow.vip`，账户 API 前缀为 `/api/novaflow/v1`。每次登录生成独立 verifier／state，用 `client_id=novaflow-creator` 和 S256 发起请求；仅接收 `http://127.0.0.1:<port>/novaflow/callback`。浏览器展示平台授权页，由用户批准后换码，再读取创作身份和目录。

设备访问令牌最长900秒。刷新必须串行，先持久化刷新进行中标记，再原子替换令牌；网络结果未知时不能重放旧 refresh，平台会因重放撤销设备。恢复未知刷新状态时，若仍有旧凭据，须在账户与余额中先退出清除旧设备凭据，再重新登录；否则 `start()` 返回 `SIGNOUT_REQUIRED`。退出保留原生提供商和模型配置。

| 数据 | 保存位置／所有权 |
|---|---|
| 设备访问／刷新令牌及会话 | DSH Credentials 记录 `novaflow-account/creator`，不进入 Client 或模型配置 |
| 原生提供商受管归属 | Credentials 记录 `novaflow-account/native-providers` |
| 统一配置偏好与登录前默认模型 | Credentials 记录 `novaflow-account/model-preferences`、`novaflow-account/default-model` |
| 模型桥独立凭据 | 按提供商创建的 Credentials 引用；受管归属记录校验摘要，防止删除用户替换的密钥 |
| MCP 本机连接凭据 | Credentials 名称 `NOVAFLOW_IMAGE_MCP_KEY` |
| 首次提醒标记、安装结果与 request ID | StorageDomain `novaflow_plugin_bootstrap`，version 1；含 `loginReminderSeen`，无设备令牌 |
| 媒体作业元数据 | 默认工作目录的 `.novaflow-media/jobs/`；无平台凭据 |

仅 `kind=text` 的授权目录进入 DSH 模型提供商。名称默认采用原始模型ID，不加分组后缀；请求继续按授权group路由，不能仅凭显示名判断路由相同。`protocolForModel`不区分大小写地识别原始ID开头及常见vendor前缀后的Claude（支持斜杠、冒号、点等边界）；Claude选择 `anthropic-messages`，其他文本模型选择 `openai-responses`。

历史source提供商标识保留，纯家族source原地更新api和本机URL；混合source按家族拆出确定性child，受管归属记录 `sourceProvider` 与 `familyApi`。原生名称、容量、删除记录和 `modelOverrides` 按家族分配，不重新添加用户删除的模型。默认选择若指向迁移模型则跟随到新提供商；已有会话的显式引用不批量改写，引用被拆走模型的会话需重新选择。

原生模型编辑、发现、思考选择和请求序列化属于官方 `llm-pi-ai`、adapter 与 SDK。插件通过 `ctx.configEditor.edit()` 保存连接，并在桥中附加当前设备访问凭据和 `X-NovaFlow-Group: encodeURIComponent(group_id)`；桥不重写 SDK 生成的模型正文。

受管归属与偏好记录使用 `protocolPolicy='claude-messages-v2'` 标记一次家族迁移；跨协议转换清理不适用的compat。普通刷新保留后续原生协议、名称、容量、输入能力和删除操作，但思考档位始终遵循下述策略。`migrate_protocols`保留图片设置与有效自定义档位，标记能力初始化已处理；`configure_models`显式重设家族协议并重新启用 `input=['text','image']` 和协议原生档位。两者及普通刷新均应用同一思考规范。

### 明确的思考策略与新会话默认值

`REASONING_POLICY='explicit-high-v1'` 独立于家族协议策略，写入 `novaflow-account/model-preferences` 的 `reasoningPolicy` 字段。`thinkingModel()` 在协议与能力处理之后规范已配置模型、显式 `modelOverrides.reasoningEfforts` 和发现目录：

- 移除名为 `off`、`default` 的档位及非字符串映射，包括null；保留其余有效自定义字符串映射，并确保存在 `high`。缺失high时先取官方metadata的high映射，再回退为字符串 `high`。
- 原模型无映射或为false时，优先使用随附官方metadata；没有metadata时，Anthropic回退为low／medium／high，Responses回退为low／medium／high／xhigh／max。不额外生成adaptive声明，客户端配置仍需与上游能力核对。`modelSeed()`内部对未知模型返回false不代表最终受管配置关闭思考。
- 没有显式 `reasoningEfforts` 的局部override继续继承模型，不为规范思考无故补齐其他字段；显式重新启用全部能力时按对应动作生成字段。

每个受管提供商设置 `reasoning: 'high'`。官方adapter据此给出 `defaultEffort=high`，原生模型选择器不再生成 `provider-default`（界面default）选项；请求未指定档位时，官方adapter／SDK使用high。只删除模型映射中的default不足以去掉宿主生成的该选项。

首次应用此策略时，若当前保存的默认模型仍是本次管理计划内的NovaFlow模型，通过 `agentDefaultModel.saveSelection()` 将其 `reasoningEffort` 设为high，并更新 `novaflow-account/default-model` 中已存在的selected记录；新选定的默认模型也显式使用high。默认保存成功后才标记策略完成，保存失败下次重试。家族拆分先迁移默认提供商，再处理档位。后续用户主动选择low等有效档位会保留，不在每次刷新重置；已有会话的显式档位不批量改写。

上述规则仅用于通过归属、连接地址和凭据摘要校验的NovaFlow连接。外部提供商或已被用户改作其他连接的配置不接管；名称、容量、删除记录和无关override继续保留。

离线迁移从已保存原生配置和受管归属构造迁移计划，通过官方ConfigEditor保存，不要求重新授权；离线不会把cached目录权限发布给bridge，配置迁移成功不代表已连接或能发请求。用户改作其他连接后停止管理该连接。退出保留原生配置，清理插件仍拥有的连接凭据，并按归属恢复默认模型。

### New API 余额契约

余额请求为 `GET https://www.ycnovaflow.vip/api/novaflow/v1/plugin/usage`，使用当前 `nfds_` 设备 access token 作为 Bearer；不使用网页登录 Cookie、PAT 或后台模型 Key，不改后端。标准 `/v1/dashboard/billing/subscription` 和 `/v1/dashboard/billing/usage` 不接受 creator 令牌且不适用于企业钱包，不能把本实现称为调用标准 billing 端点。

| 字段 | 语义与展示规则 |
|---|---|
| `schema_version` | 当前为 `1`；按契约校验响应 |
| `account_mode` | `personal` 或 `enterprise`；选择对应钱包并区分个人／公司共享余额 |
| `personal`／`company` | 对应身份的钱包对象，含 `balance`、`frozen`、`available`；均为 CNY decimal 字符串，服务端已完成换算 |
| `limits` | `null` 或成员日／月限额、`used`、`remaining`、`canUse`；成员额度不是公司钱包总额，null／不限额不能转成0 |
| `as_of` | 服务端更新时间；与旧数据提示一起展示，不能用本地轮询时间冒充余额更新时间 |

客户端主显 `available`，同时展示总额和冻结；金额不再除以 `QuotaPerUnit` 或乘汇率。`canUse=false` 提示成员额度限制，不能据此推断公司钱包没有余额。Host `state` 包含余额状态，供界面和 Agent 读取；`refresh_balance` 才发起独立余额请求。

登录成功、账户刷新和默认每10分钟的后台目录刷新后，非阻塞读取余额。界面约1.8秒的轮询仅查询本机 Host 当前状态，不能在轮询中反复调用平台。余额失败不破坏模型登录或目录同步；公开状态与界面保留 error／unavailable，已成功数据保留并明确标旧，无数据不显示假0。退出、授权拒绝、身份切换与卸载时清理相关状态和在途工作，晚到结果须校验身份／代次，不能让旧余额复活。

2.6.0历史核验中的 `AUTH_REQUIRED` 状态不能提供真实在线余额证据；本次文档更新未读取2.6.1现场账户状态。必须由用户重新授权后，对照平台个人／企业钱包现场核验金额与更新时间；隔离测试、Client资源和Slot注册不替代该验收。

## 6. 桌面预装与模式

账户扩展不承担插件安装。四个社区包由桌面构建准备并在 profile 首次初始化时复制，后续管理沿用 PluginManager。独立的 NovaFlow 模式扩展负责会话预设和首次指引，见[整合说明](../INTEGRATION.zh.md)。旧 confirm_plugins、dismiss_plugins、retry_plugins 请求返回 UNSUPPORTED_ACTION，state 不再包含 pluginSetup，delivery 不再包含 installFlow。

## 7. 媒体 MCP 与作业

内置服务提供 `generate_image`、`generate_video`、`generation_result`、`list_models`，经官方 MCP 客户端形成 `mcp__magpie-image__*` 工具名。图片省略 model 时使用原始 ID `gpt-image-2.6`；视频 schema 要求 model，模型必须是用户的明确选择。同名模型跨组时要明确 group，避免擅自选择计费路由。

长任务返回 ID 后查询原作业。提交结果未知时不自动重提；重启恢复依据元数据及结果哈希判断。默认输出到默认工作目录的 `generated-images/` 和 `generated-videos/`；相对 path 和参考图也按默认工作目录解析，不跟随其他会话 cwd。

路径不得越出该目录或穿过符号链接，提交前检查输出冲突。外部 HTTPS 图像下载校验公共地址并固定已校验 DNS 结果。退出／卸载中止本机工作；这不等于上游已经停止计费任务。

## 8. 生命周期与界面交付

账户初始同步通过下一轮事件循环延后到 apply 返回后执行。`modelStartup` 屏障经 `whenReady` 传入模型绑定，模型HTTP请求先等待初始化链完成，再交给桥；初始化链finally和dispose均释放等待者。失败或未登录时仍走正常桥校验，屏障不会把缓存目录变成授权。该机制是独立启动防护，不是default档位失败的已证实原因。官方 ConfigEditor 和 PluginManager 可能持有 HMR 锁，不能把apply改成等待初始化，也不能在apply／dispose中等待自己触发的重载完成。dispose 不等待安装 Promise；晚到配置、凭据写入和网络结果需校验当前 generation／revision，防止退出后复活旧状态。

新增资源统一由 `ctx.effect` 注册清理，包括路由、定时器、监听器、MCP 和回环请求。Client 使用共享状态；授权待处理或安装运行中轮询，卸载清理计时器。弹窗需保留 Escape、焦点循环、焦点恢复、busy 禁用和双主题 token。

修改本地源码或版本号后，还需确认正在访问的 GUI 实际加载了新资源。用 `delivery` 提供的地址检查响应，再用实时 Slot 核对注册；仅检查磁盘文件或 Host 版本不够。Client 无刷新更新依赖同一 checkout 的 `pnpm run dev:web` watcher，不能未经核实承诺 HMR。完整步骤见[测试与发布](RELEASE.md)。

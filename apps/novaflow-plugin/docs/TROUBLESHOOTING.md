# 故障排查

适用：插件 2.6.1，DSH 0.2.2-rc.2／0.2.2-rc.3。先记录插件版本、DSH 版本、操作系统、错误码和脱敏状态；定位源码见[开发手册](DEVELOPMENT.md)，实际分发核验见[测试与发布](RELEASE.md)。

## 优先检查的状态

只读调用 `novaflow_account` 的 `state`。检查结果中的 `connected`、`error`、`balance`、`nativeProviders`、`media.mcp`、`pluginSetup`、`delivery`。状态读取不会安装插件，也不会调用付费模型。

诊断时不要复制 Credentials 原始记录、Authorization header、Cookie、授权码或完整回调查询。允许记录凭据名称、公开包名、错误码、版本、安装 request ID 和脱敏摘要。

## 界面还是旧提示或旧版本

| 现象 | 检查与处理 |
|---|---|
| 点击后仍打开新会话或预填安装请求 | 自2.4.0起已移除该路径。比较 Host `delivery.version/installFlow` 与 `delivery.clientURL` 实际响应，确认正在看的 GUI 和客户端资源；仅升级磁盘包或刷新不能替代修复旧源码 |
| Host 新、界面旧 | 先看官方安装是否 applied，再核对模块图提供的 revision 和实际 Client；刷新既有 GUI，Inspect 检查 `shell.overlay` 的新弹窗 ID |
| 声称 HMR 但没有变化 | 核对同一 checkout 的 Web watcher 是否在运行；不启动另一服务器，不把静态文件正确当成现有页面已更新 |
| 页面注册成功但显示异常 | Slot active 只证明注册。另行检查浏览器点击、焦点和主题；没有截图或交互证据时保留“未做视觉验收” |

当前安装弹窗 ID 为 `novaflow-plugin-install-confirmation`，旧 ID `novaflow-plugin-recommendations` 不应继续占用。`delivery.clientURL` 或 revision 为空时，先检查模块图和 Client 是否已连接，不猜路径。

## 登录与授权

| 现象／错误 | 检查与处理 |
|---|---|
| `CALLBACK_UNAVAILABLE` | Web origin 必须是明确端口的 `http://127.0.0.1`。localhost、HTTPS、非回环地址不满足本插件约束 |
| 浏览器显示登录，DSH仍未连接 | 网页会话与设备授权独立。核对本次回调是否成功换码、创作身份读取是否成功；不要反复提交旧 code |
| `AUTH_REQUIRED` | 会话、账户、企业身份或后台权限可能变化。核对平台设备状态；若仍有旧凭据，先在账户与余额中退出，再发起登录，原生配置保留 |
| `SIGNOUT_REQUIRED` | 已连接或仍保存旧设备凭据，不能直接发起另一登录；先退出清理旧凭据，再重新登录 |
| `NETWORK_ERROR`／`PLATFORM_ERROR` | 分别检查网络和平台响应。不能仅凭网络失败断言用户授权被撤销 |
| `INVALID_RESPONSE` | 核对平台 `{code,data}` 包装、发行方、令牌格式、目录 schema 和期限，不放宽校验来消除报错 |
| 刷新结果未知／要求重新登录 | 已写刷新标记但未确认新令牌时，不重放旧 refresh。平台会因重放撤销设备。在账户与余额中退出清除旧凭据及 NovaFlow 受管模型，再重新登录从平台目录重建配置 |
| 取消后旧回调到达 | 当前代次应拒绝旧回调；重新从账户页发起，检查 attempt ID 和卸载／取消的晚到结果保护 |
| 退出提示远端撤销失败 | 本机清理与平台撤销分别判断。到平台“安全与访问”手动撤销当前设备，不要求删除后台专属模型 Key |

## 余额显示与刷新

2.6.0余额来自 NovaFlow New API 已有的 `GET /api/novaflow/v1/plugin/usage`，使用 `nfds_` 设备 access。标准 `/v1/dashboard/billing/subscription`／`usage` 不接受 creator 令牌，也不适用于企业钱包；不要改用网页登录 Cookie、PAT 或后台模型 Key，不需要修改后端。

| 现象／状态 | 检查与处理 |
|---|---|
| 余额 error／unavailable，但模型已登录 | 余额读取与模型登录独立。核对当前Host余额错误和平台响应，用“刷新余额”或 `refresh_balance` 单独重试；失败不能填0，也不应清除正常模型连接 |
| 有旧金额并提示更新失败 | 上次成功数据被保留且明确标旧。核对 `as_of`，重试成功前不要当作当前金额 |
| `AUTH_REQUIRED`，没有真实在线余额 | 由用户按授权流程清理旧凭据并重新登录后再验收；不自动登录／退出，也不把历史金额当作本轮结果 |
| 金额倍数错误 | `balance`、`frozen`、`available` 已是服务端换算的CNY decimal字符串，客户端不再除以 `QuotaPerUnit` 或乘汇率 |
| 企业余额与个人钱包不同 | 按 `account_mode` 读取 `personal`／`company`；企业页显示公司共享钱包，不应套用个人余额 |
| 成员限额与公司总额不同 | 日／月限额、`used`、`remaining` 是成员约束，不能替代公司钱包余额；null／不限额不能当0，`canUse=false` 提示额度限制 |
| 页面每约1.8秒更新 | UI轮询只查询Host状态；登录、账户刷新、默认每10分钟后台刷新后非阻塞读取平台余额，或由按钮单独刷新，不应每次UI轮询都访问平台 |
| 退出／拒绝授权／换身份后旧金额又出现 | 余额应清除，旧请求中止或晚到结果被忽略。记录代次与脱敏状态排查，不能继续展示上一身份的钱包 |

读取余额无需付费模型请求。隔离测试、HTTP200、资源内容或Slot active均不能代替用户重新授权后对照平台金额的现场验收。

## 原生模型与请求

| 现象／错误 | 检查与处理 |
|---|---|
| `RUNTIME_UNSUPPORTED` | 核对当前 DSH 版本及随附官方库。Host 不一定有工具环境的 `DSH_INSTALL_DIR`；检查 resources／入口解析，不借用另一个全局 DSH |
| `MODEL_SETTINGS_UNAVAILABLE` | 核对官方 `llm-pi-ai` entry 是否存在；不要绕过官方配置另建不可编辑的运行时模型列表 |
| `MODEL_SETTINGS_WRITE_FAILED` | 检查 ConfigEditor／HMR 和官方配置错误，保留登录与原生配置，修复后刷新重试 |
| POST返回空405且Allow为GET, HEAD | 核对Host是否加载路由修复：WebServer注册前缀必须为 `/novaflow/models`，带尾斜杠会落入静态回退；桥内部路径校验的 `/novaflow/models/` 则保留。见[模型修复记录](MODEL_405_REPAIR.md) |
| 404 `ROUTE_NOT_FOUND` | 核对响应来源、provider、协议baseURL、端点、允许查询和当前授权目录。用户已确认default失败、low成功；不能仅凭该错误认定是启动空路由。启动屏障是单独防护 |
| 仍看到default或off | 确认加载 `explicit-high-v1` 修复后再同步；受管provider的reasoning须为high，模型及显式override映射去掉default/off且含high。default是宿主按默认档位生成的选项，仅删除映射中的default不够 |
| 新会话仍为low | 首次迁移将当时受管NovaFlow默认选择设为high；后续用户主动改为low会保留。检查保存的默认选择和迁移记录，不为测试反复重置用户档位。已有会话需自行重选 |
| 思考档位或图片输入不可用 | 查看原生高级设置、实际adapter／SDK序列化及上游支持。受管模型优先用官方metadata，缺少metadata时使用协议回退档位并补high，不额外声明adaptive；显式false也会被新思考策略规范。客户端选项不是服务端能力保证 |
| 想重新启用图片和思考档位 | `configure_models`显式重设家族协议，并重新启用text/image和协议原生档位；普通刷新保留图片设置，但仍规范思考档位及提供商high默认值 |
| 只想修正旧统一Responses协议 | 使用HTTP或Agent动作 `migrate_protocols`，仅一次家族迁移，保留图片设置和有效自定义档位；跨协议转换清理不适用compat，同时去掉default/off并补high |
| 未登录或AUTH_REQUIRED时需要迁移 | 2.5.0可离线编辑已保存受管配置，无需为迁移重新授权；离线不发布cached桥权限，成功只证明配置已保存，不能证明账户或模型请求可用 |
| Claude仍显示Responses或名称带vendor前缀 | 先核对实际delivery为当前2.6.1与已保存迁移策略。Claude识别不区分大小写，支持原始ID开头及常见vendor前缀／冒号／点；已应用策略后的手工协议编辑会保留，需重设时显式configure_models |
| 升级后出现家族child提供商 | 混合source按家族确定性拆分，纯家族保留source原地更新。核对名称、容量、删除和overrides按家族保留，不按显示名合并路由 |
| 旧会话模型找不到，默认模型却正常 | 默认同模型会迁至新提供商；已有会话若引用被拆走模型，需在该会话重新选择 |
| 手动删除后未被目录同步加回 | 这是保留用户删除的行为。使用官方获取模型／手动添加；删除提供商后可重新登录配置 |
| 模型同名但分组不同 | 通过提供商和授权 group 区分，不能合并计费路由或给显示名自动加后缀 |
| Anthropic 请求被桥拒绝 | 排查官方 SDK 的 `?beta=true` 与允许的协议 header；不放开任意查询和任意转发目标 |
| 刷新后自定义地址或密钥没被重写 | 归属保护生效。用户改作其他连接后插件停止管理，不清除替换密钥 |

模型发现由本机桥按授权目录提供；不能推定平台允许设备凭据调用普通 `/v1/models` 或任意管理 API。

## 桌面预装资源

登录不再启动安装器或检查包管理运行时。如仍出现推荐安装 UI，请核对是否启动了旧客户端资源。账户旧安装动作返回 UNSUPPORTED_ACTION，不能通过重新登录重试安装。社区插件的手动安装、更新、卸载仍由插件管理器提供；其包管理问题与登录无关。预装与一次性迁移规则见[整合说明](../INTEGRATION.zh.md)。

## 内置 NovaFlow Image MCP

| 现象／错误 | 检查与处理 |
|---|---|
| `serverName "novaflow-image" is already in use` | 检查自定义 MCP 配置，移除与内置服务重名的自定义条目。 |
| 仍提示去 Magpie 选择模型 | 核对实际可见 Tool schema 与 MCP instructions 是否来自本插件；旧工具说明不能证明新服务已连接 |
| 图片模型没权限 | 前往「设置 → 模型 → NovaFlow Image」重新选择有权限的分组和模型 |
| `VIDEO_MODEL_REQUIRED` | 在模型配置中选择视频生成模型后提交 |
| 同名模型有多个 group | 请用户明确路由，不自动决定计费组 |
| 返回运行中 ID | 使用 `generation_result` 查询原 ID，不再次调用生成 |
| `unknown` 或重启后结果未知 | 可能已计费；先核对平台历史和已有产物，不自动重提 |
| 输出或参考图找不到 | 相对路径按 DSH 默认工作目录解析；检查默认目录而非另一个会话 cwd |
| 输出冲突／路径被拒 | 使用默认工作目录内的新输出路径；不覆盖、不越界、不绕过符号链接限制 |

2026-11-13 的此前运行记录观察到有效 Agent 预设覆盖旧 MCP 停用设置，产生同名冲突；该问题尚无本轮修复证据。历史2.2工具可用记录不能代替当前服务健康状态。排查只读状态和模型目录即可，未经用户请求不要通过生成图片、视频或真实对话制造计费验证。

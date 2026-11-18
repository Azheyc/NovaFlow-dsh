# NovaFlow 桌面整合

[English](INTEGRATION.md) | 中文

此私有 workspace 将 NovaFlow 插件 2.6.1 内置于定制桌面端。原始迁移包独立保留。依赖在仓库根目录安装；打包使用仓库 pnpm 命令，以转换 workspace 依赖。

## 账户与启动

模型刷新会把受管分组的旧回环地址迁移至平台。Claude 的基础地址为 `https://www.ycnovaflow.vip`，OpenAI 兼容协议使用 `https://www.ycnovaflow.vip/v1`。Host 在每次推理时取得账户访问凭据并添加对应分组头；模型发现读取该分组已授权的目录。

客户端按平台分组 ID 和实际请求协议各建一个受管提供方。刷新会将符合条件的重复提供方并入已有模型最多的一组。保存到本地和通过模型发现返回的平台模型统一使用 512,000 tokens 上下文窗口和 128,000 tokens 最大输出。这两个数值是客户端预算，平台仍按所选模型的实际能力处理请求。

主动退出登录会清除 NovaFlow 受管提供方和模型。登录或点击 **刷新账户与模型** 时，客户端按当前授权目录重建配置，包括已删除的分组和已修改的模型。后台同步保留修改和删除。独立配置的提供方、已改用自定义地址或密钥的连接保留。

Desktop 在标准 Web bundle 之后、用户 bundle 之前加入 NovaFlow。已有 profile 的依赖和用户 patch 保持原样。原生恢复保留内置 NovaFlow bundle。CLI 依赖闭包携带插件代码以供运行时解析，普通 CLI profile 不会启用插件。

开屏页通过插件已有的、经过认证且仅限所有者的 `/api/novaflow-account` 接口登录。主进程串行轮询本机脱敏状态，只打开验证通过的 NovaFlow 授权地址，不向渲染进程传递令牌。PKCE、回调校验、轮换凭据、模型同步、余额与退出均由原插件负责。

发行方固定为 `https://www.ycnovaflow.vip`，客户端身份为 `novaflow-creator`。浏览器要求用户本人确认授权。账户与模型同步成功、插件进入 connected 状态后才自动打开工作区。独立 API Key 仍可作为备用入口；本机 NovaFlow 模型桥凭据不被当作独立登录。

临时同步失败可使用已保存授权重试。启动时自动校验保存的授权；校验失败则清除本地授权，回到与新用户相同的登录首页，保留原生模型设置。自动清理本地授权不撤销其他设备持有的会话副本。取消操作绑定当前授权代次。工作区内退出或授权失效会同步到原生开屏流程。

开屏页复用插件图标，中英文提供 NovaFlow 专属说明；其他界面语言的新增恢复说明暂用英文。Windows 发行使用 NovaFlow 名称和独立安装身份，构建与更新配置见 [Windows 发布手册](../desktop/novaflow-release/README.zh.md)。

## Windows 与验证

账户插件不再提供推荐插件安装界面、包管理运行时检查或安装动作。桌面端离线预装固定版本的社区插件，其中包括 Skills Manager 1.4.11。每个包在同一 profile 中只初始化一次。加入新预装包时，之前卸载的插件及已有启停选择保持原样。旧 confirm_plugins、dismiss_plugins 和 retry_plugins 请求返回 UNSUPPORTED_ACTION，账户快照不再包含 pluginSetup。核心账户项不出现在插件清单中，不能通过 Host 管理接口关闭、移除、替换或编辑配置。

媒体输出路径同时检查 Windows 和 POSIX 路径分隔符。作业元数据使用 DSH 原子写入及 Windows 替换重试。目录链接测试在 Windows 使用 junction；POSIX 权限位断言仅在 POSIX 系统执行。

运行插件 Node 测试前，将 `DSH_INSTALL_DIR` 指向已构建的 `apps/cli`。`apps/desktop/tests/welcome-flow.e2e.ts` 使用真实已构建 Host 和模拟平台传输，验证授权、模型配置、恢复、退出及取消回调，无需生产凭据。桌面渲染测试维护文案快照与恢复交互。修改后运行仓库构建。

原生窗口检查和真实生产账号授权属于独立验收步骤。本地测试通过不等于生产登录或模型推理已经可用。

## 长期授权

桌面客户端使用已保存的账户凭据，不检查硬件或主机名。登录请求发送展示名称 NovaFlow Desktop。本地到期信息会触发刷新，但不会独立拒绝已保存的刷新令牌。服务端声明 `refresh_token_rotation: "none"` 时启用可重复使用的刷新凭据；在该模式下，`expires_in` 或 `refresh_expires_in` 为 null 表示没有期限。旧响应保留轮换令牌行为。长期凭据的签发和接受仍由服务端负责。HTTP 403 表示权限失败，不会清除登录凭据。

旧刷新结果未确认时，客户端向 `POST /api/novaflow/v1/desktop/auth/restore` 提交 `refresh_token` 与 `session_id`，不将一次性令牌重放到旧刷新接口。恢复响应必须保持相同会话，提供可重复使用且不设到期时间的刷新凭据。启动时在后台尝试该操作；若失败，清除本地凭据并显示普通登录首页，不显示恢复页面或过期通知。刷新期间关闭客户端不会撤销保存的会话。主动退出仍删除本地凭据并请求撤销，会影响同一会话的所有凭据副本。PKCE、state、issuer 和回调校验继续保留。

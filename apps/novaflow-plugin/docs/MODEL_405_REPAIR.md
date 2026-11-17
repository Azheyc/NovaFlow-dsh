# 模型请求与思考档位修复记录

2026-11-17，本机 NovaFlow 2.6.1。

模型 POST 请求 `/novaflow/models/novaflow-6c6dd225b2226260b48c/v1/responses` 在运行中的桌面宿主返回空响应 HTTP 405，并带 `Allow: GET, HEAD`。NovaFlow 账户状态正常，connected=true。

根因是 `src/native-models.js` 注册了带尾部斜杠的 prefix `/novaflow/models/`。宿主按 `prefix` 或 `prefix + /` 匹配子路径，因此正常模型路径无法命中，进入静态资源回退服务。修复为 `/novaflow/models`；桥接器内部对原始请求路径的 `/novaflow/models/` 校验保持原样。

新增测试使用当前安装的 WebServer、真实监听端口、静态资源 fallback 和原生模型绑定，验证 Responses 与 Anthropic 模型请求到达桥接器鉴权、模型列表与模型校验。临时恢复旧 prefix 时测试失败，恢复修复后通过。最终完整测试 220 项通过、0 失败、0 跳过；`npm run check` 和 `git diff --check` 通过。

本机 profile 通过链接使用此源码，因此不需重新安装包。首次验证时运行实例尚未重载；随后 10:37 现场确认原路径已进入桥接器，目标 provider 的无凭据请求返回 401 BRIDGE_UNAUTHORIZED（不再是静态服务 405），账户 connected=true，8 个 provider、30 个模型已恢复。未执行真实付费模型调用。

## 404 现象与启动防护

用户随后提供 10:36 请求的 404 ROUTE_NOT_FOUND 截图，并进一步确认：思考强度选择 default 时失败，改为 low 后成功。此前将该截图归因于启动期间空路由表只是推测，未被证实，不能作为该次失败的确定根因。

另外，源码确认模型 HTTP 入口在 account.initialize 的异步恢复之前开放，因此保留启动屏障作为独立防护：入口等待初始化完成后再进入桥接器，同时保持 apply 不等待自身可能触发的配置 HMR，避免启动锁死；销毁时释放等待者。

回归同时覆盖实际 apply 对启动屏障的连接，以及真实 WebServer 上提前到达的请求等待目录写入后命中恢复的 provider。

## 明确的思考档位与新会话默认值

根据用户要求，NovaFlow 管理的模型统一移除 off，提供方显式设置 reasoning: high，宿主因此不再生成 default 选项。模型级 reasoningEfforts 与显式 modelOverrides 都应用同一规则；未填写档位的模型调用通过官方适配器发送 high。其他模型参数、自定义的有效档位映射和外部提供方配置继续保留。

策略会在首次迁移时将当前 NovaFlow 默认选择从 low/off/default 改为 high，并更新插件保存的默认模型记录；后续同步不覆盖用户主动切换的有效档位。默认值保存失败时不标记迁移完成，下次同步会重试。新配置的默认模型同样显式使用 high。

验证使用当前安装的 Config、模型目录、适配器和 SDK，覆盖 GPT、Claude、DeepSeek、Gemini、未知 Claude、显式禁用思考的覆盖配置，以及一次性默认迁移和失败重试。SDK 请求在本地拦截，不产生真实付费推理。最终完整测试 227 项通过、0 失败、0 跳过，npm run check、git diff --check 通过。

本机已同步 8 个 NovaFlow 提供方、30 个模型及保存的新会话默认档位。插件源码通过本机链接生效；运行中的代码缓存仍需重载插件或重启桌面应用后加载新同步策略。当前会话未调用官方 plugin_manager，未发布远端版本或更新已有分发包。

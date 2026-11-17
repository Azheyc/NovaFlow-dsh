# NovaFlow 会话模式

[English](README.md) | 中文

本地开发插件使用随产品提供的标准模式模板注册 `novaflow-modeling` 和 `novaflow-media-creation`。每个模式追加 `modes.js` 中独立的 `plugins` 数组；目前两份数组均为空。这里只加入会话范围的能力。预设注册器会报告模块缺失、激活失败和泄漏到根环境的服务，不通过启用全局插件代替。会话临时选择与新任务默认设置沿用上游行为。

首次工作区指引注册在 `settings.onboarding`，复用共享 Modal 与 Button。指引等待预设列表就绪，提供“查看 Agent 预设”和“知道了”，关闭或 Escape 等同于确认。导航仅打开 `agent-presets` 面板，不选择模式或改变默认值。`/api/novaflow-modes` 接受经过所有者认证的 JSON POST 动作 `state`、`dismiss`，返回 `{seen, ready}`。不发起模型请求或下载。

桌面预装在用户 profile 中建立 `.novaflow-mode-guide.json`：新 profile 标记未读，已有 profile 标记已读。没有经过这一步初始化且文件不存在时，不自动显示指引。关闭状态独立于登录凭据保存。本插件作为本地包随客户端发布，不覆盖社区插件的发布身份。

通过桌面预装测试、`novaflow-mode-isolation.spec.ts` 与构建后的 `welcome-flow.e2e.ts` 验证离线安装、会话能力隔离、账户管理保护和指引持久化。本包不安装软件包，也不控制全局插件开关。

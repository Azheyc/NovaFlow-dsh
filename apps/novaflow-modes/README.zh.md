# NovaFlow 会话模式

[English](README.md) | 中文

Host 在各内置模式共用的系统提示中声明当前客户端为 NovaFlow。底层框架仍称为 DeepSeek Harness，技能、命令与路径沿用上游原名。

新会话的预设下拉菜单和「设置 → Agent 预设」均隐藏创造模式（`cordis`）和 OPS (PTC)（`ops-ptc`）。Agent 预设设置页也隐藏进入创造模式的入口。Host 仍注册这两个预设，供已有会话与插件流程使用。

本插件基于标准预设注册建模模式和内容平台模式。内容平台模式沿用 `novaflow-media-creation` 标识，已有会话和提示词库继续使用原有配置。该模式内置故事创作、故事资产提取、角色资产板、全能场景和 S10 电影级分镜五项技能。「设置 → 技能」将它们列在内容平台模式预设下。各技能的正文及配套文件随包保存在 `skills/` 中。

首次工作区指引注册在 `settings.onboarding`，复用共享 Modal 与 Button。指引等待预设列表就绪，提供“查看 Agent 预设”和“知道了”，关闭或 Escape 等同于确认。导航仅打开 `agent-presets` 面板，不选择模式或改变默认值。`/api/novaflow-modes` 接受经过所有者认证的 JSON POST 动作 `state`、`dismiss`，返回 `{seen, ready}`。不发起模型请求或下载。

桌面预装在用户 profile 中建立 `.novaflow-mode-guide.json`：新 profile 标记未读，已有 profile 标记已读。没有经过这一步初始化且文件不存在时，不自动显示指引。关闭状态独立于登录凭据保存。本插件作为本地包随客户端发布，不覆盖社区插件的发布身份。

通过桌面预装测试、`novaflow-mode-isolation.spec.ts` 与构建后的 `welcome-flow.e2e.ts` 验证离线安装、会话能力隔离、账户管理保护和指引持久化。本包不安装软件包，也不控制全局插件开关。

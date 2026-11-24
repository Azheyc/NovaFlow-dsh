# NovaFlow 会话模式

[English](README.md) | 中文

Host 在各内置模式共用的系统提示中声明当前客户端为 NovaFlow。底层框架仍称为 DeepSeek Harness，技能、命令与路径沿用上游原名。

新会话的预设下拉菜单和「设置 → Agent 预设」均隐藏创造模式（`cordis`）、OPS (PTC)（`ops-ptc`）和 PTC 模式（`ptc`）。Agent 预设设置页也隐藏进入创造模式的入口。Host 仍注册这些预设，供已有会话与插件流程使用。

Host 将 `skills/` 注册为全局内置技能来源。故事创作、故事资产提取、角色资产板、全能场景和 S10 电影级分镜五项技能可在支持加载技能的所有预设中使用，保留原技能名称和配套文件。

在「设置 → 技能 → 全局技能」展开「DSH」，或按上述中文名称搜索。桌面启动时将五个中文目录入口链接到随包技能，详情保留原始 `laotang-` 调用名。已有同名用户目录优先保留。

原先设为建模模式 (`novaflow-modeling`) 或内容平台模式 (`novaflow-media-creation`) 的会话和默认设置按标准模式运行。所有模式共用同一套提示词库，其中包含建模提示词。

首次工作区指引注册在 `settings.onboarding`，在标准预设就绪后介绍全局内置技能。关闭、按 Escape 或点击「知道了」即可结束指引。`/api/novaflow-modes` 接受经过所有者认证的 JSON POST 动作 `state`、`dismiss`，返回 `{seen, ready}`。

桌面预装在用户 profile 中建立 `.novaflow-mode-guide.json`：新 profile 标记未读，已有 profile 标记已读。没有经过这一步初始化且文件不存在时，不自动显示指引。关闭状态独立于登录凭据保存。本插件作为本地包随客户端发布，不覆盖社区插件的发布身份。

构建后运行 `novaflow-client-identity.e2e.ts` 验证标准会话和恢复的内容平台会话能够发现并调用技能。`welcome-flow.e2e.ts` 检查预设列表、离线安装、账户管理保护和指引持久化。

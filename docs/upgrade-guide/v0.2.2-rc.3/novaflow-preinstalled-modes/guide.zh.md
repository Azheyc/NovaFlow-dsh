---
kind: upgrade-guide
description: "NovaFlow 使用桌面离线预装与会话模式替代账户驱动的推荐安装。"
---

# NovaFlow 预装插件与会话模式

[English](guide.md) | 中文

## 变更

NovaFlow 账户快照不再提供 pluginSetup。confirm_plugins、dismiss_plugins、retry_plugins 返回 UNSUPPORTED_ACTION，autoInstallPlugins 不再控制安装流程。Desktop 携带四个固定版本社区插件。核心账户包不再是可编辑的插件管理条目。

## 迁移

1. 移除三个安装动作的调用，停止读取 pluginSetup，从自定义账户配置中移除 autoInstallPlugins。
2. 社区插件继续通过普通插件管理修改。升级时保留 Desktop profile 及其 .novaflow-preinstalled-v1.json 标记，以尊重用户卸载选择。
3. 使用 novaflow-modeling 或 novaflow-media-creation 会话预设；二者暂时继承标准能力。会话选择仍为临时，设置面板控制新会话默认值。
4. 确认四个预装插件存在，账户页没有安装器，两个新模式可用。已有用户 profile 不应出现首次模式指引。

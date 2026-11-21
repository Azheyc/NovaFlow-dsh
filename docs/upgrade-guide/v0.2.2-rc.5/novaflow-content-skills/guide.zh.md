---
kind: upgrade-guide
description: "NovaFlow 桌面端移除内容平台预设，并将其技能移入全局目录。"
---

# NovaFlow 全局内容技能

[English](guide.md) | 中文

## 变更

NovaFlow 桌面端从 Agent 预设列表移除内容平台模式。五项内置技能可在支持加载技能的会话中使用。引用 `novaflow-media-creation` 的已有会话和默认设置按 `standard` 运行。

## 迁移

1. 打开已有内容平台会话，按标准模式继续。如果自定义覆盖配置声明了 ID 为 `novaflow-media-creation` 的预设，请移除该声明。覆盖配置如需选择该预设，请改用 `standard`。
2. 在标准会话中请助手加载电影级分镜技能。技能 ID 仍为 `laotang-cinematic-storyboard-s10-free`。

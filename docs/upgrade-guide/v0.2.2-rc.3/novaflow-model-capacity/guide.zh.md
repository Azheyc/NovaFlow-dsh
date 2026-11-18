---
kind: upgrade-guide
description: NovaFlow 使用固定模型容量，并在登录或手动刷新时重建受管模型配置。
---

# NovaFlow 模型容量

[English](guide.md) | 中文

## 变更

NovaFlow 账户插件停止读取自身配置的 `contextWindow` 和 `maxTokens`。下次目录同步成功后，新旧受管配置中的平台模型都会使用 512,000 tokens 上下文窗口和 128,000 tokens 最大输出。

主动退出登录会清除本机的 NovaFlow 受管提供方和模型。登录或点击 **刷新账户与模型** 时，客户端按当前授权目录重建配置，覆盖本地模型修改。

## 迁移

1. 从本地 `novaflow-account` patch 中删去自行设置的 `contextWindow` 和 `maxTokens`。
2. 登录现有 NovaFlow 账号或刷新模型。在模型设置中核对同步模型的上下文窗口和最大输出。

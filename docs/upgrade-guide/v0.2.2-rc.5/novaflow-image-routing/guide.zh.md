---
kind: upgrade-guide
description: "NovaFlow Image MCP 从 generate_image 移除 model 和 group 参数。"
---

# NovaFlow Image 模型与分组选择

[English](guide.md) | 中文

## 变更

`mcp__novaflow-image__generate_image` 过去接受可选的 `model` 和 `group` 参数。工具现在使用 NovaFlow「设置 → 模型」中当前选中的生图路由。账户未保存图片模型时，若默认图片模型只有一个授权分组，工具可以直接生成。

## 迁移

1. 从直接调用 `generate_image` 的参数中移除 `model` 和 `group`。
2. 如需指定路由，在 NovaFlow「设置 → 模型」中选择图片模型和分组。调用 `list_models` 并传入 `kind: image`，确认 `selected.image` 后再生成。

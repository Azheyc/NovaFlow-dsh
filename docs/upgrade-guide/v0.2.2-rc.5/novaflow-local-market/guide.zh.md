---
kind: upgrade-guide
description: "NovaFlow 插件市场随桌面客户端版本更新。"
---

# NovaFlow 内置插件市场

[English](guide.md) | 中文

## 变更

NovaFlow 将通过仓库安装的 `dshmarket` 替换为移除了赞助栏的本地副本。客户端停止查询市场插件自身的新版本，并移除该插件的更新入口。「发现」继续读取在线目录，其他插件仍可正常更新。

## 迁移

1. 启动更新后的 NovaFlow 桌面版。客户端会将桌面配置 `package.json` 中的 `dshmarket` 依赖切换为 `link:./.novaflow-bundled/dshmarket/<build>`，保留启用状态和原有设置。
2. 打开「插件市场」，确认「发现」加载了在线目录。后续通过更新 NovaFlow 客户端获取市场插件的新版本。

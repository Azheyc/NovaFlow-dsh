---
kind: upgrade-guide
description: "NovaFlow Windows 使用独立应用身份及经镜像访问的 GitHub Release 更新源。"
---

# NovaFlow Windows 发行

[English](guide.md) | 中文

## 变更

NovaFlow 应用标识为 vip.ycnovaflow.desktop。Windows x64 安装包保留原有 NSIS 与 electron-updater 流程，改由 gh-proxy.com 转发 Azheyc/NovaFlow-dsh 的 GitHub Release 更新。目前两个频道接收同一版本，不包含 DeepSeek 强制更新策略。未签名 NovaFlow 构建包含更新元数据，保留 unsigned 文件名后缀，不声称具备已验证发布者身份。

## 迁移

1. 使用已纳入版本控制的 apps/desktop/novaflow-release/presets/test.env 配置和明确递增的构建版本进行打包。
2. 将安装包、blockmap、stable.yml、nightly.yml 和 SHA256SUMS 一起发布至标记 Latest 的 GitHub Release。保留旧版本资产，供仍在下载旧版本的客户端使用。
3. 将 NovaFlow 与上游 DSH 分开安装并保留已有用户配置。确认安装包的 app-update.yml 指向镜像后的 NovaFlow 仓库，且不包含 DeepSeek 策略。
4. 在现有桌面设置中检查更新。下载依赖配置的镜像，本发行版不会回退至上游 DSH。

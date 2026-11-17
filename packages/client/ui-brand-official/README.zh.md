---
description: "NovaFlow 侧栏品牌与首页粒子动画。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-official

[English](README.md) | 中文

## 概述

NovaFlow 定制版使用用户提供的黑底白色帆形标识。所有客户端构建 profile 都注册 NovaFlow 侧栏标识与名称，替代本地构建标签和版本号。空白首页使用原有粒子渲染器与生成的 NovaFlow 帆形图集，不再显示实心方块水印。

<a id="use-this-package"></a>
## 使用本包

随产品提供的 Web 与 Desktop 组合加载本插件。所有构建 profile 都启用两个侧栏填充项。`conversation.hero.frame` 仅在 `hero` 为 true 时显示装饰。画布不获取焦点或指针事件，并保留会话子内容。主键点击首页空白处播放一次 5.7 秒动画；控件、输入卡片、portal 浮层和选中文字上的点击不触发播放。减少动态效果偏好会禁用播放。

<a id="understand-the-implementation"></a>
## 理解实现

[`src/client/index.ts`](src/client/index.ts) 独立注册首页框架，并通过嵌套的 `ctx.slots.inject()` effect 一起安装侧栏填充项。声明撤回和插件卸载时移除相应填充项。[`NovaFlowFrame`](src/client/NovaFlowFrame.tsx) 复用原有动画生命周期，使用 NovaFlow 轮廓交替播放点阵与代码填充。粒子依次聚合、浮动和散开。生成的 `src/client/assets/novaflow-atlas.webp` 在活动入口中替代鲸鱼图集。隐藏或卸载时停止播放，卸载时释放观察器和画布资源，不增加模型请求。

图形由 `apps/desktop/resources/novaflow/mark.svg` 生成。在仓库根目录运行 `pnpm --filter @deepseek-ai/dsh-desktop run render:brand`，重新生成桌面、安装程序、插件、Web、共享基础组件资源和首页动画图集。`FishLogo` 为兼容现有使用方保留导出名，并以正方形尺寸渲染 NovaFlow。

<a id="further-exploration"></a>
## 进一步探索

- [ui-sidebar](../ui-sidebar/README.zh.md) 声明侧栏品牌插槽。
- [ui-conversation](../ui-conversation/README.zh.md) 拥有首页标识与框架插槽。
- [ui-primitives](../ui-primitives/README.zh.md) 提供共享标识与字标。

<a id="model-experience"></a>
## 模型体验

无；本包仅提供浏览器呈现。

#### KV Cache 影响

无；本包不组装或发送 provider 请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

浏览器标题独立存在，由 `DSH_CLIENT_TITLE` 选择。其他品牌可以通过另一个包占用相同插槽。

<a id="dev-note"></a>
### 开发备注

用户提供的原图保存在矢量源文件旁。更新图形时保留三段帆形及其相对比例。

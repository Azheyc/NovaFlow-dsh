---
description: "NovaFlow sidebar branding and animated home particles."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-official

English | [中文](README.zh.md)

## Summary

The NovaFlow customization supplies the user's white sail mark on a black tile. All client build profiles register the NovaFlow sidebar mark and name, replacing the local-build label and version. The blank home uses the original particle renderer with a generated NovaFlow sail atlas, without the solid tile watermark.

<a id="use-this-package"></a>
## Use this package

The shipped Web and Desktop compositions load this plugin. Both sidebar occupants are enabled in every build profile. `conversation.hero.frame` displays decoration only while `hero` is true. The canvas takes no focus or pointer events and preserves the conversation children. A primary click on blank home space plays one 5.7-second animation; clicks on controls, composer cards, portaled overlays and selected text do not trigger it. Reduced motion disables playback.

<a id="understand-the-implementation"></a>
## Understand the implementation

[`src/client/index.ts`](src/client/index.ts) registers the frame independently and installs sidebar occupants together through nested `ctx.slots.inject()` effects. Declaration withdrawal and plugin teardown remove their occupants. [`NovaFlowFrame`](src/client/NovaFlowFrame.tsx) reuses the original animation lifecycle, alternating point and code fills with the NovaFlow silhouette. Points gather, float and disperse. The generated `src/client/assets/novaflow-atlas.webp` replaces the whale atlas in the active entry. Playback stops when hidden or unmounted; observers and canvas resources are released on teardown. No model requests are added.

The artwork is generated from `apps/desktop/resources/novaflow/mark.svg`. Run `pnpm --filter @deepseek-ai/dsh-desktop run render:brand` at the repository root to regenerate desktop, installer, plugin, web, shared primitive assets and the home animation atlas. `FishLogo` retains its exported name for existing consumers and renders NovaFlow at a square edge.

<a id="further-exploration"></a>
## Further Exploration

- [ui-sidebar](../ui-sidebar/README.md) declares the sidebar branding slots.
- [ui-conversation](../ui-conversation/README.md) owns the hero mark and frame slots.
- [ui-primitives](../ui-primitives/README.md) supplies the shared mark and wordmark.

<a id="model-experience"></a>
## Model Experience

None; this package contributes browser presentation only.

#### KV Cache effect

None; it neither assembles nor sends provider requests.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

The browser title remains independent and is selected by `DSH_CLIENT_TITLE`. Alternate branding can occupy the same slots in another package.

<a id="dev-note"></a>
### Dev Note

The supplied original image is preserved beside the vector source. Keep all three sails and their relative proportions when updating artwork.

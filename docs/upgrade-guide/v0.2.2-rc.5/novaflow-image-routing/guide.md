---
kind: upgrade-guide
description: "NovaFlow Image MCP removes the model and group parameters from generate_image."
---

# NovaFlow Image model and group selection

English | [中文](guide.zh.md)

## Change

`mcp__novaflow-image__generate_image` previously accepted optional `model` and `group` arguments. The tool now resolves the active image route from NovaFlow Settings → Models. If the account has no saved image selection, the default image model can run when it has one authorized group.

## Migration

1. Remove `model` and `group` from direct `generate_image` calls.
2. To use a particular route, select the image model and group in NovaFlow Settings → Models. Call `list_models` with `kind: image` and check `selected.image` before generating.

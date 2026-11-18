---
kind: upgrade-guide
description: NovaFlow replaces configurable model limits with fixed budgets and rebuilds the managed configuration on sign-in or manual refresh.
---

# NovaFlow model capacity

English | [中文](guide.zh.md)

## Change

NovaFlow's account plugin no longer reads `contextWindow` and `maxTokens` from its plugin configuration. The next successful catalog sync sets platform models to a 512,000-token context window and a 128,000-token maximum output, including those in existing managed profiles.

Explicit sign-out clears the locally managed NovaFlow providers and models. Signing in or choosing **Refresh account and models** recreates those settings from the authorized catalog and replaces local model edits.

## Migration

1. Remove `contextWindow` and `maxTokens` from any local `novaflow-account` patch that defines them.
2. Sign in or refresh models with the existing NovaFlow account. Open model settings and confirm the context window and maximum output for the synchronized models.

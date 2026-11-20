---
kind: upgrade-guide
description: "The NovaFlow plugin market updates with NovaFlow Desktop releases."
---

# NovaFlow-managed plugin market

English | [中文](guide.zh.md)

## Change

NovaFlow replaces the registry installation of `dshmarket` with a local copy without the sponsor strip. This copy no longer checks for market package updates or offers a market update action. Plugin discovery still reads the online catalog, and other plugins retain their normal updates.

## Migration

1. Start the updated NovaFlow Desktop. It switches the `dshmarket` dependency in the desktop profile's `package.json` to `link:./.novaflow-bundled/dshmarket/<build>` and retains the existing enable state and settings.
2. Open Plugin Market and confirm Discover loads the online catalog. Install later NovaFlow releases to update the market itself.

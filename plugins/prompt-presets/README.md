# NovaFlow prompt presets

English | [中文](README.zh.md)

All session modes share the same library. On the new-conversation page, choose a task by category, hover to preview it, and select it to fill the draft. NovaFlow asks before replacing an existing draft.

The home page includes eight categories of built-in work templates. They cover office documents (Excel, Word and PPT), data research, content platforms, sales and customers, purchasing and contracts, projects, HR and administration, and CAD and modeling. Maintain these templates in `catalog.js`. Desktop updates deliver the revised library.

Settings → Prompt presets opens the custom editor. Add a prompt, enter its title and text, and save your changes. You can also manage categories and reorder prompts. Existing homepage recommendations stay available. Removing a recommended prompt leaves room for a built-in recommendation.

Custom presets are stored in `.novaflow-prompt-presets.json` in the current profile. Added or edited presets from older per-mode libraries appear in the shared custom library. The first save writes the new format.

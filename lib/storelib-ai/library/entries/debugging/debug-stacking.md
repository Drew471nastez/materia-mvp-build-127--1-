---
id: debug-stacking
title: Z-index and stacking problems
category: debugging
summary: Dropdowns hidden behind sections, overlays under headers, and how stacking contexts cause them.
intents: [debug, repair, fix]
tags: [debugging, bug, z-index, stacking-context, overlay, dropdown-hidden]
phases: [repair, review]
priority: 3
related: [debug-sticky, component-dialog]
version: 1
---
**Why z-index 9999 does not work**: z-index only competes within the same stacking context. A parent with `transform`, `filter`, `opacity < 1`, `isolation: isolate`, `will-change: transform`, or `position` plus `z-index` creates a new context; children cannot escape it.

**Fixes**
- Render overlays (menus, dialogs, drawers) in the top layer: native `<dialog>` with `showModal()` or the `popover` attribute. They escape every stacking context.
- Use a small z-index scale as tokens: base 0, raised 10, sticky 20, header 30, overlay 40, modal 50, toast 60.
- Remove unnecessary transforms or `will-change` on ancestors of dropdowns.
- For a section's own overlay, keep it inside the section with `isolation: isolate` on the section so it does not fight the page.

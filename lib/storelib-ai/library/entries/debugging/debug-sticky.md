---
id: debug-sticky
title: Sticky positioning not working
category: debugging
summary: The reasons position sticky silently fails and how to fix each.
intents: [debug, repair, fix]
tags: [debugging, bug, sticky, position-sticky, overflow]
phases: [repair, review]
priority: 3
related: [layout-sticky-storytelling, header-sticky]
version: 1
---
- **An ancestor has `overflow: hidden`, `auto` or `scroll`**: sticky sticks to that ancestor's scroll box instead. Use `overflow: clip` (which does not create a scroll container) or remove the overflow.
- **No offset**: sticky needs `top` (or `bottom`).
- **The parent is not taller than the sticky element**: sticky only moves within its parent. In grids and flex rows, set `align-self: start` on the sticky item so it is not stretched to the full height.
- **Display contents or tables**: sticky on table rows behaves differently across browsers; apply it to `th` cells.
- **Header height**: offset sticky elements below a sticky header with `top: calc(var(--header-h) + 16px)`.

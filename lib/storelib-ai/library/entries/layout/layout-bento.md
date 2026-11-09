---
id: layout-bento
title: Bento grids (use sparingly)
category: layout
summary: Mixed size tiles in one grid; when they help (a few genuinely different items) and when they are the generic AI default.
intents: [build-section, layout]
tags: [bento, tiles, grid, mosaic, feature-grid]
components: [grid, cards]
phases: [plan, build, review]
priority: 2
related: [anti-slop-floating-cards, anti-slop-identical-saas]
version: 1
---
**Stance**: bento grids are one of the most overused machine layouts (especially for feature lists). Use one only when the items are genuinely different in kind and importance, and each tile has real content (a photo, a real product, a real quote).

**Good uses**: a creator's home showing their latest video, a product, a community and a newsletter at different sizes; a portfolio overview with one hero project and several smaller ones.

**Specs**: a 4 or 6 column grid with `grid-auto-rows` (e.g. 180 to 240px); 2 to 3 tile sizes; gaps 8 to 16px; one radius; no more than 6 to 8 tiles.

```css
.bento { display: grid; grid-template-columns: repeat(4, 1fr); grid-auto-rows: 200px; gap: 12px; }
.bento .lg { grid-column: span 2; grid-row: span 2; }
@media (max-width: 700px) { .bento { grid-template-columns: 1fr 1fr; grid-auto-rows: 160px; } }
```

**Don't**: fill tiles with icon plus heading plus line of text ("Fast", "Secure", "Scalable"). That is a feature list in disguise; use a plain list.

---
id: responsive-breakpoints
title: Breakpoints, fluid values and container queries
category: responsive
summary: Content driven breakpoints, a small standard set, fluid clamp values instead of many steps, and container queries for reusable sections.
intents: [build-section, responsive, fix-mobile]
tags: [breakpoints, media-queries, container-queries, clamp, fluid]
phases: [build]
priority: 4
related: [responsive-mobile-first, typography-scale]
version: 1
---
**Breakpoints follow content**: add one where the layout breaks, not at device widths. A useful default set: 600px (large phones, two columns), 900px (tablets, splits), 1200px (desktop, full grid).

**Fluid first**: spacing and display type with `clamp(min, preferred, max)` remove most breakpoints.

**Container queries** let a section adapt to the width it is placed in (a product card in a sidebar vs a full row):

```css
.cards { container-type: inline-size; }
@container (min-width: 640px) { .card { display: grid; grid-template-columns: 200px 1fr; } }
```

**Grids that need no breakpoints**: `grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr));`

**Test widths**: 320, 375, 414, 768, 1024, 1280, 1440, 1920. Check the in-between widths too by resizing slowly.

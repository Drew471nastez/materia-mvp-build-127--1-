---
id: layout-layered
title: Layered and overlapping compositions
category: layout
summary: Overlapping images and text with z-order, negative margins and grid overlap, while keeping reading order and contrast safe.
intents: [build-section, layout]
tags: [layered, overlap, depth, collage, z-index, composition]
components: [image, hero]
phases: [build]
priority: 3
related: [layout-asymmetric-grid, layout-floating]
version: 1
---
**Grid overlap** is more robust than absolute positioning: put two items in overlapping grid areas.

```css
.layer { display: grid; grid-template-columns: repeat(12, 1fr); }
.layer .photo { grid-column: 4 / -1; grid-row: 1; }
.layer .text { grid-column: 1 / 8; grid-row: 1; align-self: end; z-index: 1; background: var(--surface); padding: clamp(20px, 3vw, 40px); margin-bottom: -48px; }
@media (max-width: 760px) { .layer .photo, .layer .text { grid-column: 1 / -1; } .layer .text { grid-row: 2; margin: -32px 16px 0; } }
```

**Rules**: text that overlaps an image needs a solid or near solid backing; DOM order follows reading order (heading before decorative image); overlaps are limited to one or two per page so they stay special.

**Collage**: three or four images at different sizes with slight overlaps can tell a story (a studio, a trip). Fix their positions on a grid; do not randomise with JS.

**Avoid**: overlapping interactive elements (links under images cannot be clicked), overlaps that collide at intermediate widths. Check 375, 768, 1024 and 1440.

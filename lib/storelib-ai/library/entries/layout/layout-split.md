---
id: layout-split
title: Split layouts
category: layout
summary: Two column compositions (text and image, image and image) with ratios beyond 50/50, stacking order on phones and sticky sides.
intents: [build-section, layout, design-hero]
tags: [split, two-column, side-by-side, image-text, 50-50]
components: [hero, image-with-text]
phases: [plan, build]
priority: 4
related: [hero_split, image_with_text, layout-sticky-storytelling]
version: 1
---
**Ratios**: 50/50 is the default and the least interesting. Try 7/5 or 8/4 on a 12 column grid; let the image take the larger share for visual brands, the text for explanatory ones.

**Alignment**: vertically centre short text against a tall image; top align long text. A split where text floats in the middle of a huge empty half looks unfinished; let the image dominate or add real content.

**Stacking on phones**: decide the order on purpose. Usually image first for products and portfolios, text first for services where the promise matters. Use `order` only when the DOM order is already the reading order for screen readers; better to write the DOM in the phone order.

**Breaking the box**: let the image bleed to the viewport edge on its side while the text stays on the grid:

```css
.split { display: grid; grid-template-columns: 1fr; gap: 32px; }
@media (min-width: 900px) { .split { grid-template-columns: 7fr 5fr; gap: 64px; align-items: center; } }
```

**Alternating splits** down a page (image left, then right) are fine twice; four in a row becomes a template. Change the rhythm with a full width section between.

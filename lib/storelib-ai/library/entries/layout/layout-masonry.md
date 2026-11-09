---
id: layout-masonry
title: Masonry and justified galleries
category: layout
summary: Showing mixed aspect images without cropping, with CSS columns or a justified row layout, and reading order caveats.
intents: [gallery, build-section, layout]
tags: [masonry, pinterest, gallery, justified, mixed-ratio, columns]
components: [gallery, image]
phases: [build]
priority: 3
related: [component-gallery, industry-photography]
version: 1
---
**CSS columns** (simplest, no JS): items flow top to bottom per column, which means reading order goes down columns, not across rows. Fine for photos, wrong for ordered content like a timeline.

```css
.masonry { columns: 3 280px; column-gap: 16px; }
.masonry > * { break-inside: avoid; margin-bottom: 16px; }
.masonry img { width: 100%; height: auto; display: block; }
```

**Justified rows** (row order preserved, nothing cropped): use flex with grow factors equal to each image's aspect ratio.

```css
.justified { display: flex; flex-wrap: wrap; gap: 8px; }
.justified figure { flex-grow: calc(var(--w) / var(--h)); flex-basis: calc(220px * var(--w) / var(--h)); margin: 0; }
.justified img { width: 100%; height: auto; display: block; }
```
Set `--w` and `--h` from the image's real dimensions (and use width and height attributes to avoid layout shift).

**Phones**: two columns for small images, one for portfolios. Lazy load below the first screen.

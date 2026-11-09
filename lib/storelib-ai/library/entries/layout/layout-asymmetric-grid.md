---
id: layout-asymmetric-grid
title: Asymmetric grids
category: layout
summary: Placing content off centre on a 12 column grid with deliberate empty columns, offsets and overlaps; specs and phone fallbacks.
intents: [build-section, layout, choose-style]
tags: [asymmetric, grid, 12-column, offset, off-centre, composition]
components: [grid]
phases: [plan, build]
priority: 4
related: [style-swiss, style-editorial, layout-editorial-columns]
version: 1
---
Asymmetry gives tension and direction. It needs a grid to look deliberate rather than broken.

**Grid**: 12 columns, gutters 16px (phone) to 24 to 32px (desktop), outer margins 16 to 20px on phones and at least 1 column on desktop.

**Moves**
- Text in columns 2 to 7, image in 8 to 12 starting lower (offset by 80 to 160px).
- A heading that starts in column 1 and a paragraph that starts in column 5 below it.
- An image that spans columns 1 to 8, with a caption in columns 10 to 12 aligned to its bottom.
- Overlap: an image in 5 to 12 and a text box in 1 to 6 on the same row, the text box layered above with a solid background.

```css
.grid { display: grid; grid-template-columns: repeat(12, 1fr); column-gap: clamp(16px, 2.5vw, 32px); }
.a { grid-column: 2 / span 6; }
.b { grid-column: 8 / span 5; margin-top: clamp(40px, 8vw, 140px); }
@media (max-width: 760px) { .a, .b { grid-column: 1 / -1; margin-top: 0; } }
```

On phones, asymmetry comes from alignment and indentation (a caption indented by 25%), not from columns.

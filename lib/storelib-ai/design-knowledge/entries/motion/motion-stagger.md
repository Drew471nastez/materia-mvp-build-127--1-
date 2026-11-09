---
id: motion-stagger
title: Staggered sequences
category: motion
summary: Staggering lists and grids: delays per item, caps on total time, and order that follows reading.
intents: [add-motion, build-section, animation]
tags: [motion, animation, stagger, sequence, cascade, choreography]
components: [motion]
phases: [build, review]
priority: 3
related: [motion-fades-slides, motion-principles]
version: 1
---
**Delay**: 40 to 80ms between items; cap the total sequence at about 400 to 600ms (beyond 8 items, stop increasing the delay).

```css
[data-reveal] { transition-delay: calc(min(var(--i, 0), 8) * 60ms); }
```
Set `--i` from the loop index (`style="--i: {{ forloop.index0 }}"`).

**Order**: follow reading order (left to right, top to bottom). For grids, stagger by row then column, or by diagonal for a softer wave.

**Text reveals**: stagger words or lines, not letters, for anything longer than a short headline.

**Re-entry**: animate once. Repeating staggered reveals on scroll up feels busy.

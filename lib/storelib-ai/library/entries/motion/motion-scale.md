---
id: motion-scale
title: Scale animations
category: motion
summary: Scaling on entry, hover and press: safe ranges, transform origin, avoiding blurry text and layout overlap.
intents: [add-motion, build-section, animation]
tags: [motion, animation, scale, zoom, grow, pop]
components: [motion]
phases: [build, review]
priority: 3
related: [motion-hover, motion-image-transforms]
version: 1
---
**Ranges**: entrance from 0.96 to 1 (subtle) or 0.9 to 1 (expressive); hover 1.02 to 1.05 for cards and images; press 0.97 to 0.98.

**Origin**: set `transform-origin` to where the element comes from (a menu from its button, a dialog from centre).

**Text**: scaling text containers can blur glyphs mid animation; keep scale animations short on text or scale only the media.

**Overflow**: images that scale on hover sit inside a clipping wrapper (`overflow: clip`) so they do not overlap neighbours.

**Avoid**: scaling from 0 (feels like a pop up ad), bouncing scale on every element, scaling large sections (causes repaint of huge layers).

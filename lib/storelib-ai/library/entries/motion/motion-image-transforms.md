---
id: motion-image-transforms
title: Image transforms and reveals
category: motion
summary: Revealing and moving images: clip path wipes, mask reveals, slow scale, colour to full, and their costs.
intents: [add-motion, build-section, animation]
tags: [motion, animation, image, reveal, clip-path, mask, ken-burns, zoom]
components: [motion]
phases: [build, review]
priority: 3
related: [motion-scroll, style-dark-cinematic]
version: 1
---
**Clip path wipe**: from `inset(100% 0 0 0)` to `inset(0)` over 700 to 900ms ease out. Elegant for editorial and luxury.

**Slow scale**: image starts at scale 1.08 and settles to 1 over 1.2 to 1.6s on load or entry. Gives life to static photos without a carousel.

**Colour to full**: greyscale to colour on hover for gallery grids (concept dependent; it can feel dated).

**Costs**: animating `filter` and large clip paths repaints; keep to one or two images in view at a time; use `will-change: transform` only during the animation.

**Reduced motion**: images simply appear. Never hide an image permanently behind an animation that might not run.

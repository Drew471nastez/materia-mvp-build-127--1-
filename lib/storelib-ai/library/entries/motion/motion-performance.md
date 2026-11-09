---
id: motion-performance
title: Animation performance
category: motion
summary: Keeping motion at 60fps on mid range phones: compositor friendly properties, layer limits, measuring, and what to cut first.
intents: [add-motion, build-section, animation]
tags: [motion, animation, performance, jank, fps, will-change, compositing, cls]
components: [motion]
phases: [build, review]
priority: 3
related: [motion-principles, debug-layout-shift]
version: 1
---
- **Compositor only**: `transform`, `opacity` (and `filter` sparingly). Anything that changes layout (`width`, `margin`, `top`) or paint (`box-shadow`, `background-position` on large areas) costs per frame.
- **will-change**: add right before an animation and remove after; permanent `will-change` on many elements wastes memory.
- **Layers**: a handful of animated layers in view, not dozens.
- **Blur and backdrop filters** are the most expensive; never animate their radius.
- **Scroll handlers**: passive listeners, no layout reads in them; prefer IntersectionObserver and scroll timelines.
- **Offscreen**: pause loops and videos when out of view (`IntersectionObserver`) and when the tab is hidden (`visibilitychange`).
- **Measure**: Chrome performance panel with 4x CPU throttle; aim for no long tasks over 50ms during scroll.
- **Cut order** when slow: parallax, then blur, then large clip paths, then staggered reveals.

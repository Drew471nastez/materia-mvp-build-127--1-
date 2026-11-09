---
id: motion-parallax
title: Parallax
category: motion
summary: Subtle depth on scroll: small offsets, transform only, CSS first, and disabled on reduced motion and low power.
intents: [add-motion, build-section, animation]
tags: [motion, animation, parallax, depth, scroll-depth, layers]
components: [motion]
phases: [build, review]
priority: 2
related: [motion-scroll, motion-principles]
version: 1
---
**Subtle**: background images move 10 to 20% slower than the page; foreground decorations at most 40 to 80px offset over the section. Strong parallax causes motion sickness.

**Implementation**: CSS scroll timelines where supported; otherwise a single rAF loop applying `translate3d` to a few elements. Never `background-attachment: fixed` (broken on iOS, costly).

```css
@supports (animation-timeline: view()) { @media (prefers-reduced-motion: no-preference) {
  .para { animation: drift linear both; animation-timeline: view(); }
  @keyframes drift { from { transform: translateY(-40px); } to { transform: translateY(40px); } }
} }
```

**Limit** to one parallax element per section; disable on small screens if it causes jank.

---
id: motion-loading
title: Loading motion
category: motion
summary: Motion for waiting: spinners, shimmer, progress, and why full page preloaders hurt.
intents: [add-motion, build-section, animation]
tags: [motion, animation, loading, spinner, skeleton, progress, preloader]
components: [motion]
phases: [build, review]
priority: 2
related: [component-loading, state-async]
version: 1
---
**Spinner**: 16 to 24px inside the busy control, rotating at about 0.8 to 1s per turn, `aria-hidden` with a text status beside it for assistive tech.

**Shimmer**: low contrast sweep 1.2 to 1.6s, stopped under reduced motion.

**Progress**: determinate when you know the progress (uploads, multi step jobs), with a percentage or step text.

**Preloaders**: avoid full screen intros that hold content back. If the concept insists on an intro, keep it under 1.2s, skip on repeat visits (session storage), and never on reduced motion.

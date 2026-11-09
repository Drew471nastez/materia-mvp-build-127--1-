---
id: component-loading
title: Loading indicators and skeletons
category: component
summary: Choosing between spinners, skeletons and progress bars, timing thresholds, and avoiding layout shift.
intents: [build-component, build-section]
tags: [loading, spinner, skeleton, progress, shimmer, placeholder]
components: [loading, skeleton, spinner, progress]
capabilities: []
phases: [build, review]
priority: 3
related: [state-async, motion-loading]
version: 1
---
**Thresholds**: under about 300ms show nothing (a flash of spinner looks worse); 300ms to 2s spinner or skeleton; over 2s a progress indicator with text, and over about 10s, what is happening and the option to keep browsing.

**Skeletons**: match the final layout exactly (same sizes and ratios) so content replaces them without shift. Neutral blocks at low contrast; shimmer optional and stopped under reduced motion.

```css
.skeleton { background: var(--surface); border-radius: 4px; }
@media (prefers-reduced-motion: no-preference) { .skeleton { background: linear-gradient(90deg, var(--surface) 0, var(--surface-2) 50%, var(--surface) 100%) 0 0 / 200% 100%; animation: sk 1.4s linear infinite; } }
@keyframes sk { to { background-position: -200% 0; } }
```

**Spinners**: inside the element that is busy (a button), with `aria-busy="true"` on the region and a text alternative.

**Pages**: do not put full page preloaders in front of content that is already rendered; they only delay it.

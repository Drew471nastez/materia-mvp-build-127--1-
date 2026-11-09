---
id: responsive-mobile-first
title: Designing the phone layout first
category: responsive
summary: Decide per section what stacks, in what order, how text and images resize, and what becomes a scroll row, starting at 375px.
intents: [build-section, fix-mobile, responsive]
tags: [mobile, mobile-first, phone, responsive, stack, small-screen]
phases: [plan, build, review]
priority: 5
related: [responsive-breakpoints, responsive-touch, anti-slop-weak-mobile]
version: 1
---
Most visitors to creator sites arrive from social apps on phones. Design 375px first, then add.

**Per section, decide**
- Stacking order (write the DOM in that order).
- Which images crop, and to what ratio (portrait 4:5 often beats a squashed landscape).
- Whether a grid becomes 1 column, 2 columns, or a horizontal scroll row.
- Which text shrinks (display) and which does not (body stays 16 to 18px).
- Which decorative elements disappear (floating details, big empty columns).
- Spacing: section padding about 60% of desktop.

**Base styles are the phone styles**; add `@media (min-width: ...)` for larger screens. Container queries (`@container`) are better for components that appear in different widths.

**First screen on phones**: brand, what it is, the main action. If the hero image pushes the action down, shorten the image (`aspect-ratio: 4/5` or `min-height: 60svh`).

**Never** let the page scroll sideways. Common causes: fixed widths, `100vw` (includes the scrollbar), long words, negative margins, wide tables.

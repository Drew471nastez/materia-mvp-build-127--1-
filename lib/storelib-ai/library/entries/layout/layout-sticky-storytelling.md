---
id: layout-sticky-storytelling
title: Sticky storytelling
category: layout
summary: A pinned visual with steps scrolling beside it, built with position sticky (no scroll hijacking), and what to show on phones.
intents: [build-section, layout, motion]
tags: [sticky, scrollytelling, pinned, steps, process, story]
components: [process, steps]
phases: [build]
priority: 3
related: [motion-sticky, layout-split, process]
version: 2
---
**Pattern**: a tall section; one side holds a sticky media panel, the other side has steps that scroll normally. As each step enters, the media changes.

```css
.story { display: grid; grid-template-columns: 1fr; gap: 32px; }
@media (min-width: 900px) {
  .story { grid-template-columns: 1fr 1fr; }
  .story .media { position: sticky; top: calc(var(--header-h, 72px) + 24px); height: calc(100svh - var(--header-h, 72px) - 48px); }
  .story .step { min-height: 70svh; display: flex; align-items: center; }
}
```

**Switching media**: in a Storelib section there is no IntersectionObserver (the script runs in a sandbox on a copy of the markup). Put each step's image inside its step and make the media column sticky per step, or crossfade images with a view timeline on each step (`animation-timeline: view()`); without support, every image simply shows beside its step.

**Phones**: drop the sticky panel. Put each step's image directly above its text. Sticky panels on small screens cover the content.

**Rules**: no scroll hijacking or snapping that fights the user; each step has its own heading; reduced motion swaps media instantly.

**Watch out**: `position: sticky` fails inside an ancestor with `overflow: hidden`; use `overflow: clip` on the ancestor instead if you need clipping.

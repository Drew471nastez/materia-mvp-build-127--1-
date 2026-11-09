---
id: motion-hover
title: Hover effects
category: motion
summary: Hover feedback for links, buttons, cards and images; guarded for hover devices, matched by focus, and quick.
intents: [add-motion, build-section, animation]
tags: [motion, animation, hover, pointer, interaction, link-hover, card-hover]
components: [motion]
phases: [build, review]
priority: 4
related: [state-interactive-matrix, motion-micro-interactions]
version: 1
---
**Speed**: 120 to 200ms in, slightly faster out.

**Guard**: `@media (hover: hover) and (pointer: fine)` so touch devices do not get sticky hover states.

**Patterns**
- Links: underline offset or thickness change; an underline that grows from left (`background-size` transition on a linear gradient underline).
- Buttons: background shift 8 to 12%; neo brutal press; arrow nudges 2 to 4px.
- Cards: image scale 1.03 inside a clip; title underline; no lifting cards with growing shadows everywhere.
- Images: swap to a second image (products), or caption reveal.

**Focus parity**: apply the same visible change on `:focus-visible`.

**Never** hide essential actions behind hover (quick add must be reachable on touch and keyboard).

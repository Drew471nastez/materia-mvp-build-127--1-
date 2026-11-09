---
id: layout-floating
title: Floating elements
category: layout
summary: Floating badges, notes, stickers and media over content: where they add meaning, limits, and why most floating cards are slop.
intents: [build-section, layout, review]
tags: [floating, sticker, overlay, badge, absolute, floating-card]
components: [badge, card]
phases: [build, review]
priority: 2
related: [anti-slop-floating-cards, layout-layered]
version: 1
---
**Earn it**: a floating element should carry real information tied to what it floats over: a sticker with the real price on a product photo, a caption pinned to a location on a map, a play button on a video, a "New" label from product data.

**Limits**: one or two per viewport; never over faces or the main subject; never covering text.

**Slop version**: hero screenshots surrounded by little cards ("+45% conversions", "New sale!", a fake notification), cards floating with a bobbing animation. The evaluator flags it unless the concept explains it.

**Specs if used**: anchor to a corner of the parent with `position: absolute`, offset 12 to 24px, a solid background with contrast, a small shadow at most, no infinite float animation (if any motion, one entrance).

**Phones**: floating items often collide; move them inline under the media on small screens.

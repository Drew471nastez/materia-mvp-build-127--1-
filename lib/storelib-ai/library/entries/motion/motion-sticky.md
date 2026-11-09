---
id: motion-sticky
title: Sticky elements in motion
category: motion
summary: Sticky panels, sticky add to cart bars and pinned media: offsets, stacking, and making sure they never cover content.
intents: [add-motion, build-section, animation]
tags: [motion, animation, sticky, pinned, sticky-header, sticky-cta, sticky-panel]
components: [motion]
phases: [build, review]
priority: 3
related: [layout-sticky-storytelling, header-sticky]
version: 1
---
**Sticky add to cart** (product pages, phones): appears when the main buy button scrolls out of view (observe it), slides up 200ms, includes price and the button, padding for the safe area. Hide when the footer or the main button is visible again.

**Sticky side panel** (product details, course summary): `position: sticky; top: header height + 24px; align-self: start;` and a max height with its own scroll if tall.

**Stacking cards**: sections that stick and stack as you scroll (each `position: sticky; top: N`) can show a process; keep to 3 to 5 items and make sure the last one releases.

**Never** cover form fields, the cookie banner or the chat button; check that sticky elements do not overlap each other.

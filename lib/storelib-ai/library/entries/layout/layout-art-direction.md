---
id: layout-art-direction
title: Responsive art direction: a phone is designed, not stacked
category: layout
summary: Each key section gets its own phone composition at 360 to 390px: intentional line breaks, its own crop and order, sticky and pinned effects turned into sequential content, 44px targets, nothing hover-only.
intents: [build-section, layout, responsive, review]
tags: [responsive, mobile, art direction, phone, breakpoints, crop, focal point, order, sticky, tap targets, container queries]
components: [hero, gallery, navigation]
phases: [plan, build, review]
priority: 5
related: [layout-grammar, motion-tiers, anti-slop-weak-mobile]
version: 1
---
- Design each key section for the phone on purpose (360 to 390px): the headline wraps where you chose, the photo's subject is visible, the action is in the first screen.
- Phones get their own crop and focal point for photos, their own type step and their own order (write the DOM in phone order); never the desktop shrunk and stacked.
- Sticky, pinned and scroll-linked effects become plain sequential content under about 600px wide.
- Tap targets 44px or more, nothing only on hover, sideways galleries swipeable with visible progress and keyboard access, images with reserved ratios so nothing shifts.

**How, in a .storelib section**: put `container-type: inline-size` on the section root and write the phone layout first, then widen with `@container (min-width: 760px)`. Give a photo its own phone ratio (4/5 or 3/4) and `object-position` so the subject stays in frame. Use one block per headline line when the line breaks matter. Turn a sticky column into a plain sequence below about 600px. Check the page at 360, 390, 768, 1024 and 1440px wide.

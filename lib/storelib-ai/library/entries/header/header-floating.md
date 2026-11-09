---
id: header-floating
title: Floating header
category: header
summary: A detached header bar with margin from the edges; when it fits, and how to stop it becoming the generic floating pill nav.
intents: [design-header, build-section, navigation]
tags: [header, navigation, nav, floating, detached, pill-nav]
components: [header, navigation]
phases: [plan, build]
priority: 2
related: [header-sticky, anti-slop-excessive-radius]
version: 1
---
**What**: a header that floats inset from the viewport edges (12 to 24px), with its own background and maybe a radius.

**When it fits**: over immersive imagery, product sites with a tool feel, or when the concept calls for layers. It is a common machine default (blurred pill nav centred at the top), so choose it deliberately.

**Specs**: inset 12 to 16px on phones, 16 to 24px desktop; solid background (or glass only when the concept is glassmorphism, with a solid fallback); radius consistent with the rest of the site (do not use a 999px pill if buttons are 6px).

**Avoid**: covering content as you scroll (add top padding to the page equal to header height plus inset); low contrast translucent backgrounds.

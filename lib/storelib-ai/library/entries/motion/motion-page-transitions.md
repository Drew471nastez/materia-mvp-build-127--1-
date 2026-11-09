---
id: motion-page-transitions
title: Page transitions
category: motion
summary: Transitions between pages with the View Transitions API, short durations and no blocking.
intents: [add-motion, build-section, animation]
tags: [motion, animation, page-transition, view-transitions, route, navigation]
components: [motion]
phases: [build, review]
priority: 2
related: [motion-principles, header-fullscreen-menu]
version: 1
---
**Use the platform**: cross document view transitions (`@view-transition { navigation: auto; }`) give a fade between pages in supporting browsers with no JS; other browsers just navigate.

```css
@media (prefers-reduced-motion: no-preference) {
  @view-transition { navigation: auto; }
  ::view-transition-old(root), ::view-transition-new(root) { animation-duration: .25s; }
}
```

**Shared elements**: give a product image and the product page hero the same `view-transition-name` for a morph. Names must be unique per page.

**Rules**: under 300 to 400ms; never delay navigation waiting for an exit animation; no full screen wipes on every click unless the concept is experimental and fast.

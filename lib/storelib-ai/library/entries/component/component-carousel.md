---
id: component-carousel
title: Carousels and sliders
category: component
summary: When a carousel is worth it, accessible controls, no autoplay by default, and native scroll snap instead of heavy libraries.
intents: [build-component, build-section]
tags: [carousel, slider, slideshow, swiper, rail]
components: [carousel, slider]
capabilities: []
phases: [build, review]
priority: 4
related: [layout-horizontal-scroll, motion-principles]
version: 1
---
**Question first**: would a grid or a scroll row show the content better? Carousels hide content; most visitors see only the first slide.

**Good uses**: product image galleries on phones, a row of related products, a lookbook sequence, reviews when there are many real ones.

**Requirements**
- Previous and next buttons with labels ("Previous slide"), at least 44px.
- Slide position announced ("3 of 7") via a visually hidden live region or visible counter.
- Swipe on touch (native scroll snap gives this), arrow keys when focused.
- **No autoplay** by default. If the creator asks for it: pause on hover and focus, a visible pause button, at least 5 seconds per slide, disabled under reduced motion.

**Implementation**: a scroll snap rail (see layout-horizontal-scroll) plus buttons that scroll by one slide width. Embla (already a dependency in the app) is fine inside the app; generated sections should use native scroll.

**Avoid**: fade carousels for hero messages ("slider heroes"); dots as the only control; infinite loops that clone slides confusing screen readers.

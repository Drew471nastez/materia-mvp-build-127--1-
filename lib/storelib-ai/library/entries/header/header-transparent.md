---
id: header-transparent
title: Transparent header over the hero
category: header
summary: A header that sits over the first image and turns solid after scrolling; contrast, scroll threshold and implementation.
intents: [design-header, build-section, navigation]
tags: [header, navigation, nav, transparent, overlay, hero]
components: [header, navigation]
phases: [plan, build]
priority: 4
related: [hero_immersive, header-sticky, layout-full-bleed]
version: 1
---
**When**: the first section is a full bleed image or video and the brand wants the image to start at the top edge.

**Contrast**: logo and links must pass 3:1 (icons) and 4.5:1 (text) against every part of the image under them. Add a top scrim (`linear-gradient(to bottom, rgba(0,0,0,.45), transparent)`, 120 to 160px tall) rather than hoping.

**Solid after scroll**: switch to a solid background after about 40 to 80px of scroll. Use an IntersectionObserver on a sentinel at the top of the page instead of a scroll listener:

```js
const io = new IntersectionObserver(([e]) => header.dataset.solid = String(!e.isIntersecting));
io.observe(document.querySelector('[data-header-sentinel]'));
```
```css
header[data-solid="true"] { background: var(--bg); color: var(--text); box-shadow: 0 1px 0 var(--border); }
header { transition: background-color .2s, color .2s; }
```

**Logo variants**: provide a light and dark logo or use `currentColor` SVG so it flips with the header.

**Pages without a hero**: the header must be solid there; do not leave white text over a white page.

---
id: header-sticky
title: Sticky and hide on scroll headers
category: header
summary: Keeping navigation reachable while scrolling: sticky with position, hide on scroll down and reveal on scroll up, and offsets for anchors.
intents: [design-header, build-section, navigation]
tags: [header, navigation, nav, sticky, fixed, hide-on-scroll, auto-hide]
components: [header, navigation]
phases: [plan, build]
priority: 4
related: [header-transparent, header-minimal]
version: 1
---
**Sticky**: `position: sticky; top: 0; z-index: 50;` on the header (no JS). Make sure no ancestor has `overflow: hidden`.

**Hide on scroll down, show on scroll up** saves space on phones:

```js
let last = scrollY;
addEventListener('scroll', () => { const y = scrollY; header.dataset.hidden = String(y > last && y > 120); last = y; }, { passive: true });
```
```css
header { transition: transform .25s ease; }
header[data-hidden="true"] { transform: translateY(-100%); }
@media (prefers-reduced-motion: reduce) { header { transition: none; } }
```
Never hide it while focus is inside it or a menu is open.

**Anchors**: set `scroll-margin-top` on targets (or `scroll-padding-top` on html) equal to the header height so headings are not hidden under it.

**Height**: a sticky header should be 56 to 72px; taller headers eat phone screens.

---
id: debug-horizontal-overflow
title: Horizontal scrolling on phones
category: debugging
summary: Finding and fixing the element that makes a page scroll sideways on phones.
intents: [debug, repair, fix]
tags: [debugging, bug, overflow, horizontal-scroll, 100vw, mobile-bug]
phases: [repair, review]
priority: 4
related: [anti-slop-weak-mobile, responsive-mobile-first]
version: 1
---
**Find it**: in devtools, run
```js
[...document.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
```

**Usual causes**: `width: 100vw` (includes scrollbar; use `100%`), fixed pixel widths, long unbroken words or URLs (`overflow-wrap: anywhere`), negative margins on full bleed tricks, transforms that move elements off screen, wide tables and code blocks without a scroll wrapper, grids with `minmax(300px, 1fr)` at 320px (use `minmax(min(300px, 100%), 1fr)`), images without `max-width: 100%`.

**Do not** hide it with `overflow-x: hidden` on body; it breaks `position: sticky` and hides the bug. Use `overflow-x: clip` on the specific wrapper if clipping is intended.

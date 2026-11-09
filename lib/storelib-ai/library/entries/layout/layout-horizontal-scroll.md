---
id: layout-horizontal-scroll
title: Horizontal scroll rows
category: layout
summary: Native horizontally scrolling rows with scroll snap for products, looks and testimonials; affordances, keyboard and no scroll jacking.
intents: [build-section, layout, carousel]
tags: [horizontal-scroll, scroll-snap, rail, slider, swipe, overflow]
components: [carousel, product-grid]
phases: [build]
priority: 3
related: [component-carousel, responsive-mobile-first]
version: 1
---
Prefer a native scroll row over a JS carousel: it is accessible, works with touch and trackpads, and needs no library.

```css
.rail { display: grid; grid-auto-flow: column; grid-auto-columns: min(78%, 320px); gap: 16px; overflow-x: auto; scroll-snap-type: x mandatory; padding-inline: 16px; scroll-padding-inline: 16px; overscroll-behavior-x: contain; }
.rail > * { scroll-snap-align: start; }
.rail:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
@media (min-width: 1000px) { .rail { grid-auto-columns: calc((100% - 48px) / 4); } }
```

**Affordance**: show part of the next item (the 78% width above) so people know it scrolls. Optional previous and next buttons that call `scrollBy({ left: rail.clientWidth * .9, behavior: 'smooth' })` (instant under reduced motion).

**Accessibility**: give the rail `tabindex="0"`, `role="region"` and an `aria-label` so keyboard users can scroll it; items stay in normal tab order.

**Avoid**: vertical scroll converted into horizontal movement (scroll jacking) unless the concept is experimental and a normal fallback exists; hiding the scrollbar on desktop with no buttons.

**Don't confuse**: the page itself must never scroll sideways; only the rail does.

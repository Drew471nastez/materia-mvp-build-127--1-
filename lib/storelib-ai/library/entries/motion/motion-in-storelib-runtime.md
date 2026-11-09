---
id: motion-in-storelib-runtime
title: Motion and interaction inside Storelib's runtime
category: motion
summary: What a section's script can and cannot do in the sandbox, and the CSS techniques to use instead: scroll-driven animation, :has(), details, popover, sticky, view transitions; reduced motion always.
intents: [add-motion, add-interaction, build-section, fix-script]
tags: [motion, sandbox, script, scroll-driven, animation-timeline, view-timeline, has, popover, details, view-transition, intersectionobserver, reduced-motion]
components: [motion]
phases: [plan, build, repair]
priority: 5
related: [component-interactive-library, motion-scroll, motion-principles, debug-section-scripts]
version: 1
---
**The script's world**: a section's script runs in a sandboxed frame against a copy of its own markup. It can listen to clicks, input, change, keys, focus and toggle; it can change classes, attributes (aria-*, data-*, hidden, open, popover, inert, tabindex) and inline styles including custom properties; it can ask the page to scroll an element (storelib.scrollTo) or go to another section. It cannot read layout or scroll position, observe intersections, focus an element, play or pause a video, add markup, or use window, document, fetch, storage or timers (timers only with the timers capability).

**So reach for CSS first**:
- Reveals, parallax, progress bars, counters: `animation-timeline: view()` or a named `scroll-timeline`, inside `@supports (animation-timeline: view())` and `@media (prefers-reduced-motion: no-preference)`, with the final state as the default so nothing is hidden without support.
- Tabs, filters, swatches: a radio group plus `:has(:checked)`; arrow keys work for free.
- Accordions: `<details name="group">` for one open at a time; `::details-content` with `interpolate-size: allow-keywords` for a height transition.
- Menus, mega menus, dialogs: the popover attribute with `popovertarget` buttons; Escape and outside clicks close it, focus is handled by the browser.
- Sticky storytelling and stacked panels: `position: sticky` with a top that grows per item.
- Page to page: `@view-transition { navigation: auto; }` gives a cross document fade where supported; name one element with view-transition-name for a shared image.
- Hover reveals: `@media (hover: hover) and (pointer: fine)` so touch gets a plain layout.

**Use a script for state only**: a before and after split from a range input, a quantity stepper's label, a selected swatch's name. Keep it a few lines and make the markup work without it.

**Always**: prefers-reduced-motion turns movement off; motion lasts 150 to 400ms for UI and never loops more than once per page outside a marquee; nothing essential depends on motion.

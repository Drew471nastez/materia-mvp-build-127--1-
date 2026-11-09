---
id: responsive-touch
title: Touch targets, gestures and safe areas
category: responsive
summary: Tap target sizes and spacing, hover alternatives, gesture etiquette, iOS safe areas and viewport units on phones.
intents: [fix-mobile, build-component]
tags: [touch, tap-target, gestures, safe-area, viewport, svh, ios]
phases: [build, review]
priority: 4
related: [responsive-mobile-first, a11y-checklist]
version: 1
---
- **Tap targets**: at least 44x44px (24px is the WCAG minimum, 44 to 48 is the comfortable one); at least 8px between adjacent targets. Expand small icon links with padding.
- **No hover dependence**: anything revealed on hover must be visible or tappable on touch.
- **Gestures**: swipe only where people expect it (galleries, carousels, sheets), always with a button alternative. Do not override pinch zoom (`user-scalable=no` is forbidden).
- **Safe areas**: fixed bars use `env(safe-area-inset-bottom)` and `env(safe-area-inset-top)`; the viewport meta needs `viewport-fit=cover` for them to be non zero.
- **Viewport units**: `100vh` is wrong on mobile browsers with dynamic bars; use `svh` (small), `dvh` (dynamic, can cause jumps) or `lvh`. Storelib themes expose `var(--sl-vh)`.
- **Inputs**: 16px font minimum to prevent iOS zoom; right `inputmode` for keyboards.

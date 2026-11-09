---
id: component-drawer
title: Drawers and sheets
category: component
summary: Side drawers and bottom sheets for carts, filters and menus: sizes, focus, scroll lock, drag to close and the Storelib cart panel.
intents: [build-component, build-section]
tags: [drawer, sheet, side-panel, bottom-sheet, cart-drawer]
components: [drawer, sheet]
capabilities: []
phases: [build, review]
priority: 4
related: [component-dialog, storelib-checkout-cta, header-mobile-menu]
version: 1
---
**Uses**: cart, filters, menu, quick view. Content that relates to the current page and closes back to it.

**Sizes**: side drawers 360 to 440px wide desktop, 85 to 100% on phones. Bottom sheets up to 90svh with a visible handle and rounded top corners.

**Behaviour**: same as a modal: focus moves in, trapped, Escape and backdrop close, focus returns. Lock page scroll; let the drawer body scroll with `overscroll-behavior: contain`. Use `inert` on the page behind.

**Motion**: slide 250 to 320ms ease out on open, 200ms on close; backdrop fades. Instant under reduced motion.

**Bottom sheet safe area**: `padding-bottom: calc(16px + env(safe-area-inset-bottom))`.

**Storelib cart**: a section can provide its own cart panel (`data-storelib-cart-panel` with `data-open`), lines from the real cart template, subtotal and a checkout button; the built-in drawer is used otherwise.

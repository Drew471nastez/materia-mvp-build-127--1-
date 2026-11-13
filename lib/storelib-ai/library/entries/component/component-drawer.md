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
version: 2
---
**Uses**: cart, filters, menu, quick view. Content that relates to the current page and closes back to it.

**Sizes**: side drawers 360 to 440px wide desktop, 85 to 100% on phones. Bottom sheets up to 90svh with a visible handle and rounded top corners.

**Behaviour**: same as a modal: focus moves in, trapped, Escape and backdrop close, focus returns. Lock page scroll; let the drawer body scroll with `overscroll-behavior: contain`. Use `inert` on the page behind.

**Motion**: slide 250 to 320ms ease out on open, 200ms on close; backdrop fades. Instant under reduced motion.

**Bottom sheet safe area**: `padding-bottom: calc(16px + env(safe-area-inset-bottom))`.

**Shut means not drawn**: on Storelib the page does not draw a `data-storelib-cart-panel`, `-search-panel` or `-menu-panel` until it opens, and takes it off again when its closing motion ends. Write the shut look as the default (translated off the edge, opacity 0) and the open look under `[data-open="true"]` with a transition between them. Never hide the panel yourself with `display`, `visibility` or `hidden`.

**Fixed on the panel itself**: a drawer, sheet or full screen window is `position: fixed` on the element that carries the panel attribute; the page lifts it above everything on the screen whatever it is nested in (a blurred or sticky header included). Only a small card anchored under its button is `position: absolute`. Height from the screen (`100dvh`, or top and bottom 0), never from the page.

**Storelib cart**: a section can provide its own cart panel (`data-storelib-cart-panel` with `data-open`), lines from the real cart template, subtotal and a checkout button; the built-in drawer is used otherwise.

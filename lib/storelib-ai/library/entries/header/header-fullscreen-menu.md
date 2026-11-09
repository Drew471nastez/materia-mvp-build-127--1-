---
id: header-fullscreen-menu
title: Full screen menu overlay
category: header
summary: A menu that takes the whole screen with large links; focus trap, scroll lock, Escape and the motion to open it.
intents: [design-header, build-section, navigation]
tags: [header, navigation, nav, fullscreen, overlay-menu, menu-takeover, big-menu]
components: [header, navigation]
phases: [plan, build]
priority: 3
related: [header-mobile-menu, component-dialog, motion-page-transitions]
version: 1
---
**When**: brand led sites with few pages (studios, events, portfolios); makes navigation an experience.

**Content**: large links (32 to 64px), maybe secondary info (contact, socials, address) in small type. Not a place to cram 20 links.

**Behaviour**: the button has `aria-expanded` and `aria-controls`; open moves focus to the first link; focus is trapped inside; Escape closes and returns focus to the button; page scroll locked while open (`overflow: hidden` on html, with scrollbar gutter compensation).

**Motion**: overlay fades or wipes in 300 to 450ms; links stagger 30 to 50ms each. Under reduced motion, show instantly.

**Storelib**: the built-in menu drawer can be opened with `data-storelib-menu` from a custom header; or render the link_list in the section's own overlay.

---
id: header-mobile-menu
title: Mobile menus
category: header
summary: Phone navigation patterns (drawer, full screen, bottom bar), the menu button, touch sizes, nested items and closing behaviour.
intents: [design-header, build-section, navigation]
tags: [header, navigation, nav, mobile, hamburger, drawer, bottom-nav, phone]
components: [header, navigation]
phases: [plan, build]
priority: 5
related: [header-fullscreen-menu, component-drawer, responsive-touch]
version: 1
---
**Button**: visible label "Menu" or an icon with `aria-label="Menu"`; at least 44x44px; `aria-expanded` reflects state.

**Patterns**
- *Drawer* from the side or top: good default; 80 to 90% width, the page dimmed behind.
- *Full screen*: for few links and brand led sites.
- *Bottom bar*: for app like sites with 3 to 5 destinations used repeatedly (a community). Mind the iOS home indicator: `padding-bottom: env(safe-area-inset-bottom)`.

**Items**: 48px minimum height, 16 to 18px type, nested items as expandable groups (button with aria-expanded), not hover menus.

**Closing**: Escape, close button, tapping the backdrop, and navigating to a link. Return focus to the menu button.

**Primary action**: keep the main action (Book, Shop) visible in the bar, not only inside the menu.

**Storelib**: `data-storelib-menu="{{ settings.menu.handle }}"` opens the built-in drawer; `data-storelib-menu-from` chooses the side.

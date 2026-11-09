---
id: header-side
title: Side navigation
category: header
summary: A fixed vertical navigation on the left for portfolios and archives; widths, scrolling and phone behaviour.
intents: [design-header, build-section, navigation]
tags: [header, navigation, nav, sidebar, vertical, side-nav, fixed-left]
components: [header, navigation]
phases: [plan, build]
priority: 2
related: [style-portfolio, header-mobile-menu]
version: 1
---
**When**: portfolios, archives, galleries and documentation, where navigation is browsed constantly. Not for typical marketing sites.

**Specs**: width 200 to 280px, fixed, its own scroll if long (`overflow-y: auto; overscroll-behavior: contain`), main content offset by the same width.

**Type**: a compact list, 14 to 15px, active item marked with weight and `aria-current`.

**Phones**: becomes a top bar with a menu button; the vertical list moves into a drawer. Never keep a fixed sidebar on a phone.

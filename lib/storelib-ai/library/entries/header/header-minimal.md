---
id: header-minimal
title: Minimal header
category: header
summary: Logo, three to five links and one action; the default good header and its exact spacing.
intents: [design-header, build-section, navigation]
tags: [header, navigation, nav, minimal, simple, logo-left]
components: [header, navigation]
phases: [plan, build]
priority: 4
related: [header-mobile-menu, style-minimalism]
version: 1
---
**Shape**: logo left, links right (or centred), one primary action at the far right. Height 56 to 64px on phones, 64 to 80px on desktop.

**Links**: 3 to 5 top level items in the real menu (link_list). More than 6 means the information architecture needs work or a mega menu.

**Type**: 14 to 16px, regular or medium weight, sentence case or small caps tracked. Active page indicated by underline or weight, plus `aria-current="page"`.

**Spacing**: 24 to 32px between links; padding on each link so the hit area is at least 44px tall.

**Action**: one button (Book, Shop, Join). Cart and account as icons with accessible names if the store has them.

```html
<header class="site-header">
  <a href="/" class="logo" aria-label="Home">Studio Name</a>
  <nav aria-label="Main"><ul><li><a href="/work" aria-current="page">Work</a></li><li><a href="/about">About</a></li></ul></nav>
  <a class="btn" href="/contact">Get in touch</a>
</header>
```

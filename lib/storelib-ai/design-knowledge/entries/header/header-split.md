---
id: header-split
title: Split navigation header
category: header
summary: Links divided either side of a centred logo; balancing uneven menus and collapsing on smaller screens.
intents: [design-header, build-section, navigation]
tags: [header, navigation, nav, split, centered-logo, balanced]
components: [header, navigation]
phases: [plan, build]
priority: 2
related: [header-centered-logo, header-mobile-menu]
version: 1
---
**Shape**: half the links left, logo centred, the other half and the action right. Common for hospitality, fashion and luxury.

**Balance**: needs an even number of similar length items. With an odd number, put utility items (search, cart, account) on the right to balance.

**Implementation**: a three column grid keeps the logo truly centred regardless of side widths.

```css
.split-header { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; }
.split-header .left { justify-self: start; } .split-header .right { justify-self: end; }
```

**Collapse**: below about 960px switch to logo centre, menu button left, cart right.

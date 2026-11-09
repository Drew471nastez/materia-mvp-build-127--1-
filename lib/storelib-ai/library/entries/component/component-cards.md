---
id: component-cards
title: Cards
category: component
summary: When a card is the right container, anatomy, clickable cards done accessibly, and avoiding cards inside cards.
intents: [build-component, build-section]
tags: [card, tile, item, grid-item]
components: [card]
capabilities: []
phases: [build, review]
priority: 4
related: [anti-slop-floating-cards, color-neutrals-and-surfaces]
version: 1
---
**Use a card** when the item is a distinct object with several attributes that people compare or open: a product, a post, a plan, an event. Not for every paragraph.

**Anatomy**: media (consistent ratio), title, one or two meta lines, optional action. Visual containment by background or border, or none at all (image plus text aligned to a grid is often better).

**Whole card clickable**: put the link on the title and stretch it, so screen readers hear one link:

```css
.card { position: relative; }
.card a.title::after { content: ""; position: absolute; inset: 0; }
.card:focus-within { outline: 2px solid var(--focus); outline-offset: 2px; }
```
Secondary buttons inside need `position: relative; z-index: 1` to stay clickable.

**Grids**: equal heights by grid, not fixed heights; clamp long titles to 2 or 3 lines (`-webkit-line-clamp`). Number of columns from the content count, not always three.

**Avoid**: card inside card, shadows plus borders plus radius plus gradients on one card, icon tiles on top of every card.

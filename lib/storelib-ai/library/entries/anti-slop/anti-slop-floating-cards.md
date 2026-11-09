---
id: anti-slop-floating-cards
title: Excessive floating cards and card nesting
category: anti-slop
summary: Cards everywhere: floating stat cards around images, cards inside cards, every block on a raised surface; when cards earn their place.
intents: [review, anti-slop, redesign]
tags: [anti-slop, slop, generic, floating-cards, cards, nesting, shadows, card-in-card]
phases: [concept, build, review]
priority: 4
related: [component-cards, layout-floating]
version: 1
---
**The pattern**: small cards hovering over a hero image ("+32% growth", a fake notification), every section wrapped in a white rounded box with shadow, cards containing cards, a grid of cards for content that is just text.

**Evaluator checks**: count of absolutely positioned elements with shadows or card classes over media; nested card containers; the share of sections that are wrapped in a bordered or shadowed rounded container; floating animations (`translateY` loops).

**Fix**: remove decorative floating elements; keep one only if it carries real information. Replace text cards with plain typography on a grid. Let sections sit on the page background and separate them with space, rules or background changes. Reserve cards for distinct, clickable objects (products, posts, plans).

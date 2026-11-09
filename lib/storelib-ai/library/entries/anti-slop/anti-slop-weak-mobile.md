---
id: anti-slop-weak-mobile
title: Weak mobile
category: anti-slop
summary: Desktop layouts shrunk onto phones: no media queries, fixed widths, tiny text, side scrolling, hover only actions.
intents: [review, anti-slop, redesign]
tags: [anti-slop, slop, generic, mobile, responsive, media-queries, phone]
phases: [concept, build, review]
priority: 5
related: [responsive-mobile-first, responsive-touch]
version: 1
---
**Signals**: no `@media` or `@container` rules in a multi column layout; fixed widths over 400px; `grid-template-columns: repeat(3, 1fr)` with no smaller alternative; font sizes under 14px for body; `100vw` widths; hover reveal of actions; tap targets under 44px.

**Evaluator checks**: presence of responsive rules relative to layout complexity, fixed pixel widths, multi column grids without a fallback, tiny font sizes.

**Fix**: write phone styles as the base (responsive-mobile-first); add breakpoints for wider screens; use `minmax` and `auto-fill`; fluid type; check 320 and 375px widths for overflow.

Never excused by a concept.

---
id: motion-principles
title: Motion principles, reduced motion and performance
category: motion
summary: The rules every animation follows: purpose, durations, easing, transform and opacity only, prefers-reduced-motion, and budgets.
intents: [add-motion, build-section, animation]
tags: [motion, animation, principles, reduced-motion, performance, easing, duration]
components: [motion]
phases: [build, review]
priority: 5
related: [motion-performance, a11y-checklist]
version: 1
---
**Purpose**: motion explains (where something came from), confirms (a press), guides attention once, or sets mood at the concept's chosen stance. If it does none, remove it.

**Durations**: micro interactions 100 to 200ms; small entrances 200 to 400ms; large reveals 500 to 900ms; never over about 1.2s for anything blocking content.

**Easing**: enter with ease out (`cubic-bezier(.2,.7,.2,1)`), exit with ease in, moves with ease in out. Springs (overshoot) only for playful concepts and small elements.

**Properties**: animate `transform` and `opacity`. Avoid animating `width`, `height`, `top`, `left`, `box-shadow`, `filter: blur` in loops.

**Reduced motion is mandatory**:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; scroll-behavior: auto !important; }
}
```
Better: write motion inside `@media (prefers-reduced-motion: no-preference)` so the default is still. Content must be fully visible without animation (never start at opacity 0 without a fallback).

**Budget**: at most one looping animation in view at a time; nothing that moves while people read body text.

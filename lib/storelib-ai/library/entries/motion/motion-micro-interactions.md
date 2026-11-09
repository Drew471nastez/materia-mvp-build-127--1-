---
id: motion-micro-interactions
title: Micro interactions
category: motion
summary: Small feedback moments (add to cart, toggles, copy, like) that confirm actions quickly without becoming decoration.
intents: [add-motion, build-section, animation]
tags: [motion, animation, micro-interaction, feedback, toggle, like, add-to-cart, success]
components: [motion]
phases: [build, review]
priority: 3
related: [motion-hover, state-interactive-matrix]
version: 1
---
**Good moments**: add to cart (button morphs to a check for 1.2s, cart count bumps), copying a code (label changes to "Copied"), toggling a switch (thumb slides 150ms), submitting a form (button to spinner to check).

**Rules**: under 300ms for the core feedback; confirm with text as well as motion; announce via a status region when the result is not visible otherwise.

```css
.count[data-bump] { animation: bump .3s cubic-bezier(.34,1.56,.64,1); }
@keyframes bump { 50% { transform: scale(1.25); } }
@media (prefers-reduced-motion: reduce) { .count[data-bump] { animation: none; } }
```

**Avoid**: confetti for routine actions, sound effects, delays that make the user wait for the animation to finish before the next action.

---
id: header-animated
title: Animated headers
category: header
summary: Headers that shrink, change colour or morph the logo on scroll, with performance and restraint rules.
intents: [design-header, build-section, navigation]
tags: [header, navigation, nav, animated, motion, shrink, morph]
components: [header, navigation]
phases: [plan, build]
priority: 2
related: [header-sticky, motion-principles]
version: 1
---
**Safe animations**: shrink height from 80 to 60px, swap logo size, fade in a background, show a progress bar for long reads. Use transforms and opacity where possible; animating height causes layout work on every frame, so prefer scaling the logo with `transform` and keeping the bar height fixed.

**Scroll driven CSS** (where supported) avoids JS:

```css
@supports (animation-timeline: scroll()) {
  .progress { transform-origin: 0 50%; animation: grow linear; animation-timeline: scroll(root); }
  @keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
}
```

**Limits**: one header animation. A header that shrinks, changes colour, rotates its logo and slides is distracting. Respect reduced motion.

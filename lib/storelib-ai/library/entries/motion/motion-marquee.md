---
id: motion-marquee
title: Marquees and tickers
category: motion
summary: Infinite horizontal tickers for dates, words or real logos: seamless CSS loop, speed, pause control and reduced motion.
intents: [add-motion, build-section, animation]
tags: [motion, animation, marquee, ticker, scrolling-text, logo-strip, loop]
components: [motion]
phases: [build, review]
priority: 3
related: [industry-events-nightlife, marquee]
version: 1
---
**Content**: real information (dates, cities, class times, real client names) or a brand phrase. Not invented logos.

**Seamless loop**: duplicate the content once (mark the copy `aria-hidden="true"`) and translate the track by -50%.

```css
.marquee { overflow: clip; }
.track { display: flex; width: max-content; gap: 48px; }
@media (prefers-reduced-motion: no-preference) { .track { animation: run var(--speed, 30s) linear infinite; } }
.marquee:hover .track, .marquee:focus-within .track { animation-play-state: paused; }
@keyframes run { to { transform: translateX(-50%); } }
```

**Speed**: slow enough to read: about 40 to 80px per second. Set duration from content width.

**Controls**: content that moves for more than 5 seconds needs a way to pause (WCAG 2.2.2). Hover and focus pause plus a pause button for long marquees.

**Reduced motion**: static row, wrapping or scrollable.

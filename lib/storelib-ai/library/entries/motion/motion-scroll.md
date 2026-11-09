---
id: motion-scroll
title: Scroll driven animation
category: motion
summary: Animations tied to scroll position: CSS scroll and view timelines with fallbacks, limits, and never hijacking scroll.
intents: [add-motion, build-section, animation]
tags: [motion, animation, scroll, scroll-driven, scroll-timeline, progress, view-timeline]
components: [motion]
phases: [build, review]
priority: 3
related: [motion-parallax, motion-sticky, layout-sticky-storytelling]
version: 1
---
**Native first**: CSS `animation-timeline: view()` or `scroll()` runs off the main thread where supported. Wrap in `@supports` and give a static fallback.

```css
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .img-reveal { animation: reveal linear both; animation-timeline: view(); animation-range: entry 0% cover 40%; }
    @keyframes reveal { from { clip-path: inset(0 0 100% 0); } to { clip-path: inset(0 0 0 0); } }
  }
}
```

**JS fallback**: IntersectionObserver for enter/leave; avoid scroll event handlers that read layout every frame. If needed, use `requestAnimationFrame` and cache measurements.

**Never**: change scroll speed, snap the page against the user, or require scrolling to reveal essential text.

---
id: motion-fades-slides
title: Fades and slides on entry
category: motion
summary: Entrance animations on scroll: distances, durations, CSS view timelines (a section script cannot observe the page), and keeping content visible without them.
intents: [add-motion, build-section, animation]
tags: [motion, animation, fade, slide, entrance, reveal, scroll-reveal, fade-up]
components: [motion]
phases: [build, review]
priority: 4
related: [motion-principles, motion-stagger]
version: 2
---
**Spec**: opacity 0 to 1 plus translateY 12 to 24px; 400 to 600ms ease out; trigger when 15 to 20% of the element is visible; once only.

**Visible without JS**: hide only after the script marks the page ready.

```css
@media (prefers-reduced-motion: no-preference) {
  .js-motion [data-reveal] { opacity: 0; transform: translateY(16px); transition: opacity .5s cubic-bezier(.2,.7,.2,1), transform .5s cubic-bezier(.2,.7,.2,1); }
  .js-motion [data-reveal].in { opacity: 1; transform: none; }
}
```
In a Storelib section use the CSS view timeline instead of a script: the script runs in a sandbox on a copy of the markup and an IntersectionObserver there never fires for the real page (motion-in-storelib-runtime, example ai_scroll_reveal):
```css
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    [data-reveal] { animation: rise linear both; animation-timeline: view(); animation-range: entry 0% entry 60%; }
    @keyframes rise { from { opacity: 0; transform: translateY(16px); } }
  }
}
```

**Restraint**: reveal section headings and media, not every paragraph. Slides from the side (translateX) only where direction means something (next step, incoming panel).

---
id: motion-fades-slides
title: Fades and slides on entry
category: motion
summary: Entrance animations on scroll: distances, durations, IntersectionObserver or scroll timelines, and keeping content visible without JS.
intents: [add-motion, build-section, animation]
tags: [motion, animation, fade, slide, entrance, reveal, scroll-reveal, fade-up]
components: [motion]
phases: [build, review]
priority: 4
related: [motion-principles, motion-stagger]
version: 1
---
**Spec**: opacity 0 to 1 plus translateY 12 to 24px; 400 to 600ms ease out; trigger when 15 to 20% of the element is visible; once only.

**Visible without JS**: hide only after the script marks the page ready.

```css
@media (prefers-reduced-motion: no-preference) {
  .js-motion [data-reveal] { opacity: 0; transform: translateY(16px); transition: opacity .5s cubic-bezier(.2,.7,.2,1), transform .5s cubic-bezier(.2,.7,.2,1); }
  .js-motion [data-reveal].in { opacity: 1; transform: none; }
}
```
```js
root.classList.add('js-motion');
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .15 });
root.querySelectorAll('[data-reveal]').forEach(el => io.observe(el));
```

**Restraint**: reveal section headings and media, not every paragraph. Slides from the side (translateX) only where direction means something (next step, incoming panel).

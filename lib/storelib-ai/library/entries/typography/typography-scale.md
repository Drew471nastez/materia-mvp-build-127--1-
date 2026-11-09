---
id: typography-scale
title: Type scales and fluid sizes
category: typography
summary: Choosing a modular ratio, a limited set of sizes, fluid clamp values, and the number of sizes a page should use.
intents: [choose-fonts, build-section, fix-typography]
tags: [type-scale, font-size, clamp, fluid, hierarchy, modular-scale]
components: [typography]
phases: [plan, build, review]
priority: 5
related: [typography-pairings, anti-slop-typography-chaos]
version: 1
---
**Pick a ratio by density**: 1.2 (minor third) for dense UI and shops, 1.25 to 1.333 for most sites, 1.5 to 1.618 for type led and editorial heroes.

**Limit the sizes**: a page uses about 6 to 8 distinct font sizes total. More than 10 reads as inconsistent; the evaluator flags it.

**Example scale (1.25, base 16px)**: 12, 14, 16, 20, 25, 31, 39, 49, 61. Use 13 or 14 for captions and labels, 16 to 18 for body, then jump to display sizes.

**Fluid sizes**: interpolate between phone and desktop with `clamp()`. Keep body fixed (16 to 18px) and make headings fluid.

```css
:root {
  --step-0: 1rem;
  --step-1: clamp(1.15rem, 1.05rem + .5vw, 1.35rem);
  --step-2: clamp(1.4rem, 1.2rem + 1vw, 1.9rem);
  --step-3: clamp(1.8rem, 1.4rem + 2vw, 2.8rem);
  --step-4: clamp(2.3rem, 1.6rem + 3.5vw, 4.2rem);
  --step-5: clamp(2.8rem, 1.6rem + 6vw, 6.5rem);
}
```

**Line height** falls as size rises: body 1.5 to 1.7, subheads 1.25 to 1.35, display 0.95 to 1.1.

**Hierarchy is more than size**: use weight, case, colour and space. A label in 12px caps tracked out can outrank 16px body without being bigger.

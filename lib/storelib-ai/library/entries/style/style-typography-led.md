---
id: style-typography-led
title: Typography led
category: style
summary: Type is the image: oversized headlines, careful kerning, mixed weights and widths; few or no photos.
intents: [choose-style, build-site, redesign]
tags: [typography, type-led, typographic, big-type, lettering, type-driven]
styles: [typography-led, type-led]
phases: [concept, plan, build]
priority: 3
related: [typography-display, typography-scale, style-swiss]
version: 1
---
**When**: brands without strong photography, writers, studios, events, manifestos.

**Moves**: headlines at 10 to 20vw that run edge to edge; mixing a serif italic with a grotesk in one line; outlined or hollow type used once; numbers as giant graphic elements; text set on a path or vertically for labels.

**Specs**: display line height 0.85 to 1.0; tracking -0.02 to -0.05em at large sizes; fluid sizes with `clamp()`; `text-wrap: balance` on headings; check that the longest word fits at 320px (use `overflow-wrap: anywhere` as a fallback, or reduce size).

```css
.display { font-size: clamp(3rem, 12vw, 12rem); line-height: .9; letter-spacing: -.04em; text-wrap: balance; }
```

**Don't**: let giant type push the action below three screens on phones. Keep the call to action visible in the first view.

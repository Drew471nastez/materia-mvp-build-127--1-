---
id: anti-slop-excessive-radius
title: Excessive corner radius
category: anti-slop
summary: Everything rounded to 24px or more, pill buttons on serious brands, rounded photos; matching radius to the concept.
intents: [review, anti-slop, redesign]
tags: [anti-slop, slop, generic, radius, rounded, border-radius, rounded-3xl]
phases: [concept, build, review]
priority: 3
related: [style-luxury, style-swiss, anti-slop-pill-badges]
version: 1
---
**The pattern**: cards at 24 to 32px radius, buttons as pills, inputs as pills, images rounded, sections rounded, all at once and regardless of brand.

**Evaluator checks**: the distribution of radius values; a high share at 20px or more (or `rounded-2xl`, `rounded-3xl`) without a playful or wellness concept.

**Fix**: pick a radius system in the concept: 0 for Swiss, editorial, luxury and brutalist; 2 to 6px for most product and service sites; 8 to 16px for friendly and wellness; pills only for playful systems. Photos are usually square cornered. Nested radii follow `inner = outer - padding`.

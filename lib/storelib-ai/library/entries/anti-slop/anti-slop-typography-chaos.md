---
id: anti-slop-typography-chaos
title: Inconsistent typography
category: anti-slop
summary: Too many font families, sizes and weights, arbitrary pixel values, and headings that do not follow a scale.
intents: [review, anti-slop, redesign]
tags: [anti-slop, slop, generic, fonts, font-sizes, font-families, type-scale, typography]
phases: [concept, build, review]
priority: 4
related: [typography-scale, typography-pairings]
version: 1
---
**Signals**: more than two families (plus a mono), more than about 8 to 10 distinct font sizes on a page, sizes like 13px, 15px, 17px, 19px, 21px all used together, weights 300 to 900 all present, headings of the same level at different sizes in different sections.

**Evaluator checks**: unique `font-family` stacks (by first family), unique `font-size` values, unique `font-weight` values, compared with the concept's type system.

**Fix**: define the scale (typography-scale) and map every text style to it as tokens (`--step-0` to `--step-5`); two families; three weights. Replace near duplicates (15 and 16px) with one value. Headings at the same level look the same everywhere.

---
id: component-hero
title: Hero sections
category: component
summary: Hero types matched to purpose (immersive, editorial, split, product, statement), what belongs in the first screen and how to avoid the generic hero.
intents: [build-component, build-section]
tags: [hero, above-the-fold, first-screen, intro, banner]
components: [hero]
capabilities: []
phases: [build, review]
priority: 5
related: [hero_immersive, hero_editorial, hero_split, hero_product, anti-slop-generic-hero]
version: 1
---
**Choose by purpose**
- *Immersive*: the image is the product (venues, travel, fashion). Full bleed, short heading, one action.
- *Editorial*: type and one photograph composed as a spread. For considered brands.
- *Split*: promise one side, proof or product picture the other. For services and courses.
- *Product*: one product with price and buy, above the fold.
- *Statement*: a large typographic line, no image. For studios and writers.

**First screen must contain**: what it is, who it is for (explicit or obvious), the one action. On phones: heading, one line, the button within about 560px of height.

**Heading**: specific to the business (see core-copywriting); 3 to 10 words.

**Avoid the default**: centred eyebrow pill, two line gradient heading, grey paragraph, two buttons side by side, a screenshot floating with glow, logos strip. If your hero matches that list, pick another type.

**Media**: preload the hero image (`fetchpriority="high"`, no lazy loading), sized for the viewport with srcset.

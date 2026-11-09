---
id: component-stats
title: Stats and numbers
category: component
summary: Numbers as content: only real figures, how to set them typographically, counters, and alternatives when there are no numbers.
intents: [build-component, build-section]
tags: [stats, numbers, metrics, counters, figures, kpi]
components: [stats]
capabilities: []
phases: [build, review]
priority: 3
related: [anti-slop-fake-proof, stats]
version: 1
---
**Only real numbers**: from the store (products sold, members, sessions) or supplied by the creator. "10k+ happy customers" invented by a model is a fabricated claim.

**Setting them**: big tabular numerals in the display face, a short label underneath that says what was counted and when ("312 students since 2021"). Two to four figures, not six.

**Counters**: animate from 0 only once on entry, 800 to 1400ms, ease out; render the final value in the HTML so it is correct without JS and under reduced motion.

**No numbers**: drop the section. Replace it with something real: a short list of where the work has appeared, a single quote, the creator's credentials.

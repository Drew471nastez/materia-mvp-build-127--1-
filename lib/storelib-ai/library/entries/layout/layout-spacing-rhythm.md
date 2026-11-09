---
id: layout-spacing-rhythm
title: Spacing scales and vertical rhythm
category: layout
summary: A spacing scale, section padding by breakpoint, grouping by proximity, and avoiding both cramped and empty layouts.
intents: [build-section, layout, review, fix-spacing]
tags: [spacing, rhythm, padding, margin, whitespace, scale, gaps]
components: [section]
phases: [plan, build, review]
priority: 5
related: [anti-slop-unbalanced-spacing, responsive-breakpoints]
version: 1
---
**Scale**: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128. Use only these. Arbitrary values (13px, 37px, 22px) accumulate into visual noise; the evaluator counts them.

**Section padding**: phones 48 to 72px top and bottom, desktop 80 to 160px. Use a fluid value: `padding-block: clamp(48px, 8vw, 128px)`. Keep it consistent; vary it deliberately (a tight band, a spacious hero) rather than randomly.

**Proximity**: related items are closer than unrelated ones. Label to heading 8 to 12px, heading to body 12 to 24px, body to button 24 to 32px, between groups 48px or more.

**Containers**: one main content width (1100 to 1280px) and one text width (60 to 70ch). Not five.

**Check**: squint. Groups should read as groups. If two sections blur together, increase the gap or change the background; if the page feels empty, the content is probably too small, not the gaps too big.

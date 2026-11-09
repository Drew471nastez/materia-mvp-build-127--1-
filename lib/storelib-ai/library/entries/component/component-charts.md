---
id: component-charts
title: Charts and data display
category: component
summary: Charts only for real data: chart choice, colour, labels, accessibility, and why marketing pages rarely need them.
intents: [build-component, build-section]
tags: [chart, graph, data-viz, stats, numbers]
components: [chart]
capabilities: []
phases: [build, review]
priority: 2
related: [anti-slop-fake-proof, component-tables]
version: 1
---
**Only with real data** from the store or supplied by the creator. Decorative charts with invented trends are fabricated proof.

**Choice**: bars for comparing categories, lines for change over time, a single big number with context for one figure. Avoid pie charts with more than 3 slices, 3D, dual axes.

**Style**: direct labels instead of legends where possible, one highlight colour with the rest in neutrals, gridlines light, axis starts at zero for bars.

**Accessibility**: a text summary of the takeaway, the data available as a table, patterns or labels not colour alone, SVG with `role="img"` and an `aria-label`.

**In the app**: Recharts is a dependency of the Storelib app (dashboards). Generated site sections should render simple charts in SVG or CSS themselves.

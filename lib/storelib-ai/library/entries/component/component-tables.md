---
id: component-tables
title: Tables
category: component
summary: Real tables for real data: semantics, alignment, numeric formatting, responsive strategies and sticky headers.
intents: [build-component, build-section]
tags: [table, data-table, comparison, spec-table, schedule]
components: [table]
capabilities: []
phases: [build, review]
priority: 3
related: [typography-tracking-measure, component-pricing]
version: 1
---
**Use a table** for data with rows and columns that people compare: schedules, specs, size charts, comparisons. Not for layout.

**Semantics**: `<table>`, `<caption>`, `<thead>` with `<th scope="col">`, row headers `<th scope="row">`.

**Style**: left align text, right align numbers, tabular numerals, row separators as 1px rules, no zebra unless rows are long, padding 10 to 14px.

**Responsive**: wrap in a scroll container with a visible edge shadow and `tabindex="0"` plus an `aria-label`; or for 2 to 3 columns, stack rows into labelled blocks on phones (`data-label` attributes rendered via `::before`).

```css
.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
th, td { padding: 12px; border-bottom: 1px solid var(--border); text-align: left; }
td.num { text-align: right; }
thead th { position: sticky; top: 0; background: var(--bg); }
```

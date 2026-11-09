---
id: component-tabs
title: Tabs
category: component
summary: When tabs help (parallel content of equal weight), the ARIA tabs pattern with arrow keys, and phone alternatives.
intents: [build-component, build-section]
tags: [tabs, tablist, segmented, switcher]
components: [tabs]
capabilities: []
phases: [build, review]
priority: 3
related: [component-accordion, a11y-keyboard-focus]
version: 1
---
**Use when** content splits into 2 to 5 parallel views people switch between (monthly vs yearly, menus by meal, sizes by region). Do not hide essential content in later tabs.

**Pattern**: `role="tablist"` containing `role="tab"` buttons with `aria-selected` and `aria-controls`; panels `role="tabpanel"` with `aria-labelledby`. Left and Right arrows move between tabs, Home and End jump; only the active tab is in the tab order (`tabindex="0"`, others `-1`).

**Visual**: the active tab clearly marked (underline 2px or filled segment), inactive tabs still 4.5:1. Segmented controls fit 2 to 3 short options.

**Phones**: if labels do not fit, scroll the tab list horizontally, or switch to an accordion.

**No JS fallback**: render all panels with headings, then enhance into tabs.

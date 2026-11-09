---
id: color-accent-use
title: Using an accent colour with discipline
category: color
summary: Where an accent belongs (primary actions, focus, one signature element), how much of the page it should cover, and how to avoid accent everywhere.
intents: [choose-palette, review]
tags: [accent, brand-colour, highlight, cta-colour, 60-30-10]
phases: [plan, build, review]
priority: 4
related: [color-palettes-by-mood, anti-slop-purple-gradients]
version: 1
---
An accent works by scarcity. If everything is accented, nothing is.

**Belongs on**: the primary action, the focus ring, links in body text, the active state of navigation, one signature element per page (a date, a price highlight, a rule).

**Coverage**: roughly 60% background neutrals, 30% text and secondary surfaces, under 10% accent. A full accent band (one section with an accent background) is fine once per page as a rhythm change.

**Don't**: colour every icon, heading and border with the accent; use the accent for both success messages and primary buttons (users read colour as meaning); use a second accent for decoration.

**States**: hover darkens or lightens the accent by about 8 to 12% lightness; active by about 15%; disabled drops to a neutral, not a faded accent.

```css
.btn-primary { background: var(--accent); color: var(--accent-text); }
.btn-primary:hover { background: color-mix(in oklab, var(--accent), black 10%); }
```

---
id: style-minimalism
title: Minimalism
category: style
summary: Few elements, strict spacing and one typeface doing all the work; minimal means every element has a job, not empty space as decoration.
intents: [choose-style, build-site, redesign]
tags: [minimal, minimalism, clean, whitespace, restraint, simple]
styles: [minimalism, minimal]
phases: [concept, plan, build]
priority: 3
related: [nordic_calm, style-swiss]
version: 1
---
**What it is**: reduction with intent. The page has fewer things, and each is placed exactly.

**Specs**: one family (two weights) or two closely related; a type scale with 4 to 5 sizes; an 8px spacing scale used strictly; one accent or none; borders 1px at low contrast; radius 0 to 4px.

**Do**: let alignment create structure (a shared left edge, a baseline rhythm). Use real content density; a minimal product grid still shows name and price clearly. Make interaction states visible even if subtle (underline offset change, 1px border darkening).

**Don't**: confuse emptiness with minimalism. Huge gaps between unrelated items break grouping. Grey text at 3:1 on white fails contrast; minimal does not mean faint.

**Combines with**: editorial (minimal grid plus a serif display), luxury (minimal plus slow motion and fine photography), Swiss (minimal plus a hard grid and asymmetric type).

```css
:root { --space: 8px; --text: #111; --muted: #555; --rule: #e6e6e6; }
h1 { font-size: clamp(2rem, 4vw + 1rem, 3.5rem); font-weight: 500; letter-spacing: -0.02em; }
```

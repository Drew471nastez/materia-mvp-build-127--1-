---
id: style-brutalism
title: Brutalism
category: style
summary: Raw, honest, unpolished web: default looking elements, system or mono type, visible structure, hard contrast, deliberate roughness.
intents: [choose-style, build-site, redesign]
tags: [brutalism, brutalist, raw, system-fonts, unpolished, web-brutalism]
styles: [brutalism, brutalist]
phases: [concept, plan, build]
priority: 3
related: [style-neo-brutalism, style-industrial]
version: 1
---
**What it is**: exposing the material of the web. Underlined blue links, system fonts, visible borders, tables, plain buttons, little or no decoration.

**Specs**: system UI or monospace type; borders 1 to 2px solid black; radius 0; no shadows; backgrounds white, grey or one flat colour; hover states as inversions (black background, white text).

**Use for**: artists, independent publishers, music collectives, experimental studios, anything that wants to read as anti corporate.

**Keep it usable**: brutal is a look, not permission to fail accessibility. Contrast still passes, focus is still visible (a thick outline suits the style), tap targets still 44px, text still readable at 16px or larger.

**Don't**: mistake chaos for brutalism. The structure is plain and obvious; there is nothing random about it.

```css
a { color: #00e; text-decoration: underline; text-underline-offset: 2px; }
a:hover { background: #000; color: #fff; }
button { font: inherit; border: 2px solid #000; background: #fff; padding: 10px 16px; border-radius: 0; }
```

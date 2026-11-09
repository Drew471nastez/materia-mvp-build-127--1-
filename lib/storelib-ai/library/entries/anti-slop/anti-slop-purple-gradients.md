---
id: anti-slop-purple-gradients
title: Gradients, purple and blue defaults and glow
category: anti-slop
summary: Repeated decorative gradients, the default purple to blue palette, gradient text and glowing blobs; when they are a choice and when they are slop.
intents: [review, anti-slop, redesign]
tags: [anti-slop, slop, generic, gradient, purple, blue, indigo, violet, glow, neon, blur-blob]
phases: [concept, build, review]
priority: 5
related: [color-palettes-by-mood, color-accent-use, style-glassmorphism]
version: 1
---
**The pattern**: `linear-gradient(135deg, #6366f1, #8b5cf6)` style fills on buttons, headings and backgrounds; gradient text on the hero; blurred purple and blue blobs or radial glows behind content; box shadows tinted violet; neon on near black.

**Why it is slop**: it is the most common default colour story in generated interfaces, so it signals "made by a tool" and erases the brand.

**Evaluator checks**: count of gradient declarations; share of colours in the violet and indigo hue range (about 230 to 290 degrees) with medium to high saturation; `background-clip: text` with gradients; large blur filters and coloured glow shadows (`0 0 40px rgba(139,92,246,...)`).

**Fix**: take the palette from the brand or the concept (see color-palettes-by-mood). Replace gradient buttons with a solid accent; replace glows with nothing or a solid surface; replace gradient text with weight or size. If the concept wants a gradient, use one, made from brand colours, in one place, with purpose (a sky in a weather brand, a print overlay in a music release).

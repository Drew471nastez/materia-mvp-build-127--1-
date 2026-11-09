---
id: typography-pairings
title: Font pairings that work, by mood
category: typography
summary: Concrete display and body pairings grouped by mood, with weights and rules for when to use one family instead of two.
intents: [choose-fonts, choose-style, build-site]
tags: [fonts, pairing, typeface, serif, sans, mono, google-fonts]
components: [typography]
phases: [concept, plan]
priority: 5
related: [typography-scale, typography-loading]
version: 1
---
Use families the theme can load (the theme's offered families). Pair by contrast of structure, not by two similar sans serifs.

| Mood | Display | Body | Notes |
| --- | --- | --- | --- |
| Editorial, literary | Fraunces, Playfair Display, DM Serif Display | Inter, Source Serif 4 | serif display at 500 to 600, body 400 |
| Luxury | Cormorant Garamond, Bodoni Moda | Jost, Montserrat light labels | caps labels tracked 0.15em |
| Swiss, precise | Inter Tight, Archivo | Inter | one family, weights 400/600, tight display |
| Bold, sporty | Bebas Neue, Anton, Oswald | DM Sans, Inter | condensed display only above 40px |
| Industrial, technical | Space Grotesk, IBM Plex Sans | IBM Plex Mono for data | mono for numbers, codes, labels |
| Warm, friendly | Recoleta-like soft serif (Fraunces soft), Nunito | Nunito Sans, Karla | rounded, larger body (17 to 18px) |
| Playful | Syne, Bricolage Grotesque | Manrope | one expressive weight only |
| Brutal | system-ui, Courier Prime, Space Mono | same family | default looking on purpose |

**One family is often better**: a variable grotesk with weight and width range covers display and text and loads faster.

**Rules**: at most two families plus an optional mono. Body face must have regular, italic and bold. Check the display face at the longest real heading and at 320px wide. Do not use a script or decorative face for anything people must read in full.

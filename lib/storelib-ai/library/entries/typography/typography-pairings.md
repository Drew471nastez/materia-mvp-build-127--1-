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
related: [typography-type-library, typography-scale, typography-loading]
version: 2
---
Use families the theme can load (the Typography list; typography-type-library has complete systems). Pair by contrast of structure, not by two similar sans serifs. The display face is never a default (Inter, Roboto, Poppins, Montserrat, Open Sans, Lato, system-ui) unless the creator asked for it.

| Mood | Display | Body | Notes |
| --- | --- | --- | --- |
| Editorial, literary (only when asked for) | Instrument Serif italic, Fraunces, Playfair Display, DM Serif Display | Instrument Sans, Source Serif 4 | serif display at 400 to 600, body 400 |
| Luxury | Cormorant Garamond, Bodoni Moda, Italiana | Jost | caps labels tracked 0.15em to 0.22em |
| Swiss, precise | Inter Tight, Archivo | Inter Tight, Work Sans | one family, weights 400/600, tracking -0.04em on display |
| Bold, sporty | Anton, Barlow Condensed, Bebas Neue, League Gothic | Archivo, IBM Plex Sans | condensed display only above 40px |
| Industrial, technical | Space Grotesk, JetBrains Mono | IBM Plex Sans, IBM Plex Mono for data | mono for numbers, codes, labels |
| Warm, friendly | Fraunces soft, Young Serif, Fredoka | Karla, Nunito Sans, Libre Franklin | larger body (17 to 18px) |
| Playful, art school | Syne, Bricolage Grotesque, Unbounded | Familjen Grotesk, Hanken Grotesk, Work Sans | one expressive weight only |
| Brutal, zine | Space Mono, JetBrains Mono | the same family | default looking on purpose, but a chosen mono |
| Clear, accessible | Literata | Atkinson Hyperlegible, Lexend | services and non-profits |

**One family is often better**: a variable grotesk with a weight range covers display and text and loads faster.

**Rules**: at most two families plus an optional mono. Body face must have regular and bold. Check the display face at the longest real heading and at 320px wide. Do not use a script or decorative face for anything people must read in full.

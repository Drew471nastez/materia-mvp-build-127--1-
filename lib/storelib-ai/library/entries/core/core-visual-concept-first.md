---
id: core-visual-concept-first
title: Decide a visual concept before generating
category: core
summary: Every site starts from a filled visual concept (name, mood, type, palette, layout, motion, imagery, signature moves) so choices have a reason and two similar businesses look different.
intents: [build-site, plan-site, choose-style, redesign]
tags: [concept, art-direction, diversity, mood, direction]
phases: [concept, plan]
priority: 5
related: [style-combining, core-diversity, anti-slop-relative-judgement]
version: 1
---
A concept is a short art direction, written before any markup. The schema lives in `lib/storelib-ai/library/concept.ts`; fill every field.

- **Name**: two to four words that describe the idea, not the business. "Chalk and Iron", "Morning Pages", "Velvet Night Shift". If the name could be any site's, it is not a concept.
- **Mood**: three adjectives that pull in different directions (calm, exact, warm), not three synonyms.
- **Type system**: display face, body face, scale ratio, and one rule about case or tracking.
- **Palette**: background, text, one accent and where the accent is allowed to appear.
- **Layout principles**: two or three rules, e.g. "everything hangs from a 12 column grid with a wide left margin", "images bleed off the right edge".
- **Motion stance**: none, subtle, expressive or cinematic, plus what moves.
- **Imagery**: subject, light, crop, colour treatment, and what to avoid.
- **Signature moves**: one to three things a visitor would remember. A giant outlined numeral, a ticker of class times, captions set like museum labels.

Use the concept to judge every later choice: if a component does not serve one of the principles, change it. The anti-slop evaluator reads the concept, so a declared glassmorphism concept is not penalised for blur, while a quiet editorial one is.

---
id: anti-slop-unnecessary-animation
title: Unnecessary animation
category: anti-slop
summary: Everything fading, floating, pulsing or bouncing; infinite loops; animations without reduced motion; how much motion the concept allows.
intents: [review, anti-slop, redesign]
tags: [anti-slop, slop, generic, animation, motion, overanimation, reduced-motion, infinite]
phases: [concept, build, review]
priority: 4
related: [motion-principles, a11y-motion-media]
version: 1
---
**Signals**: infinite animations on decorative elements (floating cards, pulsing buttons, rotating badges), entrance animations on every element, long durations over 1s for UI, animated gradients, missing `prefers-reduced-motion` handling.

**Evaluator checks**: number of `@keyframes` and infinite animations, number of elements with transitions or reveal attributes, durations, and whether a reduced motion query exists. Compared against the concept's motion stance (none, subtle, expressive, cinematic).

**Fix**: keep motion that explains or confirms; keep at most one ambient loop and only if the concept is expressive or cinematic; shorten UI transitions to under 300ms; add reduced motion handling. Missing reduced motion support is never excused by a concept.

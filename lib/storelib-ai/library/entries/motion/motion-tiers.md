---
id: motion-tiers
title: The site's motion feel: quiet, balanced, expressive
category: motion
summary: One site-level motion tier stored as Theme settings › Animations › Motion feel, printed as --t-motion-* variables every AI component reads; what each tier allows and how reduced motion stills it.
intents: [add-motion, animation, build-section, build-site, choose-style]
tags: [motion, motion tier, motion feel, quiet, balanced, expressive, duration, easing, stagger, reduced-motion, tokens, variables, t-motion]
components: [motion]
phases: [concept, plan, build, review]
priority: 5
related: [motion-principles, motion-recipes, motion-in-storelib-runtime, component-interactive-library]
version: 1
---
**One feel per site**, chosen for the business and stored as the Theme setting `motion_tier` (set it with set_tokens `motion.tier`; the creator changes it in Theme settings › Animations › Motion feel). The page root prints it as variables, so a component never hard codes a timing:

| Variable | Quiet | Balanced | Expressive |
| --- | --- | --- | --- |
| `--t-motion-duration` (entrances) | 450ms | 650ms | 850ms |
| `--t-motion-distance` (reveal travel) | 12px | 24px | 36px |
| `--t-motion-stagger` | 40ms | 65ms | 90ms |
| `--t-motion-hover` (hover, press) | 160ms | 200ms | 240ms |
| `--t-motion-lift` | 2px | 4px | 6px |
| `--t-motion-scale` (image settle from) | 1.03 | 1.06 | 1.1 |
| `--t-motion-parallax` | 3% | 6% | 10% |

Plus `--t-motion-ease` (entrances: ease out with a decisive settle) and `--t-motion-ease-ui` (hover and press: quick, not rubbery), and `--t-motion-on` (1, or 0).

**What each tier is for**: quiet for professional services, wellness, local businesses and reading-heavy sites (soft fades, crisp hover and focus, no pinned or scrubbed sequences). Balanced for coaches, creators, shops and studios (a headline reveal, staggered entrances, at most one scroll-linked showcase per page). Expressive for photographers, artists, music, film and launches (masked reveals, image curtains, a sticky story or a sideways gallery, up to two showcases per page). The creator's own words win: "no animations" is quiet, "lots of motion" expressive.

**Reduced motion is global**: for a visitor whose device asks for less motion (and slow-refresh screens), the page's stylesheet sets every moving variable to zero with !important, so a component written with them stands still even if it forgot its own media query. Still write the still state as the default and add motion inside `@media (prefers-reduced-motion: no-preference)`.

**Usage**: `transition: transform var(--t-motion-hover, 200ms) var(--t-motion-ease-ui, ease-out);` and `@keyframes rise { from { opacity: 0; transform: translateY(calc(var(--t-motion-distance, 24px) * var(--m-k, 1))); } }`, where `--m-k` is the section's own Strength setting.

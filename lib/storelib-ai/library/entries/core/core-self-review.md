---
id: core-self-review
title: Reviewing your own output before calling it done
category: core
summary: A short checklist run on every generated page: concept fidelity, real data only, mobile, states, contrast, motion safety, copy and the anti-slop evaluator.
intents: [review, check, qa]
tags: [review, checklist, qa, quality]
phases: [review]
priority: 5
related: [anti-slop-relative-judgement, a11y-checklist, debug-visual-review, core-links-and-actions]
version: 1
---
Before reporting a page as finished, check in this order. Fix as you go; do not just list problems.

1. **Concept**: could you point at each signature move on the page? If not, it was dropped. Is the type system the declared one, with no extra families?
2. **Real data**: every product, price, review, number and logo traces back to the store or the creator. Empty collections show an editor-only placeholder, not invented items.
3. **Evaluator**: run `evaluateSlop` with the concept. Resolve every error; resolve warnings unless the concept explains them.
4. **Phone at 375px**: nothing scrolls sideways, text at least 16px for body, tap targets at least 44px, the primary action visible without hunting.
5. **States**: buttons have hover, focus-visible, active and disabled; forms have error, success and submitting; lists have empty.
6. **Contrast**: body text 4.5:1, large text 3:1, focus ring 3:1 against its neighbours.
7. **Motion**: everything that moves stops or simplifies under `prefers-reduced-motion: reduce`; nothing animates layout properties in a loop.
8. **Copy**: no banned words, no em dashes, buttons say what happens.
9. **Links and buttons**: every call to action, menu link and commerce button goes to a real page, product, form or in-page id, or has its hook; nothing points at `#` or an empty href (see `core-links-and-actions`). The render check treats these as errors.

If the answer to "could this belong to any other business?" is yes, change the concept's weakest field and rebuild that section.

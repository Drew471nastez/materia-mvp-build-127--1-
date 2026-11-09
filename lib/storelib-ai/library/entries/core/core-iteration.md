---
id: core-iteration
title: Follow up edits without breaking the concept
category: core
summary: How to apply a creator's change request with the smallest edit, keep the concept and editable settings intact, and say what changed.
intents: [edit, iterate, follow-up, change-section]
tags: [iteration, edit, minimal, follow-up, change]
phases: [build, repair]
priority: 4
related: [core-agent-loop, core-self-review]
version: 1
---
After the first build, most work is follow ups: "make the hero darker", "I hate the font", "add my booking form".

- **Classify the change**: content (a setting), style (scheme, token, font), structure (add, remove, reorder a section), or behaviour (a form, a cart, motion). Content goes to settings, never into code.
- **Change the smallest scope that satisfies it.** "Darker hero" changes that section's scheme or overlay, not the site palette. "I hate the font" is a site level type change: update the concept's type system and the theme setting, then check every display size still fits.
- **Keep editable props editable.** A custom component's manifest must keep every prop it had unless the request removes that content. Do not inline a prop's value into the source.
- **Re-run the checks that the change can affect**: a colour change runs contrast; a layout change runs the phone check; new copy runs the word check.
- **Say what changed in one or two plain sentences** and what you did not touch. "Hero background is now the dark scheme, the overlay is 40%. Other sections are unchanged."

If a request contradicts the concept ("make it playful" on a luxury site), it wins: update the concept so later edits follow the new direction instead of drifting back.

---
id: layout-conversion-copy
title: Conversion and copy are part of the layout
category: layout
summary: Name the primary action first and wire it to a real Storelib destination; never a dead button or an invented booking system; copy that is concrete and honest instead of marketing fog.
intents: [plan-site, build-section, write-copy, build-site]
tags: [conversion, cta, primary action, booking, checkout, copy, copywriting, honest data, placeholders, buttons, fog words]
capabilities: [products, checkout, bookings, forms]
phases: [plan, build, review]
priority: 5
related: [layout-site-stories, core-copywriting, core-links-and-actions, storelib-honest-data]
version: 1
---
**Conversion** (before any layout):
- Name the primary action before laying anything out (book, buy, enquire, join, listen) and give it one clear home in the first screen and one at the end.
- Every button goes somewhere real: a Storelib booking form, a product's checkout_url, a collection, a page you made, a form. Never href="#", never a button that only looks clickable.
- Wire Storelib's own features rather than inventing a substitute: products and digital checkout, communities and memberships, forms and bookings, the subscribe form.
- Do not create or publish paid products, take payments or promise an integration that does not exist; where a fact is missing, leave the part out or give the creator a switch to turn it on.

**Copy**:
- Short, concrete sentences about the actual offer and point of view: "Training built around the hours you actually have", not "Unleash your best self".
- No fog: unlock, elevate, transform, seamless, journey, next level, tailored solutions.
- No invented numbers, reviews, clients or credentials. Missing information means a section that does not need it, or an honest editable state the creator sees only in the editor.
- Write for this business's visitor: what they get, when, where, for how much, and what happens after they click.

A visible instruction to the creator ("Add your photo here", "Your class times go here") is never part of the site's copy. Where a fact is missing, the section is left out, or its empty state is drawn only in the editor (`{% if page.in_editor %}`) and labelled so the creator knows what to add.

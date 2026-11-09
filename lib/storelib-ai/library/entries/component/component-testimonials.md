---
id: component-testimonials
title: Testimonials and quotes
category: component
summary: Presenting quotes the creator supplied: attribution, layout options beyond the carousel, and what to do when there are none.
intents: [build-component, build-section]
tags: [testimonials, quotes, client-quotes, social-proof]
components: [testimonials, quote]
capabilities: []
phases: [build, review]
priority: 4
related: [anti-slop-fake-proof, testimonials]
version: 1
---
**Source**: quotes the creator supplied as blocks. Each has real attribution (name, and role or context like "Client since 2022" if given). The AI never writes testimonial text or names.

**Layouts**
- One large quote set in the display face, attribution below. Strong when there is one great quote.
- Two or three quotes in a row of plain text blocks (no cards needed) separated by rules.
- A quote paired with a photo of the person (if supplied).
- Many short quotes as a slow marquee only if there are at least 8 real ones.

**Copy**: keep the quote specific; trim with an ellipsis rather than rewriting the person's words.

**None yet**: leave the section out of the generated site, or include it with editor only guidance ("Add a quote from a client"); never sample quotes visible to visitors.

**Markup**: `<figure><blockquote>...</blockquote><figcaption>Name, context</figcaption></figure>`.

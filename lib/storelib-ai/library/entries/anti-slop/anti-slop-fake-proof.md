---
id: anti-slop-fake-proof
title: Fabricated testimonials and metrics
category: anti-slop
summary: Invented quotes, names, ratings, counts and logos: how to spot them in generated output and what to show instead.
intents: [review, anti-slop, redesign]
tags: [anti-slop, slop, generic, fake-proof, testimonials, metrics, stats, logos, reviews]
phases: [concept, build, review]
priority: 5
related: [storelib-honest-data, component-testimonials, component-stats]
version: 1
---
**Signals the evaluator looks for**: round marketing numbers ("10,000+", "500+ clients", "98% satisfaction", "4.9/5") not present in store data; testimonial blocks with generic names (Sarah J., John D., Emily R.) and job titles; "Trusted by" or "As seen in" followed by logos or brand names; star ratings without a review source; "Join thousands of"; placeholder avatars.

**Why it matters**: it is false information on a real business's site, and visitors can tell. It also creates legal risk for the creator.

**Fix**
- Remove numbers not supplied by the store or creator.
- Remove testimonials the creator did not provide; keep the section as an editor only prompt.
- Replace logo strips with real collaborations or nothing.
- Use proof that exists: the creator's own work, a real quote, real product details, years active if the creator said so.

Never excused by a concept.

---
id: storelib-honest-data
title: Never fake data on a Storelib site
category: storelib
summary: Everything factual (products, prices, stock, reviews, numbers, logos, dates, availability, members) comes from the store or the creator; what to do when it does not exist.
intents: [build-site, generate-page, review, write-copy]
tags: [honesty, real-data, fake-data, placeholder, empty-state, proof, prices]
phases: [plan, build, review]
priority: 5
related: [anti-slop-fake-proof, state-async, store-binding]
version: 1
---
**Rule**: the agent never invents a fact a visitor could rely on. That includes product names, prices, compare at prices, stock and "only N left", ratings and review counts, testimonials and their names, customer or press logos, follower or member counts, years in business, certifications, event dates and seats, booking availability, discount codes, and delivery promises.

**Where facts come from**
- Products, prices, variants, availability, checkout links: the store (product, collection and product_list settings; never typed).
- Communities, published forms and booking forms, blog posts: the site's capabilities (lib/website-builder/ai-site/capabilities.ts).
- Quotes, credentials, press: only what the creator wrote in the brief or their profile.

**When something is missing**
1. Leave the section out of the generated page, or
2. Include it with an editor only prompt inside `{% if page.in_editor %}` so the creator can fill it, and nothing is shown to visitors.

**Copy that implies facts** is also data: "Our bestselling pack", "Loved by thousands", "Award winning". Remove it unless true.

The fill step checks prices and numbers against what the store allows (`allowedFacts`); generated sections that type products by hand are refused at save.

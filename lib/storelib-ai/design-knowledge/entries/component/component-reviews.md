---
id: component-reviews
title: Reviews and ratings
category: component
summary: Showing real reviews from the store: rating summary, review list, verification, empty state, and never fabricating.
intents: [build-component, build-section]
tags: [reviews, ratings, stars, product-reviews, social-proof]
components: [reviews, ratings]
capabilities: [products]
phases: [build, review]
priority: 4
related: [anti-slop-fake-proof, component-testimonials]
version: 1
---
**Only real reviews.** Read them from the store. If there are none, show nothing (or an editor only placeholder), never a placeholder with stars.

**Summary**: average to one decimal with the count ("4.7 from 23 reviews"); a distribution bar chart only with 10 or more reviews.

**Stars**: rendered from the real value; accessible text "Rated 4.7 out of 5"; star icons `aria-hidden`.

**List**: name or initials as given, date, rating, text, verified purchase mark if the data provides it. Show 3 to 5, then "Show more".

**Sorting**: most recent and most helpful if the data supports it; never filter to only 5 star reviews by default.

**Schema**: product rich results only with real aggregate ratings.

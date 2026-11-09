---
id: state-async
title: Empty, loading, error and processing states for data
category: state
summary: The states of anything that loads or lists data (products, posts, bookings): empty for visitors vs editors, skeletons, partial failure and retry.
intents: [build-component, fix-states, review]
tags: [empty-state, loading, error, processing, skeleton, retry, no-results]
components: [product-grid, list, search, booking]
phases: [build, review]
priority: 4
related: [component-loading, storelib-honest-data]
version: 1
---
**Empty**
- *For visitors*: if a section has nothing real to show (no products in the collection, no posts), hide the section. Do not show "Coming soon" filler unless the creator wrote it.
- *For editors*: show a short instruction inside `{% if page.in_editor %}` ("Your published products appear here").
- *No results* (search, filters): say what was searched, offer to clear filters, link to the full list.

**Loading**: skeletons that match the final layout for lists; a spinner inside the control for actions.

**Error**: say what failed in plain words, keep what did load, offer Retry. "We could not load the timetable. Try again." Do not show raw error codes to visitors.

**Processing**: long operations (payments, bookings) show a clear in progress state and prevent duplicate actions; never claim success before the server confirms.

**Partial**: a booking slot that was taken meanwhile: explain and show the next available, rather than a generic failure.

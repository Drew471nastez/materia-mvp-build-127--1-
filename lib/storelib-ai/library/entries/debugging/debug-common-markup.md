---
id: debug-common-markup
title: Common markup mistakes in generated code
category: debugging
summary: Invalid nesting, divs as buttons, missing alt and labels, duplicate ids, links without href: quick detection and fixes.
intents: [debug, repair, fix]
tags: [debugging, bug, markup, html, invalid, nesting, semantics]
phases: [repair, review]
priority: 4
related: [a11y-semantics, debug-section-scripts]
version: 1
---
- **Interactive inside interactive**: a button inside a link, a link inside a link. Pick one element; stretch the link for whole card clicks.
- **Block inside inline**: a `div` inside a `p` (the browser closes the paragraph early and styles break). Use `span` or restructure.
- **Clickable divs**: replace with `button` or `a`.
- **Links without href** (`<a onclick>`): use a button, or give the link a real URL.
- **Images without alt**: add meaningful or empty alt.
- **Inputs without labels**: add a label with `for`.
- **Duplicate ids** (a section placed twice): build ids from `{{ section.id }}`.
- **Heading levels by size**: fix the level, restyle with a class.
- **Lists without list elements**: wrap in `ul` or `ol`.
- **Empty headings or buttons** from missing settings: wrap in `{% if %}`.

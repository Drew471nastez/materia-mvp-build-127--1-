---
id: debug-common-markup
title: Common markup mistakes in generated code
category: debugging
summary: Invalid nesting, divs as buttons, missing alt and labels, duplicate ids, links without href: quick detection and fixes.
intents: [debug, repair, fix]
tags: [debugging, bug, markup, html, invalid, nesting, semantics]
phases: [repair, review]
priority: 4
related: [a11y-semantics, debug-section-scripts, core-links-and-actions]
version: 1
---
- **Interactive inside interactive**: a button inside a link, a link inside a link. Pick one element; stretch the link for whole card clicks.
- **Block inside inline**: a `div` inside a `p` (the browser closes the paragraph early and styles break). Use `span` or restructure.
- **Clickable divs**: replace with `button` or `a`.
- **Links without href** (`<a onclick>`, `href="#"`, `href=""`): use a button with a hook, or give the link a real URL. For a call to action, a menu link or a commerce link the render check makes this an error (`core-links-and-actions`).
- **Buttons with nothing behind them**: a `<button>` with no hook, no form and no script does nothing; the check reports `render.dead_button`.
- **Images without alt**: add meaningful or empty alt.
- **Inputs without labels**: add a label with `for`.
- **Duplicate ids** (a section placed twice): build ids from `{{ section.id }}`.
- **Heading levels by size**: fix the level, restyle with a class.
- **Lists without list elements**: wrap in `ul` or `ol`.
- **Empty headings or buttons** from missing settings: wrap in `{% if %}`.

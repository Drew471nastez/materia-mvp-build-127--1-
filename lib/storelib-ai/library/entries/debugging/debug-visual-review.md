---
id: debug-visual-review
title: Visual review of generated pages
category: debugging
summary: A fast routine for checking generated output in a real browser at several widths and what to look for at each.
intents: [debug, repair, fix]
tags: [debugging, bug, visual-review, screenshot, qa, check]
phases: [repair, review]
priority: 4
related: [core-self-review, debug-horizontal-overflow]
version: 1
---
**Widths**: 375 (phone), 768 (tablet), 1280 (laptop), 1440+ (desktop). Also 320 for the worst case.

**At each width look for**: horizontal scroll (scroll the page sideways), text overlapping images, buttons wrapping into two lines, images cropped badly (faces cut), empty boxes where images failed, giant gaps, sections touching with no space, sticky elements covering content.

**Interact**: tab through the page (focus visible, order logical), open menus and dialogs, submit a form with errors, toggle reduced motion in devtools rendering settings, try dark sections for contrast.

**Measure, do not guess**: use the browser to compute contrast and element sizes; the repo's `scripts/check-*.mjs` pattern renders markup in headless Chromium and measures geometry.

Report findings as the measured value and the fix, then re-check after fixing.

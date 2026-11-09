---
id: a11y-semantics
title: Semantic HTML before ARIA
category: accessibility
summary: Using native elements for structure and controls, the few ARIA attributes generated code actually needs, and common misuse.
intents: [build-component, fix-accessibility]
tags: [semantics, html, aria, landmarks, native-elements]
phases: [build, repair]
priority: 4
related: [a11y-checklist, debug-common-markup]
version: 1
---
**Native elements first**: `button`, `a`, `details/summary`, `dialog`, `input type=...`, `select`, `table`, `ul/ol`, `figure/figcaption`, `blockquote`, `time`, `nav`, `main`. They come with keyboard support and roles.

**ARIA you will actually use**: `aria-label` (icon buttons), `aria-labelledby` and `aria-describedby`, `aria-expanded` and `aria-controls` (disclosures), `aria-current="page"`, `aria-pressed` (toggles), `aria-invalid`, `aria-live` / `role="status"`, `aria-hidden="true"` (decorative duplicates), `aria-busy`.

**Common misuse**
- `role="button"` on a div instead of a button.
- `aria-label` on a div or span with no role (ignored).
- `aria-hidden="true"` on focusable elements (creates ghosts).
- `role="menu"` for site navigation.
- Headings chosen for size (an `h4` because it looks small). Style the right level instead.
- Lists of links without a list element.

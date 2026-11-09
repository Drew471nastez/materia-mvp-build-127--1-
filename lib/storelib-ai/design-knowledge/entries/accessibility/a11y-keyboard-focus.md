---
id: a11y-keyboard-focus
title: Keyboard use and focus management
category: accessibility
summary: Tab order, focus-visible styles, managing focus for overlays and dynamic content, roving tabindex and skip links.
intents: [fix-accessibility, build-component]
tags: [keyboard, focus, tab-order, focus-trap, skip-link, focus-visible]
components: [dialog, drawer, menu, tabs]
phases: [build, review]
priority: 4
related: [a11y-checklist, component-dialog, state-interactive-matrix]
version: 1
---
- **Order**: DOM order is tab order. Do not use positive `tabindex`. Visual reordering (CSS order, grid placement) must not scramble it.
- **Focus style**: `:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }`. On dark sections, the focus colour must still be 3:1.
- **Skip link**: first focusable element, visible on focus: `<a class="skip" href="#main">Skip to content</a>`.
- **Overlays**: on open, move focus inside; trap it (native dialog does this); on close, return focus to the trigger. Use `inert` on the background.
- **Dynamic content**: after an action that replaces content (form success, filter results), move focus to the new heading or announce it.
- **Composite widgets** (tabs, toolbars, radio like pickers): one tab stop for the group, arrow keys within (roving tabindex).
- **Custom controls**: Space and Enter activate buttons; Escape closes; never require a mouse for drag only interactions without an alternative.

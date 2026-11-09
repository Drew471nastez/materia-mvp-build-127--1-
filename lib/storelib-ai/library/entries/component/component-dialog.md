---
id: component-dialog
title: Dialogs and modals
category: component
summary: Native dialog element usage, focus management, sizes, when not to use a modal, and newsletter popup rules.
intents: [build-component, build-section]
tags: [dialog, modal, popup, lightbox, confirm]
components: [dialog, modal]
capabilities: []
phases: [build, review]
priority: 4
related: [component-drawer, a11y-keyboard-focus]
version: 1
---
**Prefer the native element**: `<dialog>` with `showModal()` gives focus trapping, Escape to close, and an inert background for free.

```html
<dialog id="size-guide-{{ section.id }}" aria-labelledby="sg-title-{{ section.id }}">
  <h2 id="sg-title-{{ section.id }}">Size guide</h2>
  ...
  <form method="dialog"><button>Close</button></form>
</dialog>
```
```css
dialog { border: 0; border-radius: 12px; padding: 24px; width: min(560px, calc(100vw - 32px)); max-height: calc(100svh - 32px); }
dialog::backdrop { background: rgb(0 0 0 / .5); }
```

**Focus**: the opening button gets focus back on close. Initial focus on the first meaningful control (or the dialog heading for long content).

**When not to**: do not use modals for content that deserves a page, for multi step flows, or as an interruption on page load. A newsletter popup, if the creator wants one, waits for real engagement (scroll 50% or 30 seconds), shows once per session, and closes easily.

**Phones**: large dialogs become bottom sheets or full screen.

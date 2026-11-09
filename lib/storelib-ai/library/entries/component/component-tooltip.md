---
id: component-tooltip
title: Tooltips and popovers
category: component
summary: Tooltips for short labels only, popovers for richer content, touch alternatives and the anchor positioning cautions.
intents: [build-component, build-section]
tags: [tooltip, popover, hint, info]
components: [tooltip, popover]
capabilities: []
phases: [build, review]
priority: 2
related: [a11y-keyboard-focus]
version: 1
---
**Tooltip**: a short text label for an icon button or an abbreviation. Shows on hover and on keyboard focus, hides on Escape, does not contain links or buttons. Reference it with `aria-describedby` (or use it as the accessible name with `aria-labelledby` for icon only buttons).

**Popover**: richer content (a size note, a definition) opened by click. The native `popover` attribute with `popovertarget` handles light dismiss and top layer.

```html
<button popovertarget="fit-{{ section.id }}">Fit notes</button>
<div id="fit-{{ section.id }}" popover>Cut for a relaxed fit. Take your usual size.</div>
```

**Touch**: hover does not exist; never put essential information only in a tooltip.

**Delay**: 300 to 500ms before showing a tooltip on hover, none on focus. Keep tooltips under about 80 characters.

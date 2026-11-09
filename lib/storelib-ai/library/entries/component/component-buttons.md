---
id: component-buttons
title: Buttons
category: component
summary: Button hierarchy, sizes, every state with CSS, icon buttons, and when a link is the right element.
intents: [build-component, build-section]
tags: [button, cta, action, link-button]
components: [button, cta]
capabilities: []
phases: [build, review]
priority: 5
related: [state-interactive-matrix, color-accent-use]
version: 1
---
**Element**: `<button>` for actions on the page, `<a href>` for navigation. Never a div with a click handler.

**Hierarchy**: one primary (filled) per view, secondary (outline or tonal), tertiary (text with underline). Destructive actions get their own style, not the accent.

**Sizes**: height 40 to 48px desktop, at least 44px on touch; horizontal padding 16 to 24px; text 15 to 16px medium. Radius follows the concept (0 to 10px typically; pills only when the concept uses them throughout).

**States**
```css
.btn { background: var(--accent); color: var(--accent-text); border: 0; border-radius: var(--radius-btn, 6px); padding: 12px 20px; font: 500 1rem/1.2 var(--font-body); cursor: pointer; transition: background-color .15s, transform .1s; }
.btn:hover { background: color-mix(in oklab, var(--accent), black 10%); }
.btn:active { transform: translateY(1px); }
.btn:focus-visible { outline: 2px solid var(--focus, currentColor); outline-offset: 3px; }
.btn:disabled, .btn[aria-disabled="true"] { background: var(--muted-bg); color: var(--muted); cursor: not-allowed; transform: none; }
.btn[data-loading="true"] { color: transparent; position: relative; pointer-events: none; }
@media (prefers-reduced-motion: reduce) { .btn { transition: none; } }
```

**Loading**: keep the width (no jump), show a spinner or the label "Saving", set `aria-busy="true"`.

**Copy**: verb plus object ("Book a session"). No "Click here", no "Learn more" five times on a page.

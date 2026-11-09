---
id: state-interactive-matrix
title: The interactive state matrix
category: state
summary: Every state an interactive element needs (default, hover, active, focus-visible, disabled, loading, selected, expanded, collapsed) with how each should look and be announced.
intents: [build-component, review, fix-states]
tags: [states, hover, focus, active, disabled, selected, expanded, collapsed, pressed]
components: [button, link, tabs, accordion, card, input]
phases: [build, review]
priority: 5
related: [component-buttons, a11y-keyboard-focus]
version: 1
---
| State | Visual | Semantics |
| --- | --- | --- |
| Default | clear affordance (looks clickable) | real element |
| Hover | small change: colour 8 to 12%, underline, border | none (pointer only, guard with `@media (hover: hover)`) |
| Active / pressed | darker or 1px shift, immediate | `aria-pressed` for toggles |
| Focus visible | 2px outline, 2 to 4px offset, 3:1 contrast | `:focus-visible`, never `outline: none` without a replacement |
| Disabled | muted, no hover, `cursor: not-allowed` | `disabled` or `aria-disabled="true"` (keeps it focusable for explanation) |
| Loading / processing | spinner or label change, fixed width | `aria-busy="true"`, live status text |
| Selected | filled or marked, not colour only | `aria-selected` or `aria-current` |
| Expanded / collapsed | icon rotates or changes | `aria-expanded` on the control |
| Success | check plus text | status message |
| Error | icon plus text plus colour | `aria-invalid`, message linked by `aria-describedby` |

**Rules**: hover must never be the only way to reveal content or actions (touch has no hover). Focus and hover can share a style but focus must be at least as visible. Every state change that happens without a page load and matters to the user is announced.

```css
@media (hover: hover) { .link:hover { text-decoration-thickness: 2px; } }
.link:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; border-radius: 2px; }
```

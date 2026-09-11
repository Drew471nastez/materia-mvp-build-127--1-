# Scripting API

> Status: the compile-time check, the wrapping and the capability list exist (`storelib/script.ts`). The `storelib.*` runtime and the sandbox that runs the bundle are Phase D; until then scripts are validated and stored, not executed.

A section's `<script>` runs behaviour for that section: open a menu, advance a
slider, submit a form. It runs inside the section, sees only the section, and
reaches anything outside it through `storelib.*`, where the reach can be
logged, limited and revoked.

```js
const buttons = root.querySelectorAll("[data-slide]")
let current = 0
function show(i) {
  current = (i + buttons.length) % buttons.length
  root.querySelectorAll(".slide").forEach((el, j) => el.toggleAttribute("hidden", j !== current))
}
root.querySelector("[data-next]")?.addEventListener("click", () => show(current + 1))
root.querySelector("[data-prev]")?.addEventListener("click", () => show(current - 1))
show(0)
```

## What a script receives

The bundle is wrapped as

```js
"use strict";
(function (root, settings, blocks, theme, page, storelib) { … })
```

| Name | What it is |
| --- | --- |
| `root` | The section's root element. Query inside it; it is the whole DOM the script has. |
| `settings`, `blocks`, `theme`, `page` | The same resolved data the template rendered from, as plain objects. |
| `storelib` | The API surface. What is on it depends on `capabilities`. |

## What a script cannot reach

These names are refused at compile time, each with the file line: `window`,
`document`, `globalThis`, `self`, `top`, `parent`, `frames`, `opener`, `eval`,
`Function`, `import`, `require`, `WebAssembly`, `fetch`, `XMLHttpRequest`,
`WebSocket`, `EventSource`, `navigator`, `sendBeacon`, `localStorage`,
`sessionStorage`, `indexedDB`, `cookie`, `location`, `history`,
`postMessage`, `Worker`, `SharedWorker`, `ServiceWorker`, and the timers
unless declared.

The check skips strings, comments and member access, so `"window"` in a string
and `obj.window` are fine; only the bare identifier is refused. The message
says where to go instead: "A section does not get the network; declare a
capability and use storelib.*."

## Capabilities

Declared in the schema, granted per section, visible in the editor:

```json
"capabilities": ["navigation", "analytics", "timers"]
```

| Capability | Grants |
| --- | --- |
| `navigation` | `storelib.navigate(path)`: go to a page of this site. |
| `commerce` | `storelib.cart.add(variantId, qty)`, `storelib.cart.get()`. |
| `analytics` | `storelib.analytics.track(event, props)`. |
| `forms` | `storelib.forms.submit(name, fields)`: a form endpoint on this site. |
| `timers` | The names `setTimeout`, `setInterval`, `requestAnimationFrame`, `queueMicrotask`. |

An unknown capability is refused: "… is not a capability. Use one of:
navigation, commerce, analytics, forms, timers". Everything a capability
exposes goes to Storelib's own endpoints for this site; a section never gets an
arbitrary host.

## Runtime

Phase A checks and wraps scripts; it does not run them. Phase D runs the
bundle inside the preview iframe under a CSP with no `unsafe-eval`, no inline
scripts, and a network allowlist of Storelib's own origins. A script that
throws is caught at the section boundary and reported in the editor; the rest
of the page keeps working.

## Limits

A script is at most 64 KB (`LIMITS.scriptBytes`).

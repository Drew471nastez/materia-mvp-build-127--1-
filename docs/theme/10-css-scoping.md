# CSS scoping

Every section's `<style>` applies to that section's instances and
nothing else. Two sections that both declare `.title` do not fight; two
instances of one section do not share a rule that reads a setting.

## What the compiler does

Given

```css
.hero { padding: 64px 0; }
h1 { font-size: 48px; }
:root { --gap: 16px; }
@keyframes rise { from { translate: 0 8px; opacity: 0 } to { translate: 0; opacity: 1 } }
.hero h1 { animation: rise 400ms ease-out; }
@media (max-width: 640px) { .hero { padding: 32px 0; } }
```

it emits

```css
[data-section-id="__SECTION_ID__"] .hero { padding: 64px 0; }
[data-section-id="__SECTION_ID__"] h1 { font-size: 48px; }
[data-section-id="__SECTION_ID__"] { --gap: 16px; }
@keyframes sl-hero-rise { … }
[data-section-id="__SECTION_ID__"] .hero h1 { animation: sl-hero-rise 400ms ease-out; }
@media (max-width: 640px) { [data-section-id="__SECTION_ID__"] .hero { padding: 32px 0; } }
```

and at render time `__SECTION_ID__` becomes the instance's id.

- Every selector is prefixed with the instance scope, inside `@media`,
  `@supports` and `@container` too.
- `html`, `body` and `:root` become the section root. A section cannot style
  the page.
- `@keyframes` names are prefixed with the section type (`sl-<type>-<name>`)
  and every `animation` / `animation-name` that uses one is rewritten.
- `@import` is refused. There is no fetching from a stylesheet.
- Over 5000 KB (`LIMITS.cssBytes`) is refused.
- A syntax error carries the file line.

## Settings in CSS

A rule can read a setting. The block is scoped once, at compile time — with
each `{{ … }}` masked so postcss sees valid CSS and reports real line numbers
— and the expressions are filled per instance at render, which is a string
walk rather than a second parse. Output is made safe for a stylesheet rather
than HTML-escaped: braces and angle brackets are stripped from a value, since
no legitimate CSS value holds one.

```css
.hero { padding-top: {{ settings.padding_top }}px; }
```

For values that change per instance, prefer a custom property set in the
markup (`style="--hero-pad: {{ settings.padding_top }}px"`) and a static rule
that reads it; the stylesheet is then the same for every instance and cached
once.

## Global CSS

Global rules live in `layout/theme.storelib`, whose `<style>` is not scoped.
That is the one place for resets, font faces and the theme's custom
properties. A section that needs a global rule is a section that should ask
the theme for a token instead.

## From code

```ts
import { scopeCss, cssForInstance } from "@/lib/storelib-theme"

const r = scopeCss(css, { file: "sections/hero.storelib", line: 40, type: "hero" })
if (r.ok === true) document.head.append(Object.assign(document.createElement("style"), { textContent: cssForInstance(r.value, "hero_1") }))
```

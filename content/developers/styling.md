# Styling

A section's `<style>` applies to that section's instances and nothing else. Two sections that both declare `.title` do not fight, and one section cannot restyle the page around it. You do not write the scope and you cannot escape it: the compiler adds it.

## What scoping does

Given this in a section of type `hero`:

```css
.hero { padding: 64px 0; }
h1 { font-size: 48px; }
:root { --gap: 16px; }
@keyframes rise { from { translate: 0 8px; opacity: 0 } to { translate: 0; opacity: 1 } }
.hero h1 { animation: rise 400ms ease-out; }
```

the compiler emits

```css
[data-section-id="sec_9k2m"] .hero { padding: 64px 0; }
[data-section-id="sec_9k2m"] h1 { font-size: 48px; }
[data-section-id="sec_9k2m"] { --gap: 16px; }
@keyframes sl-hero-rise { … }
[data-section-id="sec_9k2m"] .hero h1 { animation: sl-hero-rise 400ms ease-out; }
```

- Every selector is prefixed with the instance, inside `@media`, `@supports` and `@container` too.
- `html`, `body` and `:root` are rewritten to mean the section's root. A rule written against them does not do what it looks like it does, so do not write them.
- `@keyframes` names are prefixed with the section type, and every `animation` that uses one is rewritten to match.
- `@import` is refused. A stylesheet cannot fetch anything.
- Global rules, such as resets and font faces, belong only in `layout/theme.storelib`.

## Settings in CSS

A rule can read a setting with the same `{{ }}` the template uses. The value is made safe for a stylesheet: braces and angle brackets are removed, because no legitimate CSS value holds one.

```css
.hero { padding-top: {{ settings.padding_top }}px; }
```

For anything that differs per instance, prefer a custom property set in the markup and a static rule that reads it. The stylesheet is then identical for every instance and cached once:

```storelib
<section class="hero" style="--hero-pt: {{ settings.padding_top }}px; --hero-pb: {{ settings.padding_bottom }}px">
```

```css
.hero { padding: var(--hero-pt) 24px var(--hero-pb); }
```

**Padding and spacing are settings.** Declare them as `range` settings with `"unit": "px"`, never as fixed numbers in the CSS, so a creator can tighten or loosen a section without asking for new code.

## Responsive

**Use container queries, not media queries.** A section is as wide as the column it sits in, and in the builder's phone preview that is not the width of the window. `@media (max-width: 640px)` asks about the window, so a section built on it looks right on a phone and wrong in the preview, or the other way round. A container query asks about the section itself, and is right in both.

Put `container-type: inline-size` on the outermost element, write the phone layout as the base rules, then widen:

```css
.grid { container-type: inline-size; }
.grid__items { display: grid; gap: 16px; grid-template-columns: 1fr; }

@container (min-width: 640px) {
  .grid__items { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@container (min-width: 1024px) {
  .grid__items { grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr)); }
}
```

A section must never scroll sideways. `minmax(0, 1fr)` instead of `1fr`, `min-width: 0` on flex children, and `overflow-wrap: anywhere` on long headings are what stop it.

The one place `@media` is right is **the visitor's own motion setting**, which is about them rather than about width:

```css
.card { transition: transform 200ms ease; }
.card:hover { transform: translateY(-2px); }
@media (prefers-reduced-motion: reduce) {
  .card { transition: none; }
  .card:hover { transform: none; }
}
```

## Colour schemes

A section does not choose colours. It chooses a **colour scheme**, and the creator decides what the scheme looks like in Theme settings. Change a scheme and every section on it changes, at once, in the builder and on the live site.

Declare a `color_scheme` setting, then read the scheme. In CSS, read the custom properties the renderer sets on the section's root. In the template, read `scheme.<key>`.

@[scheme-vars]

```css
.card { background: var(--scheme-background-secondary); border: 1px solid var(--scheme-border); }
.card__title { color: var(--scheme-heading); }
.card__body { color: var(--scheme-text); }
.button { background: var(--scheme-button-primary); color: var(--scheme-button-primary-text); }
```

Five schemes are built in. Their keys are `white`, `light`, `dark`, `black` and `highlight`, shown to the creator as Light, Soft, Dark, Brand and Accent; a creator can rename them and add more. Renaming changes the name, never the key.

**Never hard-code a hex value the scheme already answers.** A hard-coded colour stops responding to the creator's theme, and on a dark scheme it is usually unreadable. Before publishing a new section, switch it between a light and a dark scheme in the builder and read it on both. The builder's AI reviews contrast in what it writes; the code editor does not do it for you.

### A section's own colour overrides

Behind **Advanced colors** in the builder, a creator can override a few of a section's colours without leaving the scheme. The override is applied on top of the scheme by the renderer, so your CSS keeps reading the same variables. Say which slots your section allows:

```json
"supports_color_overrides": ["background", "heading", "text"]
```

`true` offers every slot, `false` offers none. When the schema has a `color_scheme` setting and says nothing, every slot is offered.

## Type

The theme has three font roles and nine text styles, each with its own size at desktop, tablet and phone width, weight, line height, letter spacing and case.

@[type-styles]

A section chooses a heading style and a body style, and the theme turns the choice into custom properties on the section root. Read them, with a fallback for when nothing was chosen:

```css
.hero__title {
  font-family: var(--theme-font-heading), ui-sans-serif, system-ui, sans-serif;
  font-size: var(--section-heading-size, 32px);
  line-height: var(--section-heading-line-height, 1.15);
  font-weight: var(--section-heading-weight, 700);
  letter-spacing: var(--section-heading-tracking, -0.01em);
  text-transform: var(--section-heading-transform, none);
}
.hero__lead {
  font-size: var(--section-text-size, 17px);
  line-height: var(--section-text-line-height, 1.6);
}
```

Name a font family inside a section only as a fallback after the theme's variable. The tablet and phone sizes take over inside the section's own container, so the builder's phone preview draws phone sizes.

Set `"supports_typography_overrides": false` on a section that has its own size control, such as a hero with a heading size slider, so the builder does not offer two controls for one thing.

## Layout conventions

These are what the library's thirty sections do, and what makes a new section sit beside them without looking out of place:

```css
.s__in {
  margin: 0 auto;
  max-width: var(--theme-page-width, 1280px);
  padding-inline: var(--theme-padding-x, 24px);
}
```

- Page width and side padding come from the theme, through `--theme-page-width` and `--theme-padding-x`.
- Corner radius comes from the theme's tokens: `{{ theme.radius.medium }}px`.
- Vertical rhythm is the section's own `padding_top` and `padding_bottom` range settings.

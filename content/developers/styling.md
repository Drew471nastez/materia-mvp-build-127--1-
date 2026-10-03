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
- A `<style>`, `<link>`, `<base>` or `<meta>` tag inside `<template>` is refused on save. Each acts on the whole page, not on the section; a section's CSS goes in its `<style>` block.
- There is no stylesheet for the whole site that you can write yet. Resets and the fonts are the theme's own, and a font is chosen in Theme › Typography rather than loaded by a section.

## The page a section sees

In the builder, a section is drawn in a canvas inside the editor. The canvas is the section's window:

- `position: fixed` is fixed to the canvas. A full-screen menu covers the page it is on, like a phone screen, and never the editor.
- `100vh` and `100vw` are rewritten to the canvas's height and width. On a live site they are the window's.
- A `@media` query that asks only about width is rewritten to the same `@container` query, so the phone preview draws the phone layout. A query about anything else, such as motion or hover, stays a media query.
- A `popover`, or a `<dialog>` opened with `command="show-modal"`, opens inside the canvas rather than above the whole screen. `:popover-open` and `:modal` still match it.

Nothing a section draws can reach outside the canvas, whatever its `z-index`.

A section clips sideways and not downwards, so a dropdown can hang below a header. The section someone is pointing at, typing in, or has a menu open in (a pop-up, or a button with `aria-expanded="true"`) is lifted above the sections after it, so the dropdown opens over them. Set `aria-expanded` on a menu's button when a script opens it.

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

**Use container queries, not media queries.** A section is as wide as the column it sits in, and in the builder's phone preview that is not the width of the window. A width-only `@media` query is rewritten to a container query for you, so the preview is right, but a container query on your own element says what you mean and can ask about the element rather than the page.

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

### Buttons, and their hover

A button reads four colours from its scheme: its fill and text, and its fill and text on hover. The two hover colours are automatic until the creator picks them, worked out from the button's own colours, so a creator who recolours a button never has to recolour its hover too. Paint hover from the scheme, not with `opacity` or a colour of your own:

```css
.s__btn--primary { background: var(--scheme-button-primary); color: var(--scheme-button-primary-text); border: 1px solid var(--scheme-button-primary-border); }
.s__btn--primary:hover { background: var(--scheme-button-primary-hover); color: var(--scheme-button-primary-hover-text); }
.s__btn--secondary { background: var(--scheme-button-secondary); color: var(--scheme-button-secondary-text); border: 1px solid var(--scheme-button-secondary-border); }
.s__btn--secondary:hover { background: var(--scheme-button-secondary-hover); color: var(--scheme-button-secondary-hover-text); }
```

In a template the same four are `scheme.primary_btn_hover_bg`, `scheme.primary_btn_hover_text`, `scheme.secondary_btn_hover_bg` and `scheme.secondary_btn_hover_text`.

Give every button the class `s__btn`, or `data-button` when it has to be something else. That is what puts it under the theme's **Buttons** settings: its shape, corner radius, weight, shadow and hover motion. A link that is not a button gets neither, and stays a link.

Five schemes are built in. Their keys are `white`, `light`, `dark`, `black` and `highlight`, shown to the creator as Light, Soft, Dark, Brand and Accent; a creator can rename them and add more. Renaming changes the name, never the key.

**Never hard-code a hex value the scheme already answers.** A hard-coded colour stops responding to the creator's theme, and on a dark scheme it is usually unreadable. Before publishing a new section, switch it between a light and a dark scheme in the builder and read it on both. The builder's AI reviews contrast in what it writes; the code editor does not do it for you.

### A section's own colour overrides

Behind **Advanced colors** in the builder, a creator can override a few of a section's colours without leaving the scheme. The override is applied on top of the scheme by the renderer, so your CSS keeps reading the same variables. Say which slots your section allows:

```json
"supports_color_overrides": ["background", "heading", "text"]
```

`true` offers every slot, `false` offers none. When the schema has a `color_scheme` setting and says nothing, every slot is offered.

### Colours of the section's own

Some colours are not the scheme's at all: the stars on a review, the dot on a timeline, the scrim over a photo, a badge. Declare them as `color` settings. Each one is a row in the section's panel, under its settings, and the colour the creator picks there is for this section alone: it beats the scheme and Advanced colors, and nothing else on the site changes.

Let it **follow the scheme until the creator picks one** by naming a scheme colour as its default:

```json
{ "type": "color", "id": "star_color", "label": "Stars", "default": "scheme.accent" }
```

```css
.review__stars { color: {{ settings.star_color }}; }
```

Untouched, `settings.star_color` is this section's accent: it changes with the scheme, with Advanced colors and with the theme. The row says **Scheme** and shows that colour, greyed. Once the creator picks a colour the setting holds its hex, and the reset arrow beside it puts it back to following the scheme. Any name `scheme.<key>` has works: the names in the table above and the older ones (`scheme.bg`, `scheme.primary_btn_bg`).

A plain hex default works too, and an empty default (`""`) means the section works the colour out itself, which the row calls **Auto**: write it as `{{ settings.star_color | default: scheme.accent }}`.

A theme block declares colours the same way, and they follow the scheme of the section the block is in: Heading's text color is `scheme.heading` until somebody picks one. A block's CSS is one rule per type, so its colour reaches that rule through an inline custom property; see [Colours a block has of its own](/developers/blocks#colours-a-block-has-of-its-own). The older colour settings the overrides already cover (`bg_color`, `text_color`, `button_color` and the rest) are not shown twice: Advanced colors edits them under their new names.

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

These are what the library's sections do, and what makes a new section sit beside them without looking out of place:

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

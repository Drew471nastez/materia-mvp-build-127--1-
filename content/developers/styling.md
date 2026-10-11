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

`@media` for width asks the window, and the builder measures the section, so `@container` is the reliable way to change a layout by width. Motion is the section's own. `@media (prefers-reduced-motion: reduce)` is a courtesy for a visitor who asked for less movement, not a rule that refuses a file:

```css
.card { transition: transform 200ms ease; }
.card:hover { transform: translateY(-2px); }
@media (prefers-reduced-motion: reduce) {
  .card { transition: none; }
  .card:hover { transform: none; }
}
```

## Colour schemes

A section may follow a **colour scheme**, which the creator edits in Theme settings, and may set its own colours. A `color` setting lets the creator overwrite one colour from the sidebar without changing the scheme. A fixed colour is allowed. Change a scheme and every section that reads it changes, at once, in the builder and on the live site.

Declare a `color_scheme` setting, then read the scheme. In CSS, read the custom properties the renderer sets on the section's root. In the template, read `scheme.<key>`.

```json
{ "type": "color_scheme", "id": "color_scheme", "label": "Colour scheme", "default": "white" }
```

### How a section picks its scheme

The section stores the scheme's **key** (`white`, `dark`, or a key the creator made) as `settings.color_scheme`, never its colours. When the page is drawn, the key is looked up in the theme's `color_schemes`:

1. The key the section stores, when the theme has that scheme.
2. When it does not (the scheme was deleted), the scheme its sections were moved to when it was deleted (`color_scheme_remaps`).
3. Then the theme's `default_color_scheme`, which is also what a new section starts on.
4. Then `white`.

So a section can never end up with no colours, and deleting a scheme moves its sections rather than breaking them. A section that never saved a scheme is on the theme's **Default for new sections**, whatever its schema's `default` says, and `settings.color_scheme` in its template names the scheme it really got.

### Every scheme colour

A scheme has twenty-one colours and a gradient. Each is a template value and a custom property on the section's root:

@[scheme-vars]

`--scheme-gradient` is the gradient when the scheme has one, and the background colour when it does not, so `background: var(--scheme-gradient)` is always safe. Older templates read short names, such as `scheme.bg` and `scheme.primary_btn_bg`; they are the same colours:

@[scheme-names]

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

Give every button the class `s__btn`, or `data-button` or `data-sl-button` when it has to be something else. That is what puts it under the theme's **Buttons** settings: its shape, corner radius, weight, shadow and hover motion. A link that is not a button gets neither, and stays a link. With Buttons › Style on **Outline** or **Ghost**, a button with no background of its own is drawn in the scheme's button colour (`--s-btn`), its label and border included, and Outline fills on hover.

Five schemes are built in. Their keys are `white`, `light`, `dark`, `black` and `highlight`, shown to the creator as Light, Soft, Dark, Brand and Accent; a creator can rename them and add more. Renaming changes the name, never the key.

**Never hard-code a hex value the scheme already answers.** A hard-coded colour stops responding to the creator's theme, and on a dark scheme it is usually unreadable. Before publishing a new section, switch it between a light and a dark scheme in the builder and read it on both. The builder's AI reviews contrast in what it writes; the code editor does not do it for you.

### Which colour wins

A section's colours are decided in this order, each one over the one before:

| Order | Where it is set | Stored as | Reaches |
| --- | --- | --- | --- |
| 1 | The scheme, in Theme settings › Colors | `color_schemes.<key>` in the theme | every section on that scheme |
| 2 | **Advanced colors**, in the section's panel | `settings.color_overrides`, by scheme colour name | this section's `scheme.*` and `--scheme-*`, so all of its CSS |
| 3 | A colour setting of the section's own, such as Stars | `settings.<id>`, a hex | only the rules that print that setting |

The page's own colours (Theme settings › Colors › Page colors) are not in this order: they paint the page behind and around sections, not a section.

### A section's own colour overrides

Behind **Advanced colors** in the builder, a creator can override a few of a section's colours without leaving the scheme: background, text, heading, accent, border, and the fill, text, hover fill and hover text of both buttons. The override is applied on top of the scheme by the renderer, so `scheme.heading` and `var(--scheme-heading)` already answer with the override and your CSS keeps reading the same names. Changing a button's colour without its hover colour gives the hover of the new colour, worked out the same way the scheme's is, and overriding the background drops the scheme's gradient. **Reset all to scheme** clears `color_overrides`. Say which slots your section allows:

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

### A colour setting for each element

A creator expects to change the colour of one heading, the way custom colours work in most store themes, without changing the scheme every other section uses. So a section gives **every element it draws** a colour setting, each defaulting to the scheme colour it follows:

```json
{ "type": "header", "id": "hdr_colours", "label": "Colours" },
{ "type": "color", "id": "heading_color", "label": "Heading", "default": "scheme.heading" },
{ "type": "color", "id": "text_color", "label": "Text", "default": "scheme.text" },
{ "type": "color", "id": "button_color", "label": "Button", "default": "scheme.primary_button_background" },
{ "type": "color", "id": "button_text_color", "label": "Button text", "default": "scheme.primary_button_text" },
{ "type": "color", "id": "card_color", "label": "Cards", "default": "scheme.background_secondary" },
{ "type": "color", "id": "card_border_color", "label": "Card border", "default": "scheme.border" }
```

Print them into the root's variables and paint with the variables, so one setting reaches every rule that uses it:

```storelib
<section data-scheme="{{ settings.color_scheme }}"
  style="--s-heading: {{ settings.heading_color }}; --s-text: {{ settings.text_color }}; --s-btn: {{ settings.button_color }}; --s-btn-text: {{ settings.button_text_color }}; --s-card: {{ settings.card_color }}; --s-card-border: {{ settings.card_border_color }};">
```

Untouched, each one is the scheme's colour, so the section looks exactly as it would without them and still changes with the scheme. The ids `heading_color`, `text_color`, `border_color`, `accent_color`, `bg_color`, `button_color` and `button_text_color` are the ones Advanced colors already edits, so the panel shows them there rather than twice; a colour picked there reaches the setting, and resetting it puts the setting back on the scheme. Any other id, such as `card_color`, is a row of its own under the section's settings.

AI agents writing a section are told to do this, and a section they write without any colour setting is handed back with a note naming the elements that need one.

A theme block declares colours the same way, and they follow the scheme of the section the block is in: Heading's text color is `scheme.heading` until somebody picks one. A block's CSS is one rule per type, so its colour reaches that rule through an inline custom property; see [Colours a block has of its own](/developers/blocks#colours-a-block-has-of-its-own). The older colour settings the overrides already cover (`bg_color`, `text_color`, `button_color` and the rest) are not shown twice: Advanced colors edits them under their new names.

## Type

The theme has three font roles and nine text styles, each with a desktop size and a phone size, a weight, a line height, a letter spacing and a case. A creator sets them in Theme settings › Typography; a section never sets a style's values, it picks a style.

@[type-styles]

A section chooses a heading style and a body style, and the theme turns the choice into custom properties on the section root. Read them, with a fallback for when nothing was chosen:

```css
.hero__title {
  font-family: var(--section-heading-font, var(--theme-font-heading), ui-sans-serif, system-ui, sans-serif);
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

Name a font family inside a section only as a fallback after the theme's variable. The phone size takes over when the section's own container is 767px wide or less, so the builder's phone preview draws phone sizes.

| Custom property | Holds |
| --- | --- |
| `--type-<style>-size`, `-font`, `-weight`, `-line-height`, `-tracking`, `-transform` | each text style, on the page root, `<style>` being `h1` to `h4`, `body-large`, `body`, `body-small`, `button` or `caption` |
| `--section-heading-*` | the style the section's heading uses: its choice, or Heading 2 |
| `--section-body-*` | the style its body uses: its choice, or Body |
| `--section-text-*` | the body style: the section's choice, or Body. Your fallback, `var(--section-text-size, 17px)`, is used only outside a themed page |
| `--theme-font-heading`, `--theme-font-body`, `--theme-font-accent` | the three fonts |

A new section whose first heading is an `<h1>` (a hero, a page's title, search, 404) starts on Heading 1.

### Theme settings that reach a section once set

These are written only after the creator changes the setting, so a section that reads them with a fallback keeps its own look until then:

| Custom property | From | Read it as |
| --- | --- | --- |
| `--sl-button-padding`, `--sl-button-size`, `--sl-button-line-height` | Buttons › Size, Typography › Button | `padding: var(--sl-button-padding, 13px 24px); font-size: var(--sl-button-size, 15px); line-height: var(--sl-button-line-height);` |
| `--sl-caption-font`, `-size`, `-weight`, `-tracking`, `-transform` | Typography › Caption | the small label over a heading |
| `--sl-image-radius` | Layout › Images and video › Corner radius | `border-radius: var(--sl-image-radius, var(--s-radius));` |

A `var()` with no fallback, such as `line-height: var(--sl-button-line-height)`, inherits until the property is set.

**Custom** stores the section's own style as `settings.custom_heading` or `settings.custom_body`, the same shape as a text style, sizes included: `{ "desktop": 48, "mobile": 32 }`.

Set `"supports_typography_overrides": false` on a section that has its own size control, such as a hero with a heading size slider, so the builder does not offer two controls for one thing.

### Keeping your own look

The theme's heading styles reach a section's `h1` to `h4` only where the section wrote nothing of its own, and Theme settings › Buttons and inputs reaches buttons a section marks as buttons. Text boxes are the exception: once a creator sets their corners or borders, every `input`, `select` and `textarea` in a section takes them.

Markup written for its own design, by hand, by an agent or imported whole, can opt out. Put `data-theme-styles="off"` on any element and the theme's heading styles and text box rules stay off everything inside it:

```html
<section class="pricing" data-theme-styles="off">
  <h2 class="pricing__title">Plans</h2>
  <input class="pricing__email" type="email">
</section>
```

Colour schemes, fonts read through `var(--theme-font-*)` and everything else a section reads on purpose keep working inside it.

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

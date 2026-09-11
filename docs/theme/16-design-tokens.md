# Design tokens: colour schemes and text styles

A theme's look is a set of tokens. Sections read the tokens; nothing in a
section names a hex colour or a pixel size that the theme should own.

```
Theme
  └─ Colour schemes      Light, Soft, Dark, Brand, Accent, and any the creator adds
  └─ Text styles         Heading 1 to 4, Body large, Body, Body small, Button, Caption
        └─ Section       picks one scheme and one heading and body style
              └─ Overrides   a few colours of its own, kept apart from the scheme
```

Changing a scheme or a style in Theme settings changes every section using
it, at once, in the editor and on the published page. A section's own
overrides survive that change. Both renderer families, the React sections
and the `.storelib` sections, resolve through one function,
`resolveSectionColors()` in `lib/storelib-theme/color-schemes.ts`, so the
canvas and the live site cannot disagree.

## Colour schemes

A scheme is seventeen semantic values and an optional gradient:

| Value | Custom property |
| --- | --- |
| `background` | `--scheme-background` |
| `background_secondary` | `--scheme-background-secondary` |
| `text` | `--scheme-text` |
| `text_muted` | `--scheme-text-muted` |
| `heading` | `--scheme-heading` |
| `accent` | `--scheme-accent` |
| `link` | `--scheme-link` |
| `border` | `--scheme-border` |
| `primary_button_background` | `--scheme-button-primary` |
| `primary_button_text` | `--scheme-button-primary-text` |
| `primary_button_border` | `--scheme-button-primary-border` |
| `secondary_button_background` | `--scheme-button-secondary` |
| `secondary_button_text` | `--scheme-button-secondary-text` |
| `secondary_button_border` | `--scheme-button-secondary-border` |
| `input_background` | `--scheme-input` |
| `input_text` | `--scheme-input-text` |
| `input_border` | `--scheme-input-border` |
| `gradient` | `--scheme-gradient` (the background when there is none) |

The properties are set on the section's root, so a section's CSS reads
`var(--scheme-heading)` and never a literal. In a `.storelib` template the
same values are `scheme.heading`, `scheme.primary_button_background` and so
on, and the older names (`scheme.bg`, `scheme.paragraph`,
`scheme.primary_btn_bg`) still work, each derived from a semantic value.

Five schemes are built in. Their keys are `white`, `light`, `dark`, `black`
and `highlight`, which every saved section already names; their names are
Light, Soft, Dark, Brand and Accent, and a creator can rename them. Renaming
changes the name, never the key. A creator can add schemes; they get a
`custom_…` key.

Stored as `theme.color_schemes[key]`, holding only what differs from the
built-in default. A scheme saved in the earlier eighty-slot shape (`bg`,
`heading`, `primary_btn_bg`, …) is read through the same aliases.

`theme.default_color_scheme` is the scheme a section gets when it names
none. Deleting a scheme moves every section on the open page to the
replacement and records `theme.color_scheme_remaps[deleted] = replacement`,
so a section on a page that was not open follows the same remap the next
time it renders. A scheme nobody remapped falls back to the default.

## A section's colours

A section shows `Color scheme` and, behind `Advanced colors`, the slots it
may override: Background, Text, Heading, Accent, Border, Primary button and
Secondary button (the buttons as background and text). Each is "use the
scheme" until set. Stored as `settings.color_overrides` keyed by semantic
name, apart from the scheme, and applied on top of it by the resolver.

The older per-section colour fields (`bg_color`, `text_color`,
`button_color`, `button_text_color`, `accent_color`, `border_color`,
`heading_color`, `cta_color`, `cta_text_color`) still render, and the panel
shows them as the override they are. Setting a slot writes the override and
blanks the old field.

## Text styles

Three fonts (`font_heading`, `font_body`, `font_accent`) and nine styles.
Each style is a font role, a weight, a size at desktop, tablet and phone
width, a line height, a letter spacing and a transform. They compile to
`--type-<style>-font`, `-size`, `-weight`, `-line-height`, `-tracking` and
`-transform` on the page root; the tablet and phone sizes take over inside
`@container (max-width: 1023px)` and `(max-width: 767px)`, against the
section's own container, so the editor's phone preview draws phone sizes.

Stored as `theme.typography_styles[style]`, only what differs. The older
flat controls (`heading_weight`, `heading_transform`,
`heading_letter_spacing`, `font_size_base`, `line_height_base`,
`button_font_weight`) still seed the defaults.

A section says `heading_style` (`h1` to `h4`, or `custom`) and `body_style`
(`body`, `body_large`, `body_small`, or `custom`). The theme stylesheet
turns the choice into `--section-heading-*` and `--section-body-*` on the
section root, and its own `h1` and `h2` rules read them. Only `custom`
exposes family, size, weight, line height and spacing, stored as
`settings.custom_heading` and `settings.custom_body`.

A `.storelib` section opts in with the section variables:

```css
.hero__title {
  font-size: var(--section-heading-size, 32px);
  line-height: var(--section-heading-line-height, 1.15);
  font-weight: var(--section-heading-weight, 700);
}
.hero__lead {
  /* Only defined once somebody chose a body style. */
  font-size: var(--section-text-size, 17px);
}
```

`h3` and `h4` take family, weight, spacing and transform from their style and
keep the size the section gave them: inside a section they are card titles
and labels, not the section's heading.

## What a schema declares

```json
{
  "type": "testimonials",
  "supports_color_scheme": true,
  "supports_color_overrides": ["background", "heading", "text"],
  "supports_typography_overrides": true
}
```

- `supports_color_scheme` defaults to true when the schema has a
  `color_scheme` setting.
- `supports_color_overrides` is `true`, `false`, or the list of slots the
  section allows. Defaults to every slot when the section has a scheme.
- `supports_typography_overrides` defaults to true. The hero sets it to
  false because it has a heading size control of its own.

The camelCase spellings (`supportsColorScheme`, …) are accepted too.

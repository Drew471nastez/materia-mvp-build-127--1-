# Settings resolution

A template stores only what a person changed. Everything else is decided by
one function, in one order, every time a section renders:
`resolveSettings` in `lib/storelib-theme/resolve.ts`.

## The order

```
resolved = saved ?? schema default ?? control fallback
```

1. **Control fallback.** Every control type has one (`""`, `0`, `false`…; see
   05). A setting with no `default` in its schema is this.
2. **Schema default.** The `default` in the `<schema>`. Changing it changes
   every instance that never touched the setting; that is the point of
   defaults being omitted from saved data.
3. **Saved value.** What the person set on this instance.
4. **Block value.** For a block setting, the block instance's saved value, with
   the block definition's default and the control fallback beneath it.

The theme is not a step in this chain. It provides **tokens** (`theme.colors.*`
and the rest) that a template reads directly; it never overrides a section's
setting by name. The order of precedence for appearance is therefore: control
fallback → theme tokens (only where the template reads them) → section default
→ instance value → block value. Later wins.

## Three transformations on the way through

**Responsive.** A setting with `"responsive": true` (on a type that allows it)
always arrives as `{ desktop, tablet, mobile }`, filled downwards: set desktop
only and tablet and mobile inherit it; set all three and each is its own. Saved
data may hold a plain value or a partial object; the template never sees
either.

```json
saved:    { "columns": { "desktop": 4, "mobile": 1 } }
resolved: { "columns": { "desktop": 4, "tablet": 4, "mobile": 1 } }
```

**Assets.** An `asset://<hash>` in an image, video, file or gallery setting
comes out as the URL this account serves it from. Stored data never contains a
URL, so a package moves between accounts and a storage migration touches no
template.

**Unknown keys.** A saved key the schema does not declare passes through
untouched. Data from a newer section, or a setting that was renamed and not
yet migrated, is not lost by being rendered.

## Saving: strip defaults

The inverse, `stripDefaults(defs, values)`, keeps only what differs from the
default. A responsive value equal at every breakpoint collapses to the plain
value; one equal to the default everywhere is dropped. The editor calls this
before writing an instance, so templates stay small and a later change to a
default reaches everyone who did not override it.

## Theme tokens

`themeTokens(themeSettings)` derives:

```
theme.colors.{primary, secondary, accent, background, surface, text, muted}
theme.typography.{heading, body}
theme.radius.{small, medium, large, pill}
theme.spacing.{small, medium, large, xlarge}
theme.schemes.{white, light, dark, black, highlight, …}
theme.settings.*          the raw settings, for anything a token does not cover
```

Sections read tokens, not raw settings, so a theme can rename a setting
without every section noticing.

## Colour schemes

A `color_scheme` setting names one of `theme.schemes`. The engine looks it up
and puts the result in `scheme`, so a template reads `scheme.bg`,
`scheme.heading`, `scheme.paragraph`, `scheme.border`, `scheme.text` without
a dynamic index. A theme's `color_schemes` setting overrides any of the five
defaults by name or adds new ones; an unknown name falls back to `white`.

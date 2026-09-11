# Creating sections with AI

> Status: the AI today applies instance operations (`ThemeOp`) and receives no compiler output. Change sets and compiler feedback are Phase C; the format below is what the AI will be given and produce.

The AI writes the same `.storelib` files a person writes, through the same
compiler, with the same errors. There is no second format and no second set
of rules.

## What the model receives

- The controls reference (05) as JSON: `storelib-controls.json`. It knows the
  25 control types and nothing else exists.
- The template language and scripting rules (03, 09), compactly.
- The theme's tokens (07) and colour schemes, so a generated section uses
  `theme.colors.primary` rather than a hex code.
- The current file, when editing one, and the schema of any section it is
  asked to change.
- Compiler errors from its previous attempt, with lines.

It does not receive: other accounts' files, asset URLs, environment
variables, or anything from the server beyond the theme.

## What the model produces

A change set: a list of file operations, applied together or not at all.

```json
{
  "message": "Added a testimonials section and placed it under the hero on the home page.",
  "changes": [
    { "op": "write", "path": "sections/testimonial.storelib", "content": "<template>…</schema>" },
    { "op": "patch", "path": "templates/index.json", "patch": [
      { "op": "add", "path": "/sections/sec_9k2m", "value": { "type": "testimonial", "settings": {} } },
      { "op": "add", "path": "/order/1", "value": "sec_9k2m" }
    ]}
  ]
}
```

- `write` replaces a source file. `patch` is a JSON Patch on a template.
- Every written `.storelib` is compiled. Every patched template is validated
  against the sections it references.
- If anything fails, nothing is applied; the errors go back to the model, and
  it revises. The person sees at most three rounds, then the errors.
- If everything passes, the whole set is applied as one revision, with the
  message as its label, so it can be undone as one step.

## Instance edits

Most requests are not new sections. "Make the hero heading bigger" is a patch
to `templates/index.json` setting `font_size_heading` on the instance, and
the model is told to prefer that: change data before changing source, and
change source only when the request cannot be met by any setting.

## What the model may not do

- Write outside `sections/`, `snippets/`, `templates/`, `config/`,
  `layout/`, `locales/`. Paths are validated the same way as the importer's.
- Reference an asset it was not given. Assets come from the person's
  uploads; the model refers to them by `asset://` and never invents one.
- Produce a `<script>` that needs a capability the person did not grant.
  The compiler refuses it; the model is told to drop the behaviour or ask.

## Ownership

A file the AI wrote is an ordinary file. The person edits it in the code
editor, exports it, and the next AI edit reads it back. Nothing marks it as
generated, and nothing about it needs the AI again.

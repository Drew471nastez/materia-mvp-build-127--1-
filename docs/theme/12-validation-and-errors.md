# Validation and errors

Nothing in the theme engine throws on bad input. Every function that reads a
file, a schema, a template, a stylesheet or a script returns a `Result`:

```ts
type Result<T> =
  | { ok: true; value: T; warnings?: ThemeError[] }
  | { ok: false; errors: ThemeError[] }

interface ThemeError {
  stage: "parse" | "schema" | "template" | "css" | "script" | "package"
  message: string
  file?: string      // "sections/hero.storelib"
  line?: number      // 1-based, in that file
  column?: number
  path?: string      // "settings[3].default", for errors about data
}
```

The code editor shows `file:line message`, the AI receives the same list and
fixes its own output against it, and the importer refuses a package with the
list attached. One shape, three consumers.

## Stages

| Stage | Refuses | Example |
| --- | --- | --- |
| `parse` | Malformed `.storelib` files. | `<style> is never closed` |
| `schema` | Bad JSON, a schema that breaks the rules in 04. | `default "big" is not a range` at `settings[2].default` |
| `template` | Bad markup or a refused construct (03). | `<script> is not allowed in a template. Put behaviour in the <script> block.` |
| `css` | Syntax errors, `@import`, size. | `@import is not allowed; a section cannot fetch stylesheets` |
| `script` | Forbidden identifiers, unknown capabilities, size. | `"window" is not available to a section. Reach outside the section through storelib.* instead.` |
| `package` | Everything in 11. | `sections/hero.storelib: sha256 does not match the manifest` |

## Warnings

A warning is something a person will want to know and the compiler cannot be
sure is wrong. Today: a setting the template never reads
(`the template never reads settings.unused`). Warnings do not stop a save; the
editor shows them beside the file.

## Lines

Every error that is about a file has a line in that file. Errors inside the
schema's JSON are mapped from the JSON's own line to the `.storelib` file's
line before they are reported, so a person clicks straight to it.

## Where validation runs

- **Code editor save.** The file is compiled before it is stored. A file that
  does not compile is not saved, and the errors are shown with lines.
- **AI edits.** A proposed change set is compiled before it is applied. Errors
  go back to the model, which revises; the person sees a working result or
  nothing, never a half-applied one.
- **Import.** Every file in the package. Refused as a whole.
- **Render.** Never. A section that reached the renderer already compiled; a
  section that fails at render time (a script that throws) is caught at its
  own boundary and the rest of the page renders.

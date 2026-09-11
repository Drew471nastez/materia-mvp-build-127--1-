# Export and import

A theme leaves Storelib as one file, `<name>.storelib-theme`, and comes back
the same way. The file is a zip of the folder in 01 plus a manifest that lets
the importer check it.

```
my-theme.storelib-theme
├── theme.json
├── manifest.json
├── config/settings.json
├── layout/theme.storelib
├── templates/*.json
├── sections/*.storelib
├── snippets/*.storelib
├── assets/<hash>.<ext>
└── locales/*.json
```

## `theme.json`

```json
{
  "format": "storelib-theme",
  "format_version": 1,
  "name": "Workbench",
  "version": "1.2.0",
  "author": "Ada",
  "engine": { "min": 1 }
}
```

`engine.min` is the lowest engine that can render the theme. A package that
needs a newer engine is refused with the number, not misread.

## `manifest.json`

```json
{
  "generated_at": "2026-09-11T09:00:00Z",
  "files": {
    "sections/hero.storelib": { "sha256": "…", "bytes": 8123 },
    "templates/index.json":   { "sha256": "…", "bytes": 640 }
  },
  "assets": {
    "3f2a9c0e…": { "filename": "hero-wide.jpg", "mime_type": "image/jpeg", "width": 2400, "height": 1200, "size": 412883, "alt_text": "" }
  }
}
```

Every file's hash is recomputed on import. A mismatch refuses the package.

## What the importer checks, in order

1. Zip opens; at most 2000 files; at most 50 MB (`LIMITS`).
2. Every path is relative, inside a known folder, without `..`.
3. `theme.json` is present, `format` is `storelib-theme`, `engine.min` is not
   above this engine.
4. `manifest.json` hashes match every file and every asset; each asset is at
   most 15 MB.
5. Every `sections/*.storelib` compiles. Errors carry file and line, and the
   whole import is refused: a theme with one broken section is a broken theme.
6. Every template references only section types the package has, within the
   per-template and per-section limits.

Nothing is written until everything passes. An import is a transaction.

## What is not exported

Account data: asset URLs, install ids, publish state, revisions, chats. A
package is the theme and only the theme.

## Fixtures

`tests/fixtures/themes` holds one theme per case — minimal, complex,
blocks, assets, custom JS, an invalid schema, a newer engine, and a
`storelib-theme/v2` export — and `tests/storelib-package.test.ts` round-trips
every valid one, refuses every invalid one, and migrates the old one.

## Migrating the old format

The builder's earlier exports (`manifest.json` with `format: "storelib-theme/v1"`
or `/v2`, `images/<sha>.<ext>`) still import. The importer turns each page's
`sections` array into `templates/<page>.json`, each `image_map` entry into an
asset, and `settings` into `config/settings.json`. Section types that have
not yet moved to `.storelib` keep rendering through their React renderer
until they do.

## From code

```ts
import { buildPackage, readPackage } from "@/lib/storelib-theme"

const bytes = await buildPackage({ theme, files, assets })      // Uint8Array
const r = await readPackage(bytes, { knownTypes })              // Result<ReadPackage>
if (r.ok === false) for (const e of r.errors) console.log(`${e.file}:${e.line} ${e.message}`)
```

`buildPackage` is deterministic: entries are written in sorted order with a
fixed timestamp, so the same theme builds to the same bytes and a round trip
— build, read, build — is byte-equal. `generated_at` appears in the manifest
only when the caller passes one.

`GET /api/website-builder/themes/<id>/export` returns a package;
`?legacy=1` returns the older zip. `POST /api/website-builder/themes/import`
reads either, and a package that fails any check is refused with the whole
list before anything is written.

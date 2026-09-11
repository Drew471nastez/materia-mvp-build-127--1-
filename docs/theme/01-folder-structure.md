# Folder structure

A theme is a folder. Everything the storefront needs to draw a site is in it,
and nothing that is not a theme is. The layout is the same on disk, in the
database, in the code editor's file tree, and inside a `.storelib-theme`
package, so a person who learns it once knows all four.

```
my-theme/
├── theme.json                 name, version, engine requirement
├── config/
│   └── settings.json          theme-wide settings: colours, fonts, radius
├── layout/
│   └── theme.storelib         the page shell; where global CSS lives
├── templates/
│   ├── index.json             which sections the home page has, in order
│   ├── product.json
│   └── page.about.json
├── sections/
│   ├── hero.storelib          one file per section type
│   ├── features.storelib
│   └── …
├── snippets/
│   └── button.storelib        markup reused by sections (Phase C)
├── assets/                    binary files, by content hash
│   └── 3f2a…c9.png
└── locales/
    └── en.json                strings a section reads with `| t`
```

## What goes where

| Folder | Contains | Source or instance |
| --- | --- | --- |
| `theme.json` | Name, version, `engine.min`. | source |
| `config/` | `settings.json`: the theme's own settings. `settings_schema.json` (Phase C): what those settings are. | instance |
| `layout/` | `theme.storelib`: the document shell and the only place unscoped CSS is allowed. | source |
| `templates/` | One JSON file per page: section instances, their settings, their order. Never markup. | instance |
| `sections/` | One `.storelib` per section type: markup, scoped style, optional script, schema. | source |
| `snippets/` | Markup fragments a section includes. | source |
| `assets/` | Files, named by their SHA-256. Referenced as `asset://<hash>`. | binary |
| `locales/` | Translations. | source |

The split in the third column is the whole design. Change a file under
`sections/` and every page that uses that section changes how it works;
nobody's content moves. Change a file under `templates/` and one page's content
changes; no section changes how it works. There is no file that does both.

## Naming

- A section file is `sections/<type>.storelib`, and its schema's `type` must
  be the same word. The compiler refuses a file whose schema disagrees with its
  name, because two names for one thing is how a rename loses data.
- A section type is lowercase letters, digits, `-` and `_`.
- A template is `templates/<name>.json`. Page templates for individual pages
  are `templates/page.<slug>.json`.
- An asset is `assets/<sha256-hex>.<ext>`. The extension is for humans; the
  hash is the identity.
- Paths are POSIX, relative to the theme root. A path may not begin with `/`
  and may not contain `..`. The package importer refuses both.

## What is not in the folder

- Compiled output. Sections are compiled on load and cached by content hash
  (`lib/storelib-theme/storelib/compile.ts`). A package never carries it.
- Account data. Asset URLs, install ids, publish state, revisions: none of it.
  A package from one account imports into any other.
- Secrets. There is no file in this layout that may hold one, and the
  importer does not know what to do with one.

## Where the files live in Storelib

Today, the files of an installed theme are rows in `store_theme_custom_files`
(`install_id`, `path`, `content`), and the templates are the JSONB columns of
`store_theme_pages`. The code editor's tree is a view over those rows using the
paths above. The migration in `00-architecture-and-migration.md` moves each
section type from a React renderer to a `sections/<type>.storelib` row one at a
time; the folder layout is the same before and after.

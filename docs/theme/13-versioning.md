# Versioning

Four things carry a version, and they are independent so that one moving does
not force the others.

| Thing | Where | Bumped when |
| --- | --- | --- |
| Engine | `ENGINE_VERSION` in `types.ts` | The engine gains something a theme can require. |
| Package format | `THEME_FORMAT_VERSION`, `theme.json` → `format_version` | The zip layout or manifest changes. |
| Section schema format | `SECTION_SCHEMA_VERSION`, `<schema>` → `schema_version` | The schema JSON gains or changes a key. |
| A theme | `theme.json` → `version` | The author says so. |
| A section | `<schema>` → `version` | The author says so; `migrations` refer to it. |

## Forward compatibility

A file written for a newer version is **refused, not misread**:

- `schema_version: 2` against an engine that reads 1: "schema_version 2 is
  newer than this engine understands (1)".
- `engine.min: 3` against engine 1: the package is refused with both numbers.

A file written for an older version is read. Unknown keys survive every read
and write, so a theme that came from a newer engine and was refused loses
nothing when the engine catches up.

## Updating a section without losing content

Setting ids and block types are the contract. An update may:

- add settings and blocks (existing instances get the defaults)
- change defaults (instances that never overrode them follow)
- change markup and CSS freely

An update must not rename or remove an id without a migration:

```json
"version": "1.1.0",
"migrations": [
  { "from": "title", "to": "heading", "since": "1.1.0" }
]
```

On load, an instance whose saved settings hold `title` and not `heading` is
read as `heading`. The saved data is rewritten only when the person next
saves. A removed setting's saved value is kept as an unknown key.

## Instances

Instance ids (`sec_…`, `blk_…`) are minted once and never change. Reorder
changes `order`; duplicate mints a new id; export and import keep them.
Section CSS scoping, AI diffs and revision diffs all depend on that.

## Revisions

A save writes a revision of the changed file or template. The editor lists
them and restores one as a new revision, never by deleting history. This is
`store_theme_backups` today; Phase C moves file revisions beside the files.

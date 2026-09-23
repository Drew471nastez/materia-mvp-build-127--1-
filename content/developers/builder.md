# How the builder works

A Storelib website is a **theme**: a set of source files that say how things look and behave, and a set of pages that say what is on them. The website builder is an editor over those two things, and the storefront is a renderer over them. This page is the map; the rest of the hub is the detail.

## Source and content

Everything in a theme is one of two kinds, and the split is the whole design.

| Kind | What it is | Where it lives | Who changes it |
| --- | --- | --- | --- |
| **Source** | Section files: markup, CSS, schema, optional script. One file per section type. | `sections/<type>.storelib` | A developer, the code editor, an AI agent |
| **Content** | Pages: which sections they hold, in what order, with what settings and blocks. Never markup. | `templates/<page>.json` | The creator, in the builder |

Change a section file and every page using that section changes how it looks; nobody's content moves. Change a page and one page's content changes; no section changes how it works. There is no file that does both, which is why a section can be rewritten without losing a single word a creator typed.

## A theme on disk

The same layout is used in the database, in the code editor's file tree and inside an exported theme, so it only has to be learned once.

```text
my-theme/
├── theme.json              name, version, engine requirement
├── config/
│   └── settings.json       theme-wide settings: colour schemes, fonts, radius
├── layout/
│   └── theme.storelib      the page shell, and the one place CSS is not scoped
├── templates/
│   ├── index.json          the home page: its sections, in order
│   ├── product.json
│   └── page.about.json     a page of its own, at /about
├── sections/
│   ├── hero.storelib       one file per section type
│   └── features.storelib
└── assets/
    └── 3f2a…c9.png         files, named by the SHA-256 of their bytes
```

Rules the importer and the code editor enforce:

- A section file is `sections/<type>.storelib` and its schema's `type` is the same word. A file whose schema disagrees with its name is refused, because two names for one thing is how a rename loses data.
- A section type is lowercase letters, digits, `-` and `_`.
- Paths are relative to the theme root. A path may not begin with `/` or contain `..`.
- An asset is referenced as `asset://<sha256>`, never by URL. See [Schema](/developers/schema#assets).

## The hierarchy

```text
Theme
 ├─ Theme settings       colour schemes, fonts, text styles, spacing, radius
 └─ Pages
     └─ Sections          an instance of a section type, with its own settings
         └─ Blocks        repeatable children: a question, a slide, a logo
```

A **section instance**, as the builder stores it:

```json
{
  "id": "sec_9k2m",
  "type": "faq_accordion",
  "name": "FAQ",
  "settings": { "heading": "Questions" },
  "blocks": [
    { "id": "blk_8f2a", "type": "question", "settings": { "question": "Do you ship abroad?" } },
    { "id": "blk_c31d", "type": "question", "settings": { "question": "Returns?" } }
  ],
  "hidden": false
}
```

- Ids are minted once and never change. Reordering moves an instance; duplicating mints a new id.
- `settings` holds only what the creator changed. Everything else comes from the schema's defaults, so a later change to a default reaches everyone who never overrode it.
- A setting the schema no longer declares is kept, not deleted. Updating a section never destroys content.

## Draft and published

Every page and every theme setting has a draft and a published copy. The builder writes drafts as you work; **Publish** copies the drafts over the published columns in one step. Visitors only ever see published values, and the builder only ever shows drafts, so nothing you try in the editor reaches a visitor until you choose.

## What happens when you save a section file

1. **Parse.** The file is split into its four blocks, each with the line it starts on.
2. **Validate the schema.** Every setting type, id, default and option is checked against the control registry.
3. **Compile the template.** The markup becomes a tree. Every name the template reads is checked against the schema beside it, so `{{ settings.headng }}` is an error with a line number, not a blank space on the page.
4. **Scope the CSS.** Every selector is rewritten to apply to this section's instances only.
5. **Check the script.** Forbidden names and undeclared capabilities are refused.

If any step fails, the file is not saved, and each error is shown with its file and line. A section that reached the page has already compiled. See [Sections](/developers/sections#errors) for the error format.

## What happens when a visitor opens a page

The storefront reads the published page, resolves each section's settings (saved value, then schema default, then the control's own fallback), renders the compiled template to HTML on the server, and sends that HTML with each section's scoped CSS. A visitor's browser receives finished markup and never downloads the template engine.

A hidden section is not rendered. A section whose file does not compile is left out of the published page rather than breaking it, and shown in the builder as a card naming the file and the line.

## Two kinds of section

The library is written in the framework, and so is anything you or an AI write. A few long-standing sections, such as the header and footer, are still drawn by the platform's own React components. Both kinds are placed, reordered, hidden and edited in exactly the same way, and both read the same colour schemes and text styles, so a creator cannot tell them apart. Everything you write is the first kind.

## What keeps a site safe

A theme can be exported to a single `.storelib-theme` file and imported into another account, and themes are becoming something creators share. So the framework treats every section as code somebody else might have written.

- **Markup is escaped.** `{{ }}` always HTML-escapes. The only way to emit markup is the `raw` filter, and only on a `richtext` setting, whose value is cleaned against an allow list on save, on import and again on every read.
- **CSS cannot leave its section.** Scoping is done by the compiler, not by convention.
- **No inline script.** `<script>` in a template, `on*=` attributes and `javascript:` URLs are refused at compile time.
- **Frames are allow-listed.** An `<iframe>` needs the `embed` capability and takes its address from the `embed` filter, which only answers for known video and audio players.
- **Scripts cannot reach the page.** `window`, `document`, `fetch` and the rest are refused by name. See [JavaScript](/developers/javascript).

## Moving a theme

**Export** writes the theme's files, pages, settings and assets into one `.storelib-theme` file, with a manifest listing the SHA-256 of every file. **Import** reads it as a whole or not at all: every path is checked, every hash is recomputed, every section is compiled, and every page is checked against the sections it uses. A package that fails any check is refused with the list of reasons, and nothing is written. Anything creator-written is cleaned on the way in.

Limits for a package:

@[limits]

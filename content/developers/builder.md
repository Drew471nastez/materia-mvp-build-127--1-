# How the builder works

A Storelib website is a **theme**: a set of source files that say how things look and behave, and a set of pages that say what is on them. The website builder is an editor over those two things, and the storefront is a renderer over them. This page is the map; the rest of the hub is the detail.

## Source and content

Everything in a theme is one of two kinds, and the split is the whole design.

| Kind | What it is | Where it lives | Who changes it |
| --- | --- | --- | --- |
| **Source** | Section files: markup, CSS, schema, optional script. One file per section type. | `sections/<type>.storelib` | A developer, the code editor, an AI agent |
| **Content** | Pages: which sections they hold, in what order, with what settings and blocks. Never markup. | A row per page; `templates/<page>.json` in a package | The creator, in the builder |

Change a section file and every page using that section changes how it looks; nobody's content moves. Change a page and one page's content changes; no section changes how it works. There is no file that does both, which is why a section can be rewritten without losing a single word a creator typed.

## A theme as files

An exported theme is a folder of files in a zip, and the code editor shows a website's files in a similar layout:

```text
my-shop/
├── theme.json              name, version, the engine it needs
├── manifest.json           the SHA-256 of every file, checked on import
├── config/
│   └── settings.json       theme-wide settings: colour schemes, fonts, radius
├── templates/
│   ├── home.json           the home page: its sections, in order
│   ├── product.json        the template every product page is drawn with
│   └── about.json          a page of its own, at /about
├── sections/
│   ├── hero_centered.storelib   one file per section type
│   └── features_grid.storelib
└── assets/
    └── 3f2a…c9.webp        media, named by the SHA-256 of its bytes
```

In the database the same website is rows: one for the settings, one per page, one per section file you saved. [Themes](/developers/themes) has the package format and [Data model](/developers/data-model) the rows.

- **A section's type is its file name**, `sections/<type>.storelib`, in lowercase letters, digits, `-` and `_`. That name is what a page stores. Keep the schema's `type` the same: Ask AI and the agent tools `storelib_create_section` and `storelib_edit_section` refuse a file where the two differ, and everywhere else the file name wins.
- **Paths are relative to the theme root.** A path may not begin with `/`, contain `..` or a backslash.
- **Only section files draw anything.** The site reads `sections/*.storelib` from a theme's files. The other files the code editor shows are views of the theme's data, and editing one changes nothing on the site.

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
  "id": "faq_accordion-1727200000000",
  "type": "faq_accordion",
  "name": "Accordion FAQ",
  "settings": { "heading": "Questions" },
  "blocks": [
    { "id": "block-m1x2-1-ab3cd", "type": "qa", "settings": { "question": "Do you ship abroad?" } },
    { "id": "block-m1x2-2-q9t4w", "type": "qa", "settings": { "question": "Returns?" } }
  ],
  "hidden": false
}
```

- Ids are made once and never change. Reordering moves an instance; duplicating gives the copy new ids.
- `settings` holds what the section's preset set and what the creator has set since. Everything else comes from the schema's defaults when the section is drawn, so a later change to a default reaches every instance that does not store that setting.
- A setting the schema no longer declares is kept, not deleted. Updating a section never destroys content.

## Draft and published

Every page, the theme settings and every section file you saved have a draft and a published copy. The builder writes drafts as you work; **Publish** copies every draft over its published copy in one step. Visitors only ever see published values, and the builder shows drafts, so nothing you try in the editor reaches a visitor until you choose. [Publishing and checks](/developers/publishing) has every step.

## What happens when you save a section file

1. **Parse.** The file is split into its four blocks, each with the line it starts on.
2. **Validate the schema.** Every setting type, id, default and option is checked against the control registry.
3. **Compile the template.** The markup becomes a tree. Every name the template reads is checked against the schema beside it, so `{{ settings.headng }}` is an error with a line number, not a blank space on the page.
4. **Scope the CSS.** Every selector is rewritten to apply to this section's instances only.
5. **Check the script.** Forbidden names and undeclared capabilities are refused.

If any step fails, the file is not saved, and each error is shown with its file and line. A file that saves is a draft, and reaches visitors when the website is published. See [Sections](/developers/sections#errors) for the error format.

## What happens when a visitor opens a page

The storefront reads the published page, resolves each section's settings (saved value, then schema default, then the control's own fallback), renders the compiled template to HTML on the server, and sends that HTML with each section's scoped CSS. A visitor's browser receives finished markup and never downloads the template engine.

A hidden section is not rendered. A section whose file does not compile is left out of the published page rather than breaking it, and shown in the builder as a card naming the file and the line.

## Two kinds of section

The library is written in the framework, and so is anything you or an AI write. A few long-standing sections, such as the header and footer, are still drawn by the platform's own React components. Both kinds are placed, reordered, hidden and edited in exactly the same way, and both read the same colour schemes and text styles, so a creator cannot tell them apart. Everything you write is the first kind.

## What keeps a site safe

A theme can be exported to a single file and imported into another account, which makes it something creators hand each other. So the framework treats every section as code somebody else might have written.

- **Markup is escaped.** `{{ }}` always HTML-escapes. The only way to print markup is the `raw` filter, which is for `richtext` settings; rich text is cleaned against an allow list on save, on import, on publish and on every read. See [Output](/developers/sections#output) for which settings that covers.
- **CSS cannot leave its section.** Scoping is done by the compiler, not by convention.
- **No inline script.** `<script>` in a template, `on*=` attributes and `javascript:` URLs are refused at compile time.
- **Frames are allow-listed.** An `<iframe>` needs the `embed` capability and takes its address from the `embed` filter, which only answers for known video and audio players.
- **Scripts cannot reach the page.** `window`, `document`, `fetch` and the rest are refused by name. See [JavaScript](/developers/javascript).

## Moving a theme

**Export** writes the theme's settings, its pages as last published, its section files and its media into one `.storelib-theme.zip` file, with a manifest listing the SHA-256 of every file. **Import** reads it as a whole or not at all: every path is checked, every hash is recomputed, every section is compiled, and every page is checked against the sections it uses. A package that fails any check is refused with the list of reasons, and nothing is written. Anything creator-written is cleaned on the way in. [Sharing themes](/developers/sharing-themes) has what travels and what does not.

Limits for a package:

@[limits]

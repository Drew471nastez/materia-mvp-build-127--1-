# Publishing and checks

Everything you change on a Storelib website is a draft until you publish, and visitors only ever see what was published. This page is what counts as a draft, what Publish does step by step, which checks run at which moment, the limits, and what keeps a section off a page.

## Drafts and the live site

A website's theme settings, each of its pages and each section file you saved has two halves: a draft and a live copy.

| What | The draft | The live copy | Goes live |
| --- | --- | --- | --- |
| Theme settings | `draft_settings` | `settings` | On Publish |
| A page | `draft_sections` | `sections` | On Publish |
| A section file you saved | `draft_content` | `content` | On Publish |

The builder shows drafts, where there are any, and the live copy everywhere else. The live site shows live copies only. A [preview link](/developers/sharing-themes#preview-links) shows the draft pages and theme settings with the live section files.

A few things are not drafts and change the live site at once: deleting a page you made, taking the website offline, and the address and domain settings in Website settings.

## Saving

**The builder saves by itself.** A second and a half after your last change it writes the draft: first the theme settings, then the page you are on, then it copies the page's header and footer onto every other page. It waits while a save or a publish is already running, and while the builder is switching page. A save that fails says so; it is never silent. After a save the builder asks the server for a new picture of the website for the library card.

**The code editor saves when you press Save**, or ⌘S or Ctrl+S. A section file is compiled first and stored only if it compiles, as a draft, with a new version in its history.

**Ask AI, a connected agent and a GitHub push** save drafts too, through the same routes. Before a connected agent changes a page or the theme settings, a backup of the whole website is taken.

## What Publish does

On the live website, Publish is in the builder's top bar. A website that is not live has **Save** there instead, and is published from Website settings › Publishing or from its menu in the library. Either way, publishing does this, in order:

1. The builder saves the page you are on and the theme settings as drafts, and copies the header and footer onto every page, exactly as an autosave does.
2. The website that was live, if it is another one, is taken offline. Only one website is live at a time.
3. This website is marked live, with the time.
4. The draft theme settings become the live ones, and every page's draft becomes its live copy. Both are cleaned against the HTML allow list on the way.
5. Every section file's draft becomes its live copy, and each is recorded in that file's history as a publish.
6. A backup is taken, labelled Published, unless nothing has changed since the newest backup.
7. The copy of the site held for visitors is thrown away, so the next visitor gets the new one, and the search engines that take IndexNow are told the pages changed.

**Publish checks nothing.** It compiles no file and holds no page against its sections. Every check happens earlier, when something is saved, and a section that cannot be drawn is left out when the page is drawn, below.

## What is checked, and when

### When a section file is saved

From the code editor, Ask AI, a connected agent or a GitHub push:

- **It compiles.** Parse, schema, template, CSS and script, each error with its file and line. A file that does not compile is not stored. See [Sections](/developers/sections#errors).
- **It is not too big.** A file saved from the code editor or an agent is 1 MB at most, and a section file 5000 KB, which the compiler checks.
- **No other section has its name.** The `name` in the schema is what Add Section and the Sections panel show, so two sections called FAQ are refused, drafts included.
- **It has not moved underneath you.** The code editor sends the time it read the file, and an agent can, and a file saved somewhere else since then is refused rather than overwritten.
- **A new file fits.** A website holds 2000 files.

Written by Ask AI, a connected agent or a GitHub push, a section file must also pass the **quality and integration checks**: it takes its colours from the colour scheme, its type from the theme's text styles, its buttons from the scheme's button colours, its spacing from `padding_top` and `padding_bottom` settings, and its words, pictures and links from settings or blocks; it works at phone width with container queries; it stops moving for a visitor who asked for less motion. The code editor does not hold a person to those. See [Rules before you ship](/developers/rules#native-not-pasted-in).

A section's type is its file name. Ask AI and the agent tools `storelib_create_section` and `storelib_edit_section` also refuse a file whose schema says a different `type`. `storelib_write_section`, the HTTP API and a GitHub push save such a file under its file name without the quality and integration checks, so keep the two the same.

### When a page is saved

From the builder, including every autosave:

- The page is cleaned against the HTML allow list: script, event handlers and `javascript:` links are removed from rich text and HTML settings.
- A page holds 60 sections at most, and a section 50 blocks.

That is all. A page save does not check that each section's type exists, or that each setting is one its section declares. The builder's panels only offer what a section declares, and the Add block button keeps to the section's `limit` and `max_blocks`.

### When an agent changes a page

The page tools a connected agent uses (`storelib_update_styles`, `storelib_create_page`, `storelib_create_safe_patch`) refuse a setting its section does not declare, a value its control cannot take, a block type the section does not accept, more blocks than its `max_blocks`, and more than 60 sections on a page. A safe patch applies all of its changes or none. Ask AI reads its own changes back before it finishes, for text that cannot be read against its background, a heading left empty, a preset's demo copy left in place and the same item written twice.

`storelib_run_tests` runs the checks on demand and reports each one: `compile` and `quality` for a file, and `page-types`, `page-settings`, `contrast` and `limits` for a page. Contrast is 4.5 to 1 or better for text against its background.

### When a theme is imported

The whole package is checked before anything is written, and one failure refuses it. The list is in [Sharing themes](/developers/sharing-themes#import): sizes, paths, `theme.json`, every hash in the manifest, every section compiled, and every page against the sections the package has.

### When a visitor opens a page

Each section is drawn from its live file, compiled once and kept. A file saved before a newer rule existed is drawn with that rule relaxed rather than refused: a `<style>`, `<link>`, `<base>` or `<meta>` tag in its template is taken out of the page instead of stopping the section.

A section is **left out of the page**, and the rest of the page is drawn as normal, when:

- it is hidden,
- its section file does not compile,
- there is no file for its type and it is not one of the platform's own sections, such as the header and footer.

In the builder the last two are drawn as a red card in the section's place, naming the file and the line, so whoever is editing can fix it. A section whose script throws keeps what its template drew; the script stops and the section stays.

## Limits

The framework's own limits, read from the engine:

@[limits]

Around the builder:

| What | Most allowed |
| --- | --- |
| A file saved from the code editor or an agent | 1 MB |
| Websites in the library | 5: one live and four drafts |
| Backups kept for each website | The newest 30 |
| Versions kept of each section file | The newest 50 |
| Products a template can read | 24 on the live site |
| Pages a connected agent can make | 60 per website |
| Requests from one agent connection | 120 a minute, 2000 an hour |
| Imports started | 5 a minute, 30 an hour |

## Backups

A backup is the website's theme settings and every page, as the builder would show them: the draft where there is one, the live copy where there is not. Section files are not in backups; each keeps its own history instead, under **History** in the code editor.

A backup is taken when you publish, when Ask AI finishes a task, before a connected agent changes a page or the theme, when you press **Back up now** in Website settings › Backups & Versions, and before a restore. A backup that would be the same as the newest one is not taken twice.

**Restore** puts a backup's settings and pages back as the draft, after backing up the draft it replaces. Nothing goes live until you publish.

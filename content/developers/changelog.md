# Changelog

Changes to the Storelib Builder Framework: the section format, the template language, the schema, the controls and the rules the compiler enforces. Changes to the builder's interface that do not change what a section can do are not listed.

## Versions

Five things carry a version, and they move independently so that one changing does not force the others.

@[versions]

A file written for a newer version is **refused, not misread**: a schema declaring `"schema_version": 2` against an engine that reads 1 is rejected with both numbers named. A file written for an older version is always read, and keys the engine does not recognise survive every read and write.

Every change since 1.0 has been additive. Nothing a section could do on 11 September 2026 has stopped working since, which is why every version above is still 1.

## 25 September 2026

**Added**

- [Themes](/developers/themes): what a theme holds, the website library, every theme setting key, colour schemes and typography, and the package format with `theme.json`, `manifest.json` and `templates/*.json`.
- [Pages and page settings](/developers/pages), [Sharing themes](/developers/sharing-themes), [Publishing and checks](/developers/publishing), [Dynamic values](/developers/dynamic-values) and [Data model](/developers/data-model).
- The hub is grouped the way it is used: Get started, Themes, Sections, Data and logic, Tools and AI, and Reference. Every page keeps its address.

**Fixed in these pages**

- `migrations` and `allowed_templates` are described as they ship: validated and kept, and not applied or used yet.
- An unknown filter is not refused by the compiler. It prints the value unchanged.
- There is no `layout/theme.storelib`. A theme has no stylesheet for the whole site that you can write.
- An export names its page files by page key, `templates/home.json` and `templates/about.json`, and takes the theme settings from the draft and the pages as last published.
- Media settings hold public URLs on a site. `asset://` references exist only inside a theme package.
- The importer holds blocks to the ceiling of 50. `limit` and `max_blocks` are held by the builder's buttons, and `max_blocks` by the agent page tools.
- A page picker and a product picker store the address they link to.
- A section's script receives the settings stored on the instance, without schema defaults.
- A product's `tag` is always empty today.
- A page stores its preset's values and everything the creator sets, not only what differs from the defaults.

## 24 September 2026

**Added**

- [Rules before you ship](/developers/rules): what every agent follows before writing code on a Storelib site, and the `storelib_rules` tool that returns them. `storelib_guide` now starts with them.
- A navigation bar [example](/developers/examples#navigation-bar), with menu links as blocks and a phone menu that opens with `popover`.

**Changed**

- An agent can no longer change a built-in section. A write to one over MCP, the agent API or a GitHub push is refused, and `storelib_list_files` marks each file `writable`. A different version is written as a new section.
- The builder's AI saves a section it rewrites as a draft with a version, like the code editor, instead of writing it straight to the live site.
- Connections has its own place in Website Settings, under Code, instead of inside Advanced. Links to `?settings=advanced` still open it.
- In the builder, `position: fixed`, `100vh` and `100vw` answer to the canvas, width-only media queries become container queries, and a `popover` or command-opened `<dialog>` opens inside the canvas. See [The page a section sees](/developers/styling#the-page-a-section-sees).
- A `<style>`, `<link>`, `<base>` or `<meta>` tag inside `<template>` is refused on save and removed from sections saved before.

## 23 September 2026

**Added**

- Section scripts run. A section's `<script>` runs on the published page and in the builder, inside a sandbox with an opaque origin, against a copy of the section's own markup. Changes to classes, allowed attributes, styles and text are mirrored to the page; clicks, keys and input are sent back. See [How the sandbox works](/developers/javascript#how-the-sandbox-works).
- `storelib.scrollTo(element, options)`, `storelib.inEditor`, and `storelib.navigate(path)` for a section that declares `navigation`.
- [Selling](/developers/selling): the fields `products` gives a section, the checkout link `/checkout?productId={{ block.id }}&src=website`, the cart, what checkout does with the money, and what a section may never do with payments.
- `storelib_site`, and `GET /api/agent/v1/site`: what a connected website is, its brand, fonts, colour schemes, the sections on each page and its published products, so an agent writes for the site it is connected to.
- Agent connections. A creator connects Claude Code, Codex or any MCP client to one site from Website Settings › Advanced (first shipped as Website settings › Connections). It can list, read, compile and save that site's section files, as drafts, over MCP at `/api/mcp` or HTTP at `/api/agent/v1`. See [Connect an agent directly](/developers/ai#connect-an-agent-directly).
- GitHub. A site can be linked to a repository. Its section files and an `AGENTS.md` are written into it, and every push to the linked branch that changes `sections/*.storelib` is compiled and saved to the site as a draft, with a Storelib status on the commit. See [Connect through GitHub](/developers/ai#connect-through-github).
- [Using the website builder](/developers/website-builder): every panel, control and theme setting, drawn from the lists the builder reads.
- The `timers` capability grants working `setTimeout`, `setInterval` and `requestAnimationFrame`.
- Forms. A `<form>` in a section is submitted by the page, with no script. `data-storelib-form="subscribe"`, or any form with an email box and no action of its own, sends each address to the creator's Subscribers; `data-storelib-form="native"` leaves a form to the browser. The form carries `data-state` while it sends, and shows an element marked `data-storelib-success` when it is done. See [Forms](/developers/javascript#forms).
- The library's Newsletter Signup section collects sign-ups with nothing set up. It previously showed no form until an outside mailing list address was pasted in.
- The Storelib Developer Hub, [llms.txt](/llms.txt) and [llms-full.txt](/llms-full.txt), built from the same modules as the builder's AI.

**Changed**

- The compiler's messages for `@click`, `v-on:` and `on*=` name the section's `<script>` block, beside the HTML that needs no script.

**Security**

- Creator HTML in `richtext` settings is cleaned on import and publish as well as on save and read.
- Sign-up endpoints are rate limited per visitor and per address.

## 20 September 2026

**Fixed**

- A link is no longer styled as a button by theme rules that assumed every `<a>` in a section was one.

## 19 September 2026

**Added**

- Shop and search pages exist on every published site from the day it is published, built from the home page's header and footer, and can be opened and edited in the builder like any other page.

## 13 September 2026

**Added**

- A theme export carries its videos and files as well as its images, each by content hash, or the export fails rather than producing a theme with holes in it.

## 12 September 2026

**Changed**

- A section's type is its file name. A schema whose `type` disagrees with the file it is in is refused, naming both.
- Secondary buttons take the scheme's own secondary button colours.

**Fixed**

- Every section in the library was audited against its schema. Controls that changed nothing were removed rather than left in the panel.

## 11 September 2026

**Added**

- **Storelib Builder Framework 1.0.** The `.storelib` section format with `<template>`, `<style>`, `<script>` and `<schema>` blocks; the template language; the control registry; the compiler, with every error carrying its file and line; CSS scoping; and the script checker with capabilities.
- The section library: thirty sections in ten categories, every one a `.storelib` file.
- Blocks, presets, `max_blocks` and per-type `limit`.
- Responsive settings, resolved as `{ desktop, tablet, mobile }`.
- Colour schemes and text styles as theme tokens, with per-section overrides.
- `migrations`, a list of setting renames a section can declare. It is validated and kept; nothing applies it yet (25 September 2026).
- Themes export to and import from a single `.storelib-theme` file, checked as a whole, with every file hashed.
- An accessibility baseline: on every built-in colour scheme, body text meets a contrast of 4.5 to 1 against its background and headings meet 3 to 1.

# Changelog

Changes to the Storelib Builder Framework: the section format, the template language, the schema, the controls and the rules the compiler enforces. Changes to the builder's interface that do not change what a section can do are not listed.

## Versions

Four things carry a version, and they move independently so that one changing does not force the others.

@[versions]

A file written for a newer version is **refused, not misread**: a schema declaring `"schema_version": 2` against an engine that reads 1 is rejected with both numbers named. A file written for an older version is always read, and keys the engine does not recognise survive every read and write.

Every change since 1.0 has been additive. Nothing a section could do on 11 September 2026 has stopped working since, which is why every version above is still 1.

## 23 September 2026

**Added**

- Section scripts run. A section's `<script>` runs on the published page and in the builder, inside a sandbox with an opaque origin, against a copy of the section's own markup. Changes to classes, allowed attributes, styles and text are mirrored to the page; clicks, keys and input are sent back. See [How the sandbox works](/developers/javascript#how-the-sandbox-works).
- `storelib.scrollTo(element, options)`, `storelib.inEditor`, and `storelib.navigate(path)` for a section that declares `navigation`.
- Agent connections. A creator connects Claude Code, Codex or any MCP client to one site from Website settings › AI agents. It can list, read, compile and save that site's section files, as drafts, over MCP at `/api/mcp` or HTTP at `/api/agent/v1`. See [Connect an agent to a site](/developers/ai#connect-an-agent-to-a-site).
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
- `migrations` for renaming a setting without losing content.
- Themes export to and import from a single `.storelib-theme` file, checked as a whole, with every file hashed.
- An accessibility baseline: on every built-in colour scheme, body text meets a contrast of 4.5 to 1 against its background and headings meet 3 to 1.

# Building with AI agents

This page is written for the agent as much as for you. If you are an AI agent, Claude Code, Codex, ChatGPT, Cursor or any other, and you have been asked to build or change something on a Storelib site, read this page before writing anything. The rest of the hub is the full reference; this is how to use it and the standard your output is held to.

## Where the reference is

| URL | What it is |
| --- | --- |
| [storelib.com/llms.txt](/llms.txt) | A map of this hub in the llms.txt format: every page, one line each. Read this first. |
| [storelib.com/llms-full.txt](/llms-full.txt) | Every page of the hub in one plain-text file, with every reference table expanded. Load this when you need the whole framework in context. |
| [storelib.com/developers/ai](/developers/ai) | This page. |

Everything in them is generated from the framework itself: the control types, filters, capabilities and limits come from the compiler that enforces them, so they cannot describe a version of Storelib that does not exist.

## What you produce

A Storelib section is **one file**, `sections/<type>.storelib`, with four blocks: `<template>`, `<style>`, an optional `<script>`, and `<schema>`. There is no other format. Read [Sections](/developers/sections) for the file and the template language, and [Schema](/developers/schema) for every setting type.

When a person asks you for a section, answer with the file and nothing else around it, unless they asked for an explanation. They will paste it into the code editor, or you will write it into `sections/` in their theme.

## Eight things agents get wrong

These are the mistakes that produce a file which looks right and is not. Check each before you answer.

1. **A section's script runs against a copy.** It runs in a sandbox, and `root` is a copy of the section's own markup: toggle classes, set styles and text, add listeners, and the page mirrors each change. It cannot add or remove elements, measure layout, or set `src`, `href` or `on*`. Where HTML does it alone (`<details>`, radio inputs and `:checked`, scroll snapping, the `popover` attribute), use HTML. See [JavaScript](/developers/javascript).
2. **The template language is not Vue, React or JSX.** `v-if`, `@click`, `:class`, `{% assign %}` and JSX braces are refused. It is `{{ }}`, `{% if %}`, `{% for %}`, `{# #}` and filters, and nothing else.
3. **Every name must be declared.** `{{ settings.subtitle }}` does not compile unless the schema declares `subtitle`. Check every path your template and CSS read against your schema.
4. **Repeated content is blocks.** Never `feature_1`, `feature_2`, `feature_3`.
5. **Colour may follow the scheme, and may be overwritten.** A `color_scheme` setting and a `color` setting per element let the sidebar change a colour. A fixed colour is allowed.
6. **Container queries, not media queries.** The builder's phone preview is not the width of the window. A width-only media query is rewritten for you, but say what you mean.
7. **The header and footer are designed freely.** Layout, icons, buttons, type, motion and logo size are yours. Write a section with `"kind": "header"` or `"kind": "footer"` when they should replace the built-in ones. Keep menus, the logo, cart, search, account, products and checkout live. See [The header and footer](/developers/header-and-footer).
8. **The type is what the value is.** A picture is `image_picker`, never text holding an address; a menu is one `link_list`, never `link_1_label` and `link_1_url`. Both are refused for an agent. See [Choosing the type](/developers/schema#choosing-the-type).

## Know the website before you write for it

A section written without knowing the site is a section from another website: the wrong colours, an invented product, a headline for a business nobody runs. Before writing, find out:

- **What it sells.** The published products, with their real titles and prices. Never invent a product, a price or a review. A connected agent reads them with `storelib_site`; the builder's AI is given them.
- **What it is called and what it says about itself.** The brand name, tagline, site title and description. Write copy in the same voice and the site's language.
- **How it looks.** Colour schemes and fonts are there to follow, and a section may set its own. A colour setting lets the creator overwrite one.
- **What is already on the page.** The sections each page has, so a new one does not repeat the one above it.

Then read [Selling](/developers/selling) if the section shows a product, a price or a Buy button.

## An email box collects emails

A `<form>` with an `<input type="email">` in a section sends every address to the site creator's Subscribers. The page does it, with no script. Mark it `data-storelib-form="subscribe"`, and never write a script to submit a form or ask the creator to paste a mailing list URL to make it work. See [Forms](/developers/javascript#forms).

## The loop your output goes through

This is what the builder's own AI does with every section it writes, and it is the loop you should run yourself when you can:

@[ai-loop]

When you cannot run the compiler, the person will: the code editor compiles on save and shows each error as `file:line message`. Fix the line it names. Do not rewrite the file.

## Change content before source

Most requests are not new sections. "Make the heading bigger", "use the dark scheme", "add a fourth question" are changes to a section's **settings** or **blocks**, which the creator can make in the builder without new code. Write or change a section file only when no existing setting can do what was asked. When you do change one, change the least that does it, and never rename or remove a setting `id`: nothing moves a stored value to a new id, so whatever the creator typed under the old one stops showing. See [Changing a section safely](/developers/schema#changing-a-section-safely).

## What you may not do

- Write any file but `sections/<type>.storelib`, or change one of the library's built-in sections. Both are refused; see [Rules before you ship](/developers/rules#1-what-you-may-change).
- Invent an asset. Images are chosen by the creator through an `image_picker`; never put a URL to a picture into a default.
- Declare a capability the section does not need.
- Use `window`, `document`, `fetch`, `localStorage` or `eval`. They are refused when the file is saved; query inside `root` instead.
- Add a contact form's sender to the mailing list. Only a box they ticked may do that.

## The brief the builder's AI is given

When a creator asks the builder's AI to write a new section, this is the brief it receives, word for word. It is assembled from the same modules as this hub, so what you are reading is what it follows. If you follow it too, your sections and the builder's will be indistinguishable.

@[ai-brief]

Some reference is added only when a request is about it. These topics are included when the words in a request call for them:

@[ai-topics-extra]

## What the builder's AI does on a request

The Storelib AI in the website builder reads what kind of change a request is before it looks at the page, and works to that:

- **A whole site** ("build a full website for my clothing brand"). It finishes the open page first, because that page sets the fonts, colours and buttons, then builds every other page the site needs as a draft with `build_page`, in one call each: the shop (`products`), the product page (`product`, built around its product section), `collections`, About, a FAQ, Contact, a lookbook. Each page is checked (section types, settings, contrast, limits) and refused with the reason when something is wrong. A backup of the site is taken before the first page is written, and nothing is live until the creator publishes. It then puts the pages in the menu. How many pages follows the brief: a one page landing stays one page.
- **Made again, or adjusted.** "Make the FAQ completely different, much more modern" is a rebuild: a new section of its own, with new markup, layout, motion and a full set of controls, put where the old one was, carrying over the real questions and answers. "Make the FAQ a bit cleaner" keeps the section and moves its look.
- **A new page** ("add a size guide page") is built with `build_page` and linked in the menu.
- **Left alone.** "Keep the header", "don't touch the pricing" are kept, even inside a redesign.
- **One value, everywhere.** "Update my logo everywhere" is changed once where it lives (the theme's logo, the store's name, the socials), never typed into each section.
- **A picture to match.** "Make it exactly like this screenshot" with a picture is measured: the page is photographed at the picture's width (a phone, a tablet or a computer) and scored against it out of 100, on tone, layout and colour, region by region. Below 82 the AI is told where it differs, with both pictures, and repairs, up to three rounds. A score that stays low is said in the reply. It is a measure of likeness, not a promise of pixel identity: their own photographs and copy are theirs to supply.
- **Three widths.** Every big change is drawn in a browser at 1440, 834 and 390 wide and measured for sideways scroll, collapsed and clipped sections, overlapping text and empty bands, then fixed.
- **Its own cart, menus and search.** It may draw a cart drawer, navigation and product cards of its own design ([A cart of your own](/developers/header-and-footer)), on the site's live cart, menus and products.

Every run is recorded as one row of facts in `storelib_ai_runs`, read by the owner at /admin/ai-runs, (kind of request, changes, pages built, checks still failing, time, model), never the words of the request: `supabase/sql/RUN_STORELIB_AI_BUILDER.sql` creates it, and `CHECK_STORELIB_AI_BUILDER.sql` says whether a database has everything the builder needs.

## The models Storelib AI runs on

Storelib AI in the builder runs on ChatGPT. The model menu beside the message box offers two, each with a line on what it is for:

| Model | Best for |
| --- | --- |
| GPT-5.6 Luna | Quick edits, copy and colours. The default. |
| GPT-5.6 Terra | New sections, whole pages and code. A request that is plainly a build moves up to it on its own, and the chat says so. |

**Strength**, in the same menu, is how long the model thinks before it acts: Light, Standard or Deep, sent to OpenAI as low, medium and high reasoning effort. Standard is right for most requests. Deep is for a hard change, a whole page or code; Light for a word, a colour or a setting.

Whatever goes wrong with a model call, the chat says it in a sentence, such as "Storelib AI is unavailable right now. Try again in a few minutes.", and never shows the provider's own error. A creator can run Storelib AI on their own OpenAI key from Website settings › Connections, and those edits do not count against the plan's AI edits.

## Setting up your agent

**Claude Code.** Add this to the `CLAUDE.md` at the root of your theme folder:

```md
This is a Storelib theme. Sections are .storelib files written in the
Storelib Builder Framework. Before writing or changing any file under
sections/, read https://storelib.com/llms-full.txt and follow
https://storelib.com/developers/ai. A section's script runs in a
sandbox against a copy of its own markup: prefer HTML and CSS.
```

**Codex.** Put the same paragraph in `AGENTS.md` at the root of the theme folder.

**Cursor.** Type `@Docs`, choose Add new doc, and give it `https://storelib.com/llms-full.txt`. Mention it with `@Docs` whenever you ask for a section, or add the paragraph above to a rule in `.cursor/rules`.

**ChatGPT, Claude.ai and others.** Give it the link, or download [llms-full.txt](/llms-full.txt) and attach it, and ask for "a Storelib section, as one .storelib file".

## Two ways to connect

| | Through GitHub | Direct connection |
| --- | --- | --- |
| What it is | The site's whole theme lives in a repository you own: settings, pages, header and footer, sections and blocks. | A token that lets an agent on your computer read and save the site's sections. |
| How a change arrives | The agent pushes to the branch. Storelib checks every changed file the way the builder does and saves it as a draft. | The agent calls `storelib_write_section`. |
| Best for | Claude Code or Codex working in a repository, a team, a history of every change. | One person and one agent, nothing to set up on GitHub. |
| What you see | The change in the builder within seconds, and a Storelib check on the commit. | The change in the builder within seconds. |

Both reach one site and nothing else, both save drafts that go live only when you publish, and both are under **Website Settings › Connections** in the builder, which the plug button in the top bar (**Connect Claude Code, Codex or ChatGPT**) opens. Pick your tool there and it shows only the steps for it.

**ChatGPT** works through GitHub. Codex in ChatGPT edits a GitHub repository, so link one below, ask Codex for the change, and merge it into the linked branch: it reaches the site like any other push.

## Connect through GitHub

1. In the builder, press the plug button in the top bar, or open **Website Settings › Connections**.
2. Press **Connect GitHub**. GitHub asks which repositories to give Storelib; pick one, or make an empty one first.
3. Back in the builder, pick the repository, the branch (its default branch unless you say otherwise; a branch that is not there yet, such as `storelib`, is made, which is the way round a protected `main`) and, if the site should live in a folder of a bigger repository, the folder. Press **Link and send the theme**.

Storelib writes one commit into the repository: the whole theme. `config/settings.json` (the theme's settings), `templates/<page>.json` (each page's sections), `sections/header-group.json` and `footer-group.json` (the header and footer, once), every section and block under `sections/` and `blocks/`, Storelib's built-in ones included, and for an imported theme its snippets, layout and its own files under `shopify/`. A `README.md` says what each folder is and which ones Storelib reads back, and an `AGENTS.md` and a `CLAUDE.md` tell an agent the rules. From then on:

- **Push a change** on that branch and every changed theme file is saved to the site as a draft, through the same checks the builder runs: a section or block is compiled, a page or the settings are cleaned and held to the page limits. An open builder shows it within a few seconds, and reads a changed page or the settings again unless you have an edit there not saved yet.
- **Every push gets a status** named Storelib on its commit, and when a file was not taken, a comment listing each one with its line and what to fix. Nothing else in the push is held back by a bad file. The builder lists the same under GitHub in Connections.
- **A built-in section can be edited in place**, such as `sections/hero.storelib`. It becomes this site's own copy, drawn on this site only, marked Edited in GitHub in the builder with **Reset to Storelib's version**. In an imported theme every section is the theme's own and is changed in place. Its settings, blocks and presets are the `shopify` part of its schema: change them there, and the builder's settings panel is made again from it when the push comes in. The theme settings are `shopify/config/settings_schema.json`, read the same way.
- **A section's settings are its `<schema>`.** Add, change or remove one there and the section's panel in the builder follows. A Storelib theme's own theme settings (`config/settings_schema.json`) are the same on every Storelib theme and for reading: change their values in `config/settings.json`.
- Files outside the theme's folders are yours and ignored. Deleting a section file on GitHub does not remove the section from the site, because a page may be using it, and deleting a page file does not delete the page.
- **Push**, in Connections, writes the whole theme into the repository again; Storelib also does this after every Publish. Only files GitHub does not already have are sent.
- **Pull** takes every theme file on the branch that differs from the site, compared by Git's own file ids, so only those are fetched.
- At most 400 files are taken from one push; **Pull** takes the rest. Storelib's own commits are recognised and not synced back.

With Claude Code, the whole loop is a conversation: open the repository, ask for the section, and let it commit and push.

```bash
git clone https://github.com/you/your-site && cd your-site
claude "Add a pricing section with three tiers to sections/, then commit and push"
```

## Connect an agent directly

An agent can work on a site directly: read the project and the section the creator has selected, change settings and pages, write sections, run the checks and preview the drafts. The creator connects it once, from the builder.

1. Open the site in the website builder, then **Website Settings › Connections**, and pick **Claude Code** or **Codex**.
2. Name the connection, for example "Claude Code", and press **Connect**.
3. Copy the token it shows. It is shown once. Storelib keeps only its hash, so a lost token is disconnected and replaced, never recovered.

**Claude Code.** Run this in a terminal, with the token in place of `slb_...`:

```bash
claude mcp add --transport http --scope user storelib https://mcp.storelib.com --header "Authorization: Bearer slb_..."
```

**Codex.** Add this to `~/.codex/config.toml`, and set the environment variable `STORELIB_TOKEN` to the token (`export STORELIB_TOKEN="slb_..."` in the terminal you start Codex from):

```toml
[mcp_servers.storelib]
url = "https://mcp.storelib.com"
bearer_token_env_var = "STORELIB_TOKEN"
```

**Anything else** that speaks MCP over HTTP takes the same address and header. An agent or script that does not speak MCP can use the same token with plain HTTP, below.

### What arrives with the connection

When Claude Code or Codex connects, the server's instructions put the [agent rules](/developers/rules) in the model's context: the workflow (inspect, plan, implement, test, repair) and the edges of what it may change. Nobody has to paste them. The same rules are the `storelib-rules` prompt, the `storelib://rules` resource and the `storelib_rules` tool, and Storelib AI in the builder works by them too.

For the task itself, `storelib_skills` with the task in the agent's own words returns only the skills it needs: the steps, the tools, the part of the framework involved, what goes wrong, and the checks that say it is done. The `storelib-task` prompt gives the rules and those skills together.

### The tools

| Tool | What it does |
| --- | --- |
| `storelib_rules` | The agent rules, then [Rules before you ship](/developers/rules) in full. |
| `storelib_skills` | The skills for a task: pass `task` in plain words, or `id` for one. |
| `storelib_read_project` | The site brief, every page, the creator's own section types, and what is open in the builder. |
| `storelib_read_page` | One page's sections in order, with ids, settings and blocks. Defaults to the page open in the builder. |
| `storelib_read_selected_section` | The section selected in the builder, or one by id: every control it has, its values and blocks, and whether its file can be changed. |
| `storelib_search_components` | The sections this site can use, built in and the creator's own, ranked for what you are looking for. |
| `storelib_create_section` | Saves a new section file and, with `page`, places it there. Refused with what to fix unless it compiles and passes the quality checks. |
| `storelib_edit_section` | Saves a change to a section file the creator has, with `base_updated_at`. The previous version is kept. |
| `storelib_patch_section` | The same, as find-and-replace `edits` instead of the whole file. Each `find` is in the file exactly once. Checked and saved exactly as `storelib_edit_section`, for a fraction of the tokens. |
| `storelib_update_styles` | Settings on a section, a block or the theme: colour scheme, button colours and hover, spacing, alignment, type. Checked against what the section declares. |
| `storelib_create_page` | A new page with the site's header and footer and the sections listed. |
| `storelib_create_safe_patch` | Several page operations as one change. All are checked first; if one is refused, nothing is written. A restore point is taken before it is applied. |
| `storelib_run_tests` | Compile and quality for a file; section types, settings, contrast and limits for a page. |
| `storelib_run_preview` | A link to the page as the drafts make it, the builder link, and the page checks. |
| `storelib_guide`, `storelib_site`, `storelib_list_files`, `storelib_read_file`, `storelib_compile`, `storelib_write_section` | The framework, the site brief, and the section files, as before. |

The loop that works: read the project and the selected section, get the skills for the task, change settings where a setting does it and write a file only where it does not, patch the lines that change rather than resending a file, run the tests, and preview. When changing a file that exists, pass the `updated_at` you read as `base_updated_at`, and a save made elsewhere in the meantime is refused rather than overwritten.

When a fact that changes the result is missing and no tool has it (which product to feature, which page, brand colours the site does not have, a business fact), ask the person you are working with one short question with a few options, and wait. Never ask what `storelib_site` or the page can tell you. `storelib_site` lists the published products with every field of the [product data](/developers/selling#products-reach-a-section-as-products), including each one's `checkout_url` and options.

### What a connection can and cannot do

- It reaches **one site**. Not the creator's other sites, orders, buyers, subscribers or account. It sees the site's published products only as a visitor does: title, prices, pictures, options, address and buy link. No argument to any tool names a site; the token decides it.
- It writes **section files** as `sections/<type>.storelib`, lower case, digits, `_` and `-`, and **never changes a built-in section**: a different version is written as a new section. Paths with `../`, a leading `/` or another folder are refused.
- It changes **pages and settings only through the page tools**, which refuse a setting a section does not declare or a value its control cannot take. Before every page or theme change a restore point of the whole site is taken, listed in Website Settings › Backups.
- **Every change is a draft**. Nothing reaches visitors until the creator publishes. It cannot publish, and it cannot delete a page or a section file.
- **The builder follows along.** A change to a page appears in a builder that is open, in place, without a reload; a new section file without a page appears on the page the creator has open. Page changes need `RUN_AGENT_MCP.sql` to have been run on the database.
- `storelib_run_tests` runs checks over the site's rows. It runs no command and reaches nothing on the server.
- The creator can disconnect it at any time; the token stops working on its next request.

### Over plain HTTP

Every request carries `Authorization: Bearer slb_...`.

| Request | Does |
| --- | --- |
| `GET /api/agent/v1/site` | What the website is, as `storelib_site` answers it. |
| `GET /api/agent/v1/files` | Lists the theme's files. |
| `GET /api/agent/v1/files?path=sections/x.storelib` | Reads one. |
| `POST /api/agent/v1/compile` with `{ "path", "source" }` | Compiles without saving. `422` with `errors` when it does not compile. |
| `PUT /api/agent/v1/files` with `{ "path", "source", "base_updated_at"? }` | Saves a section as a draft. |

```bash
curl -X PUT https://storelib.com/api/agent/v1/files \
  -H "Authorization: Bearer slb_..." -H "Content-Type: application/json" \
  -d '{"path":"sections/price_table.storelib","source":"<template>..."}'
```

## Without a connection

- **One section.** Open the code editor in the website builder, create `sections/<type>.storelib`, paste the file and save. It compiles, appears in Add Section, and can be placed on any page.
- **A whole theme.** Export the theme from your library as a `.storelib-theme.zip` file, unzip it, let the agent work on the folder, update `manifest.json` with the new hashes, zip the folder's contents and import it as a new draft website. The import checks every file and refuses the package with the reasons if anything is wrong, a stale hash included, so a broken edit never reaches a live site. [Editing a package by hand](/developers/sharing-themes#editing-a-package-by-hand) has the script and the zip command.

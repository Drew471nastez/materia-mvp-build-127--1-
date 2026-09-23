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

## Six things agents get wrong

These are the mistakes that produce a file which looks right and is not. Check each before you answer.

1. **A section's script runs against a copy.** It runs in a sandbox, and `root` is a copy of the section's own markup: toggle classes, set styles and text, add listeners, and the page mirrors each change. It cannot add or remove elements, measure layout, or set `src`, `href` or `on*`. Where HTML does it alone (`<details>`, radio inputs and `:checked`, scroll snapping, the `popover` attribute), use HTML. See [JavaScript](/developers/javascript).
2. **The template language is not Vue, React, JSX or Liquid.** `v-if`, `@click`, `:class`, `{% assign %}` and JSX braces are refused. It is `{{ }}`, `{% if %}`, `{% for %}`, `{# #}` and filters, and nothing else.
3. **Every name must be declared.** `{{ settings.subtitle }}` does not compile unless the schema declares `subtitle`. Check every path your template and CSS read against your schema.
4. **Repeated content is blocks.** Never `feature_1`, `feature_2`, `feature_3`.
5. **Colour comes from the scheme.** Declare a `color_scheme` setting and read `var(--scheme-*)`. A hex code for anything the scheme answers stops responding to the creator's theme.
6. **Container queries, not media queries.** The builder's phone preview is not the width of the window.

## Know the website before you write for it

A section written without knowing the site is a section from another website: the wrong colours, an invented product, a headline for a business nobody runs. Before writing, find out:

- **What it sells.** The published products, with their real titles and prices. Never invent a product, a price or a review. A connected agent reads them with `storelib_site`; the builder's AI is given them.
- **What it is called and what it says about itself.** The brand name, tagline, site title and description. Write copy in the same voice and the site's language.
- **How it looks.** The colour schemes and fonts. Use `var(--scheme-*)` and the theme's type styles, never a new palette.
- **What is already on the page.** The sections each page has, so a new one does not repeat the one above it.

Then read [Selling](/developers/selling) if the section shows a product, a price or a Buy button.

## An email box collects emails

A `<form>` with an `<input type="email">` in a section sends every address to the site creator's Subscribers. The page does it, with no script. Mark it `data-storelib-form="subscribe"`, and never write a script to submit a form or ask the creator to paste a mailing list URL to make it work. See [Forms](/developers/javascript#forms).

## The loop your output goes through

This is what the builder's own AI does with every section it writes, and it is the loop you should run yourself when you can:

@[ai-loop]

When you cannot run the compiler, the person will: the code editor compiles on save and shows each error as `file:line message`. Fix the line it names. Do not rewrite the file.

## Change content before source

Most requests are not new sections. "Make the heading bigger", "use the dark scheme", "add a fourth question" are changes to a section's **settings** or **blocks**, which the creator can make in the builder without new code. Write or change a section file only when no existing setting can do what was asked. When you do change one, change the least that does it, and never rename or remove a setting `id` without a `migrations` entry; see [Changing a section safely](/developers/schema#changing-a-section-safely).

## What you may not do

- Write outside `sections/`, `templates/`, `config/`, `layout/`, `snippets/` and `locales/`.
- Invent an asset. Images are chosen by the creator through an `image_picker`; never put a URL to a picture into a default.
- Declare a capability the section does not need.
- Use `window`, `document`, `fetch`, `localStorage` or `eval`. They are refused when the file is saved; query inside `root` instead.
- Add a contact form's sender to the mailing list. Only a box they ticked may do that.

## The brief the builder's AI is given

When a creator asks the builder's AI to write a new section, this is the brief it receives, word for word. It is assembled from the same modules as this hub, so what you are reading is what it follows. If you follow it too, your sections and the builder's will be indistinguishable.

@[ai-brief]

Some reference is added only when a request is about it. These topics are included when the words in a request call for them:

@[ai-topics-extra]

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
| What it is | The site's sections live in a repository you own. | A token that lets an agent on your computer read and save the site's sections. |
| How a change arrives | The agent pushes to the branch. Storelib compiles every changed section and saves it. | The agent calls `storelib_write_section`. |
| Best for | Claude Code or Codex working in a repository, a team, a history of every change. | One person and one agent, nothing to set up on GitHub. |
| What you see | The change in the builder within seconds, and a Storelib check on the commit. | The change in the builder within seconds. |

Both reach one site and nothing else, both save drafts that go live only when you publish, and both are under **Website Settings › Advanced** in the builder, which the plug button in the top bar (**Connect Claude Code, Codex or ChatGPT**) opens. Pick your tool there and it shows only the steps for it.

**ChatGPT** works through GitHub. Codex in ChatGPT edits a GitHub repository, so link one below, ask Codex for the change, and merge it into the linked branch: it reaches the site like any other push.

## Connect through GitHub

1. In the builder, press the plug button in the top bar, or open **Website Settings › Advanced**.
2. Press **Connect GitHub**. GitHub asks which repositories to give Storelib; pick one, or make an empty one first.
3. Back in the builder, pick the repository, the branch (its default branch unless you say otherwise) and, if the site should live in a folder of a bigger repository, the folder. Press **Link and send sections**.

Storelib writes one commit into the repository: every section file the site has, under `sections/`, and an `AGENTS.md` and a `CLAUDE.md` that tell an agent what the files are and how a push reaches the site. From then on:

- **Push a change** to `sections/<type>.storelib` on that branch and it is compiled and saved to the site as a draft. An open builder shows it within a few seconds; a new section is placed on the page being edited.
- **Every push gets a status** named Storelib on its commit: green with how many sections were saved, or red with the first error and its line. A file that does not compile is not saved, and nothing else in the push is held back by it.
- **Only `sections/*.storelib` is read.** Everything else in the repository is yours and ignored. Deleting a section file on GitHub does not remove the section from the site, because a page may be using it.
- **Send to GitHub**, in Connections, writes the site's current sections into the repository again, for instance after editing in the builder.
- At most 30 section files are taken from one push. Storelib's own commits are recognised and not synced back.

With Claude Code, the whole loop is a conversation: open the repository, ask for the section, and let it commit and push.

```bash
git clone https://github.com/you/your-site && cd your-site
claude "Add a pricing section with three tiers to sections/, then commit and push"
```

## Connect an agent directly

An agent can work on a site directly: list its files, read them, compile a section until it is clean, and save it. The creator connects it once, from the builder.

1. Open the site in the website builder, then **Website Settings › Advanced**, and pick **Claude Code** or **Codex**.
2. Name the connection, for example "Claude Code", and press **Connect**.
3. Copy the token it shows. It is shown once. Storelib keeps only its hash, so a lost token is disconnected and replaced, never recovered.

**Claude Code.** Run this in a terminal, with the token in place of `slb_...`:

```bash
claude mcp add --transport http storelib https://storelib.com/api/mcp --header "Authorization: Bearer slb_..."
```

**Codex.** Add this to `~/.codex/config.toml`, and set the environment variable `STORELIB_TOKEN` to the token (`export STORELIB_TOKEN="slb_..."` in the terminal you start Codex from):

```toml
[mcp_servers.storelib]
url = "https://storelib.com/api/mcp"
bearer_token_env_var = "STORELIB_TOKEN"
```

**Anything else** that speaks MCP over HTTP takes the same address and header. An agent or script that does not speak MCP can use the same token with plain HTTP, below.

### The tools

| Tool | What it does |
| --- | --- |
| `storelib_guide` | This framework, in full. Read it before writing a section. |
| `storelib_site` | What this website is: its name and address, brand, title and description, fonts and colour schemes, the sections on each page, and its published products with their prices and ids. Read it before writing, so the section fits this site. |
| `storelib_list_files` | Every file of the site's theme, marked `yours` or `theme`. |
| `storelib_read_file` | One file, the saved draft where there is one, with its `updated_at`. |
| `storelib_compile` | Compiles a section without saving it, and answers `file:line message` for every error. |
| `storelib_write_section` | Saves a section as a draft. It is compiled first and refused with its errors if it does not compile. |

The loop that works: read the guide and the site, write the file, compile it until it is clean, then save it. When changing a file that exists, pass the `updated_at` you read as `base_updated_at`, and a save made elsewhere in the meantime is refused rather than overwritten.

### What a connection can and cannot do

- It reaches **one site**. Not the creator's other sites, orders, buyers, subscribers or account. It sees the site's published products only as a visitor does: title, price, picture and address.
- It writes **section files only**: `sections/<type>.storelib`, lower case, digits, `_` and `-`. Templates, settings and layout are the creator's.
- **Every save is a draft**, held to exactly the rules a save in the code editor is: it must compile, and its name must be free. Nothing reaches visitors until the creator publishes.
- It cannot delete, rename or publish anything.
- **A new section appears on the page the creator has open** in the builder, above the footer, labelled with the connection's name. If the builder is closed it waits in Add Section, under Created by you.
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
  -d '{"path":"sections/pricing.storelib","source":"<template>..."}'
```

## Without a connection

- **One section.** Open the code editor in the website builder, create `sections/<type>.storelib`, paste the file and save. It compiles, appears in Add Section, and can be placed on any page.
- **A whole theme.** Export the theme from the builder as a `.storelib-theme` file, unzip it, let the agent work on the folder, zip it and import it. The import checks every file and refuses the package with the reasons if anything is wrong, so a broken edit never reaches a live site.

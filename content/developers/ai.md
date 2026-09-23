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

1. **Section scripts do not run yet.** A `<script>` is checked and stored, and never executed. A slider, tab set or toggle written in JavaScript does nothing for a visitor. Build interactions with HTML and CSS: `<details>`, radio inputs and `:checked`, scroll snapping, the `popover` attribute. See [JavaScript](/developers/javascript).
2. **The template language is not Vue, React, JSX or Liquid.** `v-if`, `@click`, `:class`, `{% assign %}` and JSX braces are refused. It is `{{ }}`, `{% if %}`, `{% for %}`, `{# #}` and filters, and nothing else.
3. **Every name must be declared.** `{{ settings.subtitle }}` does not compile unless the schema declares `subtitle`. Check every path your template and CSS read against your schema.
4. **Repeated content is blocks.** Never `feature_1`, `feature_2`, `feature_3`.
5. **Colour comes from the scheme.** Declare a `color_scheme` setting and read `var(--scheme-*)`. A hex code for anything the scheme answers stops responding to the creator's theme.
6. **Container queries, not media queries.** The builder's phone preview is not the width of the window.

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
- Use `window`, `document`, `fetch`, `localStorage` or `eval`, even in a script that is not run yet. They are refused when the file is saved.
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
https://storelib.com/developers/ai. Section scripts do not run yet:
build interactions with HTML and CSS.
```

**Codex.** Put the same paragraph in `AGENTS.md` at the root of the theme folder.

**Cursor.** Type `@Docs`, choose Add new doc, and give it `https://storelib.com/llms-full.txt`. Mention it with `@Docs` whenever you ask for a section, or add the paragraph above to a rule in `.cursor/rules`.

**ChatGPT, Claude.ai and others.** Give it the link, or download [llms-full.txt](/llms-full.txt) and attach it, and ask for "a Storelib section, as one .storelib file".

## Getting an agent's work onto a site

Today, there are two ways:

- **One section.** Open the code editor in the website builder, create `sections/<type>.storelib`, paste the file and save. It compiles, appears in Add Section, and can be placed on any page.
- **A whole theme.** Export the theme from the builder as a `.storelib-theme` file, unzip it, let the agent work on the folder, zip it and import it. The import checks every file and refuses the package with the reasons if anything is wrong, so a broken edit never reaches a live site.

Connecting an agent to a site directly, so it can read and write the theme's files itself, is not available yet. When it is, it will use exactly the files, compiler and errors described here.

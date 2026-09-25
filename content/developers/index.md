# Storelib Developer Hub

Storelib websites are built from sections, and every section is written in one language: the **Storelib Builder Framework**. This hub is its complete reference, a guide to the website builder that runs it, and everything around it: themes and how they are shared, the values a section reads, publishing, and connecting an AI agent to a site.

The same language is read by everyone who builds here. A creator in the code editor, the builder's own AI, and whatever you bring with you, whether that is Claude Code, Codex, ChatGPT or Cursor, all write the same files through the same compiler and get the same errors back. There is no second format for machines and no private dialect for the platform's own sections: the sections in the library are written in exactly what these pages describe.

@[hub-map]

## Build your first section

1. **Open the code editor.** In your dashboard, open **Websites**, then **Edit website**, and choose **Code** in the builder's top bar. On a phone, it is **View code** in the **…** menu.
2. **Make the file.** Choose **New file** and call it `sections/notice.storelib`. The editor saves a starter section that already compiles.
3. **Write the section.** Replace the starter with the file below and press **Save**. If it does not compile, nothing is saved, and each error is listed with its line.
4. **Place it.** Switch back to **Preview**, press **Add section**, and pick **Notice bar** under **Created**. Its settings panel is its schema, drawn.
5. **Publish.** The file and the page are drafts until you press **Publish**, and then they go live together.

This is a complete, working section. It reads its colours from the colour scheme the creator picks, its message and link from settings, and it appears in Add Section because its schema has a preset.

```storelib
<template>
<section class="notice" data-scheme="{{ settings.color_scheme }}">
  <p class="notice__text">{{ settings.message }}</p>
  {% if settings.link_url != "" %}
    <a class="notice__link" href="{{ settings.link_url | url }}">{{ settings.link_text }}</a>
  {% endif %}
</section>
</template>

<style>
.notice { container-type: inline-size; display: flex; flex-wrap: wrap; gap: 8px 16px;
  justify-content: center; padding: 14px 24px; background: var(--scheme-background); }
.notice__text { margin: 0; color: var(--scheme-text); font-size: 14px; }
.notice__link { color: var(--scheme-link); font-size: 14px; font-weight: 600; }
</style>

<schema>
{
  "type": "notice",
  "name": "Notice bar",
  "category": "Promotion",
  "settings": [
    { "type": "text", "id": "message", "label": "Message", "default": "Free shipping on orders over $50" },
    { "type": "text", "id": "link_text", "label": "Link text", "default": "Shop now" },
    { "type": "url", "id": "link_url", "label": "Link", "default": "" },
    { "type": "color_scheme", "id": "color_scheme", "label": "Colour scheme", "default": "dark" }
  ],
  "presets": [{ "name": "Notice bar" }]
}
</schema>
```

Four blocks: markup, scoped CSS, an optional script, and a schema that declares every setting the markup reads. That is the whole format. Next, read [Sections](/developers/sections) for the template language and [Schema](/developers/schema) for every setting type, or copy one of the [Examples](/developers/examples).

## Building with an AI agent

Point the agent at [storelib.com/llms.txt](/llms.txt). It is a map of this hub in the plain format agents read, and [llms-full.txt](/llms-full.txt) is every page in one file. [Rules before you ship](/developers/rules) is what an agent follows on a Storelib site, and [Building with AI agents](/developers/ai) connects Claude Code or Codex to one, through GitHub or directly over MCP.

## Not built yet

Where part of the framework is specified but not live, the page says so plainly. In one place:

- **A public theme store.** Themes are shared as files. See [Sharing themes](/developers/sharing-themes).
- **`allowed_templates` and `disabled_templates`.** Validated and kept; Add Section offers every section on every page.
- **`migrations`.** Validated and kept; nothing renames a stored setting yet. See [Changing a section safely](/developers/schema#changing-a-section-safely).
- **The `commerce`, `analytics` and `forms` script capabilities.** Declaring them is accepted; their functions are not on `storelib` yet. See [JavaScript](/developers/javascript#capabilities).
- **A stylesheet for the whole site**, and the `layout`, `snippets` and `locales` folders. Every section's CSS is scoped to it.
- **Preview links for a website that is not live.** A preview link shows the drafts of the live website. See [Preview links](/developers/sharing-themes#preview-links).
- **Sold out on product cards.** A product's `tag` is always empty today. See [Dynamic values](/developers/dynamic-values#products).

Limits are in [Publishing and checks](/developers/publishing#limits), and changes to the framework in the [changelog](/developers/changelog).

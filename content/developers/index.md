# Storelib Developer Hub

Storelib sites are built from sections, and every section is written in one language: the **Storelib Builder Framework**. This hub is its complete reference, and a guide to the website builder that runs it.

The same language is read by everyone who builds here. A creator in the code editor, the builder's own AI, and whatever you bring with you, whether that is Claude Code, Codex, ChatGPT or Cursor, all write the same files through the same compiler and get the same errors back. There is no second format for machines and no private dialect for the platform's own sections: the thirty sections in the library are written in exactly what these pages describe.

Where part of the framework is specified but not live yet, the page says so plainly. Nothing here describes a feature you cannot use today without saying that it is not live.

## A section, whole

This is a complete, working section. Save it as `sections/notice.storelib` and it compiles, appears in Add Section, and draws its own settings panel.

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

Four blocks: markup, scoped CSS, an optional script, and a schema that declares every setting the markup reads. That is the whole format.

## Start here

1. **[How the builder works](/developers/builder)**. Themes, pages, sections and blocks, what is stored where, and what happens between saving a file and a visitor seeing it.
2. **[Sections](/developers/sections)**. The `.storelib` file and the template language: output, conditions, loops, filters, and what the compiler refuses.
3. **[Blocks](/developers/blocks)**. Repeatable content inside a section, and the rules for declaring, rendering and limiting it.
4. **[Schema](/developers/schema)**. Every setting type, every key a schema can carry, and the order a value is resolved in.
5. **[Styling](/developers/styling)**. How CSS is scoped, container queries, colour schemes and the theme's type scale.
6. **[JavaScript and forms](/developers/javascript)**. What a section may do without script, how forms and embeds work, and the scripting API.
7. **[Examples](/developers/examples)**. Complete sections, each compiled by the test suite on every change.

## Building with an AI agent

Point the agent at [storelib.com/llms.txt](/llms.txt). It is a map of this hub in the plain format agents read, and [llms-full.txt](/llms-full.txt) is every page in one file. The [AI guide](/developers/ai) is written for the agent itself: the rules it must follow, the checks its output has to pass, and the exact reference the builder's own AI is given.

## The framework in numbers

@[limits]

Changes to the framework are recorded in the [changelog](/developers/changelog).

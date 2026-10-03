# Rules before you ship

Read this before you write or change any code on a Storelib site. It applies to every agent: Claude Code, Codex, ChatGPT through GitHub, Cursor, and the builder's own AI. Each rule is enforced by the platform or checked by its tests, so code that breaks one is refused, or looks broken on the creator's site.

## 1. What you may change

- **Section files only.** You write `sections/<type>.storelib`, in lower case with digits, `_` and `-`. Templates, config, layout, snippets and assets are the theme's core. Writes to them are refused.
- **Never a built-in section.** The sections Storelib ships (header, footer, hero, product page, FAQ and the rest of the library) are what every site is built from. You can read them. A write to one is refused. To change how one works, write a **new** section beside it, such as `sections/hero_custom.storelib`, with the same settings so nothing the creator filled in is lost. Then tell the creator they can use it in place of the built-in one.
- **Everything you save is a draft.** Nothing reaches a visitor until the creator presses Publish, and every save keeps a version.
- **One site.** A connection reaches one website. It cannot reach orders, buyers, subscribers or the account, and it cannot delete, rename or publish anything.

`storelib_list_files` marks every file `writable: true` or `false`. Trust it.

## 2. Know the framework first

- Read [Building with AI agents](/developers/ai) and the full reference at [/llms-full.txt](/llms-full.txt). Call `storelib_site` to learn what this website sells, what it is called, and how it looks.
- A section is one file with four blocks: `<template>`, `<style>`, an optional `<script>`, and `<schema>`. The template language is `{{ }}`, `{% if %}`, `{% for %}` and filters. It is not Vue, JSX or Liquid.
- Every value the creator might change is a **setting** in the schema. Every repeated thing is a **block**. A template reads only what its schema declares.
- Compile before you save (`storelib_compile`). Fix the exact line the compiler names; don't rewrite the file.

## 3. Everything the creator sees must be editable

The creator edits a section in the builder's sidebar, as they would in Shopify. If a word, a picture or a link is typed straight into the markup, they cannot change it.

- **Text** is a `text`, `textarea` or `richtext` setting. Print `richtext` with `| raw`; everything else is escaped for you.
- **Pictures** are `image_picker` settings, never a `text` or `url` setting holding an address. The creator gets the image picker with an address box under it. Never put a URL to a picture in a default.
- **Every link and every button** has two settings: a `text` label and a `url` link. Read the link through the filter, `href="{{ settings.button_url | default: '#' | url }}"`. A `url` setting gives the creator the link picker, with their pages and products in it.
- **A menu** is one `link_list` setting, defaulting to `main-menu`, so the creator picks one of the site's menus from Website settings › Navigation. Never `link_1_label` and `link_1_url` pairs. Links that belong to this section alone, such as a row of resources, are blocks, one per link.
- **Colour** comes from the colour scheme, and each element has a colour setting that follows it. Declare a `color_scheme` setting and a `color` setting per element defaulting to a scheme colour, and use `var(--s-*)`. Don't use hex codes for anything the scheme covers.
- **The logo, the store name and the social links** are read from the theme, `theme.logo.url`, `shop.name`, `shop.socials`, never asked for again.

The [page links example](/developers/examples#page-links) does all of this.

## Native, not pasted in

A section an agent writes is checked before it is saved, and refused with the fix if it does not plug into the theme the way the built-in sections do. The same check runs for Storelib AI, Claude Code and Codex over MCP, the agent API, and a push from GitHub:

- **Colour scheme.** A `color_scheme` setting, `data-scheme="{{ settings.color_scheme }}"` on the outermost element, and colours read from the scheme. No fixed colours, except white or black over a picture.
- **Type.** No font names. Headings take `var(--section-heading-size)`, `var(--section-heading-weight)` and the theme's heading font.
- **Buttons.** Painted from the scheme's button keys, with a `:hover` from its hover keys, so Theme settings › Buttons and the section's scheme apply.
- **Spacing.** `padding_top` and `padding_bottom` range settings, used for the section's padding.
- **Words, links and pictures.** Every one a setting or a block. Prompts inside `{% if page.in_editor %}` are fine.
- **The right type.** A picture declared as `text` or `url` is refused with the `image_picker` to use, and links typed out as numbered pairs with the `link_list` to use.
- **A header of its own** says `"kind": "header"` and reads its menu from a `link_list`. Any other header, nav bar or footer is refused.
- **Phones.** Nothing wider than a phone without a `@container` rule that changes it.

`storelib_run_tests` runs the same check, so a file that tests clean is a file that saves.

## 4. Copying a page from a screenshot

When you are given a screenshot or a URL to copy:

1. **Split it into sections**, top to bottom: header, hero, features, testimonials, pricing, FAQ, footer, whatever is there. Each becomes its own file with its own schema. Never write a whole page as one section.
2. **Look for a built-in section first.** If the site already has a section that does the job (a hero, an FAQ, product cards), its settings are the change, not a new file.
3. **Give each new section a full schema.** Every heading, paragraph, image, button and link from section 3 above, with defaults taken from the screenshot so it looks right the moment it is added.
4. **Do not build the header or footer.** The site has one of each, built in, with the cart drawer, search, account, phone menu and sticky behaviour already working. Copy the screenshot's header into the real one: its layout, sticky and transparent settings, its icons, its button, and its links as `nav_link` blocks. A section file that is a header, a navigation bar or a footer is refused. See [Changing the header](#changing-the-header).
5. **Use the site's own words and products**, from `storelib_site`. Never invent a product, a price, a review or a statistic.

## 5. Menus, dropdowns, modals and bottom sheets

The builder draws the site inside a canvas in the editor, and the section must work there and on the live site.

- **Open things with HTML, not script**: `<details>` for disclosure, radio inputs with `:checked` for tabs, and `popovertarget` with `popover` for menus, sheets and dialogs. The browser handles Escape, tap outside and focus for you. In the builder, a popover opens inside the canvas.
- **A phone menu is a sheet**: `popover`, positioned with `inset`, `height: 100%`, `overflow-y: auto`, `overscroll-behavior: contain`, and `env(safe-area-inset-bottom)` padding at the foot. Style its open state with `:popover-open`.
- **A dropdown** is positioned `absolute` under the thing that opens it, inside the section. It hangs over the next section on its own; don't raise it with an enormous `z-index`.
- **Set `aria-expanded`** on a menu button when a script opens the menu.
- **`position: fixed`, `100vh` and `100vw`** are the canvas's in the builder and the window's on the live site. Use them for overlays and full-screen menus, and nothing else.
- Never write `<style>`, `<link>`, `<base>` or `<meta>` inside the template. They act on the whole page, and a save refuses them.

## 6. Motion

- Animate `opacity` and `transform` only. They are cheap, and they don't move anything else on the page.
- Keep it short and settled: 150 to 300ms, on an easing that lands, such as `cubic-bezier(0.32, 0.72, 0, 1)`. Nothing bounces, loops or moves on its own.
- An entrance plays once, when the section scrolls into view. Nothing animates on every scroll.
- Everything that moves stops under `@media (prefers-reduced-motion: reduce)`.
- Height from `0` to `auto` does not transition. Animate `grid-template-rows` from `0fr` to `1fr` instead.

## 7. Phones and iOS

- **Build the phone layout first**, then widen with `@container (min-width: …)`. Put `container-type: inline-size` on the section's root.
- **Never scroll sideways.** Use `minmax(0, 1fr)` rather than `1fr`, `min-width: 0` on flex children, and `overflow-wrap: anywhere` on long words.
- **Tap targets are at least 44px** high.
- **Inputs are 16px** or larger, or iOS zooms the page when one is tapped.
- **Respect the safe area**: `env(safe-area-inset-*)` on anything pinned to an edge of the screen.
- **Images** carry `width`, `height` or an `aspect-ratio`, so nothing jumps as they load. Use `loading="lazy"` except in the first screen.
- **No hover-only features.** A phone has no hover, so anything that only appears on hover is missing there.

## 8. What good looks like

Storelib sites should look like they were made by a person with taste, not produced by a generator.

- **Start from what the visitor needs.** Remove before you add: every badge, icon, divider and line of copy has to earn its place.
- **No generic AI styling.** No purple gradients, glassmorphism, bento grids of identical cards, giant empty heroes, pills everywhere, an icon beside every label, or cards inside cards.
- **Specific, plain copy.** Say what the thing is and what happens. Never write `unlock`, `elevate`, `seamless`, `powerful`, `effortlessly`, `supercharge` or `transform`, and don't use em dashes.
- **Use the theme.** Its type styles (`var(--type-h2-size)`, `var(--theme-font-heading)`), its radii (`var(--theme-button-radius)`), its page width (`var(--theme-page-width)`) and its colour schemes. A section that brings its own palette looks pasted in.
- **Real content, real states.** Empty states appear only in the builder (`{% if page.in_editor %}`), and the live site shows nothing rather than a placeholder.

## 9. Before you say it is done

1. It compiles with no errors, and `storelib_compile` is clean.
2. Every visible word, picture, link and button is a setting or a block.
3. It works at 375px, with no sideways scroll, 44px targets and 16px inputs.
4. Menus, sheets and dialogs open and close with a tap, Escape and a tap outside.
5. Motion stops under reduced motion.
6. It uses the site's colour scheme and fonts, and the site's real products.
7. You changed no built-in section and no file outside `sections/`.

Then say what you changed in one or two plain sentences, and remind the creator it is a draft until they publish.

## Changing the header

The header and the footer are the site's own sections, of type `header` and `footer`. Connect to them: they are changed, never rewritten. The logo and store name are theme settings (`logo_url`, `brand_name`), which both already show. Only a creator who asks for a header of their own gets one new section, with `"kind": "header"`; see [A header of your own](/developers/header-and-footer#a-header-of-your-own). Over MCP, one `storelib_create_safe_patch` makes the header sticky on scroll up, gives it a button, and adds a link with a sub-link:

```json
{
  "page": "home",
  "label": "Header like the screenshot",
  "ops": [
    { "op": "update_section", "section_id": "<the header's id>", "settings": { "header_sticky_enabled": true, "header_sticky_on_scroll_up": true, "show_cta_button": true, "cta_text": "Shop now", "cta_url": "/products" } },
    { "op": "add_block", "section_id": "<the header's id>", "block_type": "nav_link", "settings": { "label": "Courses", "url": "/products" } }
  ]
}
```

A sub-link is a `nav_link` whose `parent_id` is its parent link's block id. Read the header first with `storelib_read_page` for its id and its links. Every setting the header and footer take is in [The header and footer](/developers/header-and-footer).

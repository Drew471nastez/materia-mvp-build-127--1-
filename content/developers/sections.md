# Sections

A section is one file, `sections/<type>.storelib`, that describes a section type completely: how it looks, how it is styled, what a creator can change about it, and what it does. It has four blocks, in any order, at most one of each.

| Block | Required | What it holds |
| --- | --- | --- |
| `<template>` | yes | The markup, in the template language below. |
| `<style>` | no | CSS for this section's instances only. `<style scoped>` means the same thing. See [Styling](/developers/styling). |
| `<script>` | no | Behaviour. Checked when saved, then **run in a sandbox** against a copy of the section. See [JavaScript](/developers/javascript). |
| `<schema>` | yes | JSON: the section's identity, settings, blocks and presets. See [Schema](/developers/schema). |

## Rules the parser enforces

- A block's opening and closing tags count only when they start a line. `</style>` inside a string in the template is text, not the end of the style block.
- A second `<template>`, or a second of any block, is refused, naming the line of the first.
- A block that is never closed is refused at the line it opened.
- A file without `<template>` or `<schema>` is refused.
- Outside the four blocks, only blank lines, `{# … #}` comments and lines starting `<!--` may appear. A `{# #}` comment above the blocks is where a section explains itself; it never reaches a page.
- A file is at most 512 KB.
- There is no unscoped CSS in a section, and no stylesheet for the whole site that you can write yet.

## The template language

The template is HTML plus output, conditions, loops and comments. It is **not** Vue, React, JSX or Liquid, although it looks like Liquid: `v-if`, `@click`, `:class` and JSX braces are refused by the compiler. It is compiled to a tree and walked, with no `eval` anywhere in it, which keeps rendering deterministic: the same file and the same settings always give the same markup, in the builder and on the live site.

```storelib
<h2>{{ settings.heading }}</h2>

{% if settings.show_subheading and settings.subheading != "" %}
  <p>{{ settings.subheading }}</p>
{% elsif settings.show_subheading %}
  <p>No subheading yet</p>
{% endif %}

<ul>
{% for block in blocks %}
  <li data-block-id="{{ block.id }}" class="{% if forloop.first %}is-first{% endif %}">
    {{ forloop.index }}. {{ block.settings.title | upcase }}
  </li>
{% else %}
  <li>Add an item</li>
{% endfor %}
</ul>

{# A comment. It is read and thrown away, and never reaches the page. #}
```

### Output

`{{ expression }}` prints a value, always HTML-escaped. The only way to print markup is the `raw` filter, which prints a value as it is. The compiler does not check what `raw` is used on, so it is yours to keep it to `richtext` settings.

Put an output that is an attribute's value inside quotes: `class="{{ settings.style }}"`, never `class={{ settings.style }}`. Without them a value with a space in it becomes more than one attribute. Nothing it adds can run, because a drawn section is checked again as it is drawn, but it can still break your markup.

Rich text is cleaned against an allow list of tags and attributes: when a page is saved, when a theme is imported, when a website is published, and every time a page is read. Which values are cleaned is decided by the section: every `richtext` setting of the library's own sections, and, in every section including yours, a setting whose id is `body`, `content`, `answer`, `description` or `preview_text`. So give a rich text setting in a section you write one of those ids, and never `raw` a plain `text` or `textarea` setting.

### Expressions

- **Literals:** `"text"`, `'text'`, `12`, `-3`, `1.5`, `true`, `false`, and `null`, `nil` or `blank`, which are all the same empty value.
- **Paths:** `settings.heading`, `block.settings.url`, `theme.colors.primary`, `items[0]`, `items["key"]`. Indexes must be literal; there are no computed lookups.
- **Comparisons:** `==`, `!=`, `<`, `<=`, `>`, `>=`, `contains`.
- **Logic:** `and`, `or`, `not`, and parentheses.
- **Filters:** `value | name: arg1, arg2`, chained left to right.

A path reads plain data only. `__proto__`, `constructor` and `prototype` cannot be reached, a function is never called, and a missing value is `null` rather than an error. Lists have `.size`, `.first` and `.last`. How values compare, what counts as true, and every field of every name are in [Dynamic values](/developers/dynamic-values).

### Every name must be declared

A section that accepts theme blocks (`"blocks": [{ "type": "@theme" }]`) draws them with `{% content_for "blocks" %}` and places a static one with `{% content_for "block", type: "heading", id: "title" %}`. See [Blocks](/developers/blocks).

`{{ settings.foo }}` compiles only when the schema declares a setting with the id `foo`, and `{{ block.settings.bar }}` inside `{% for block in blocks %}` only when a block type declares `bar`. A typo is a compile error with a line number. A setting the schema declares and the template never reads is a warning: it would be a control in the panel that does nothing. A setting read only in `<style>` counts as unread for this warning, which does not stop a save.

### What a template can read

| Name | What it is |
| --- | --- |
| `settings.*` | This instance's settings, worked out: the stored value, else the schema's default, else the control's own. Responsive values arrive as `{ desktop, tablet, mobile }`. |
| `blocks` | This instance's blocks in order, each `{ id, type, settings }`. |
| `section.id`, `section.type` | This instance. Use `section.id` to build element ids, so the section can appear twice on a page. `section.settings` and `section.blocks` are the two above. |
| `scheme.*` | The colour scheme this instance uses, with the section's own overrides applied. See [Styling](/developers/styling#colour-schemes). |
| `theme.colors.*`, `theme.typography.*`, `theme.radius.*`, `theme.spacing.*`, `theme.settings.*` | The theme's tokens, and every theme setting as saved. |
| `page.template` | Which page this is: `index` for home, `page.about` and so on for the rest, `product` on a live product page and `page.product` in the builder. |
| `page.in_editor` | `true` inside the builder. Put prompts for the creator behind it so a visitor never sees them. |
| `page.query` | On the live search page, what was searched for. |
| `products` | The creator's published products, newest first, each `{ id, type, settings }` with `settings.title`, `price` (already formatted), `compare_price`, `image`, `url` and `tag`. The same shape as a block, so one card works for both. Up to 24 on the live site, and on a product page every one but the product it shows. |
| `shop` | The store: `shop.name`, `shop.tagline`, `shop.logo`, `shop.url`, and `shop.socials`, a list of `{ key, label, url }` from the theme's social links. On a published page `shop.description` and `shop.product_count` too. `shop.email` is the support email from Settings, and it is only there on a page where a section has a `show_email` setting turned on. |
| `routes` | The addresses every Storelib website answers on: `root_url`, `products_url`, `search_url`, `cart_url`, `contact_url`, `wishlist_url`, `account_url`, `account_login_url` (the sign in page; `account_signin_url` and `account_register_url` are the same page, since a new email makes the account there), the form addresses `account_code_url`, `account_verify_url` and `account_profile_url`, and `account_logout_url`. |
| `customer` | The signed-in customer, on the account page: `customer.name`, `first_name`, `email`, `orders_count` and `orders`, one per payment, each `{ number, date, status, total, items, action_label, action_url }`, and `sample`, true in the builder only. `null` everywhere else, and on a page for a visitor who is not signed in. |
| `wishlist` | The visitor's saved products, on the account and Wishlist pages: `wishlist.items`, each `{ id, title, price, compare_price, image, url, tag }`, `wishlist.count`, and `wishlist.signed_in`. `null` on other pages. |
| `creator.name`, `creator.headline`, `creator.bio`, `creator.avatar` | The creator's public profile. |
| `product` | On the product page only, the product it shows: `title`, `price`, `compare_price`, `description` (words), `description_html` (cleaned markup, printed with `raw`), `image`, `images`, `url`, `includes` and `id`. Empty everywhere else, so `{% if product %}` tells a section which page it is on. |
| `forloop.index`, `index0`, `first`, `last`, `length` | Inside a `for`. |

`customer` and `wishlist` belong to one visitor, so they are only given to the pages drawn for one visitor, which are never cached. A section on the home page cannot read who is looking; it can draw a heart (see [JavaScript and forms](/developers/javascript#saving-products)) and the page fills it in.

Every field of each, with where it comes from and examples, is in [Dynamic values](/developers/dynamic-values).

### Filters

@[filters]

Two rules worth remembering: put `| url` on every `href` built from a setting, and use `raw` only on a `richtext`, `inline_richtext` or `html` setting, or on `product.description_html`. Each of those is cleaned against an allow list before a template sees it. A filter name the table does not have is not an error: the value prints unchanged.

### What the compiler refuses

@[refusals]

## Errors

Nothing in the framework throws on bad input. Every stage returns either a result or a list of errors in one shape, which the code editor shows beside the line, the AI receives to fix its own output, and the importer attaches to a refused package.

```ts
interface ThemeError {
  stage: "parse" | "schema" | "template" | "css" | "script" | "package"
  message: string
  file?: string     // "sections/hero.storelib"
  line?: number     // 1-based, in that file
  column?: number
  path?: string     // "settings[3].default", for errors about data
}
```

Errors inside the schema's JSON are reported at the line of the `.storelib` file, not the line of the JSON, so an error always points where you would click. A **warning**, such as a setting the template never reads, does not stop a save.

| Stage | Refuses | Example message |
| --- | --- | --- |
| `parse` | A malformed file. | `<style> is never closed` |
| `schema` | JSON that breaks the schema rules. | `default "big" is not a range` at `settings[2].default` |
| `template` | Bad markup or a refused construct. | `a <script> tag inside <template>` |
| `css` | Syntax errors, `@import`, size. | `@import is not allowed` |
| `script` | Forbidden names, unknown capabilities, size. | `"window" is not available to a section` |
| `package` | A theme file that fails an import check. | `sha256 does not match the manifest` |

## Checklist for a new section

- `type` in the schema equals the file name.
- Every setting has an `id` you are willing to keep for ever. It is the key the creator's content is stored under.
- Every default is a valid value for its type.
- The template reads every setting, and declares every setting it reads.
- Repeated content is blocks, each root carrying `data-block-id="{{ block.id }}"`.
- Colour comes from `scheme`, type from the theme, spacing from range settings.
- Laid out for a phone first, with container queries for wider. See [Styling](/developers/styling#responsive).
- No fixed `id="…"`; build ids from `{{ section.id }}`.
- At least one preset, or the section is not offered in Add Section.

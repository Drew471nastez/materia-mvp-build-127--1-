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
- There is no unscoped `<style>` in a section. Global CSS belongs in `layout/theme.storelib`.

## The template language

The template is HTML plus output, conditions, loops and comments. It is **not** Vue, React, JSX or Liquid, although it looks like Liquid: `v-if`, `@click`, `:class` and JSX braces are refused by the compiler. It is compiled to a tree and walked, with no `eval` anywhere, which is what keeps rendering deterministic and lets the storefront run under a strict Content Security Policy.

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

`{{ expression }}` prints a value, always HTML-escaped. The only way to print markup is the `raw` filter, and only on a `richtext` setting, whose value was cleaned against an allow list before it was stored.

### Expressions

- **Literals:** `"text"`, `'text'`, `12`, `1.5`, `true`, `false`, `null`.
- **Paths:** `settings.heading`, `block.settings.url`, `theme.colors.primary`, `items[0]`, `items["key"]`. Indexes must be literal; there are no computed lookups.
- **Comparisons:** `==`, `!=`, `<`, `<=`, `>`, `>=`, `contains`.
- **Logic:** `and`, `or`, `not`, and parentheses.
- **Filters:** `value | name: arg1, arg2`, chained left to right.

A path reads plain data only. `__proto__`, `constructor` and `prototype` cannot be reached, a function is never called, and a missing value is `null` rather than an error. Arrays have `.size`, `.first` and `.last`.

### Every name must be declared

`{{ settings.foo }}` compiles only when the schema declares a setting with the id `foo`, and `{{ block.settings.bar }}` only when that block type declares `bar`. A typo is a compile error with a line number. A setting the schema declares and the template never reads is a warning: it would be a control in the panel that does nothing.

### What a template can read

| Name | What it is |
| --- | --- |
| `settings.*` | This instance's settings, resolved: defaults applied, assets turned into URLs, responsive values as `{ desktop, tablet, mobile }`. |
| `blocks` | This instance's blocks in order, each `{ id, type, settings }`. Hidden blocks are left out. |
| `section.id`, `section.type` | This instance. Use `section.id` to build element ids, so the section can appear twice on a page. |
| `scheme.*` | The colour scheme this instance chose, resolved, with the section's own overrides applied. See [Styling](/developers/styling#colour-schemes). |
| `theme.colors.*`, `theme.typography.*`, `theme.radius.*`, `theme.spacing.*`, `theme.settings.*` | The theme's tokens. |
| `page.template` | Which page this is on: `index`, `product`, `page.about` and so on. |
| `page.in_editor` | `true` inside the builder. Put prompts for the creator behind it so a visitor never sees them. |
| `products` | The creator's published products, newest first, each `{ id, type, settings }` with `settings.title`, `price` (already formatted), `compare_price`, `image`, `url` and `tag`. The same shape as a block, so one card works for both. |
| `shop` | The store: `shop.name`, `shop.tagline`, `shop.logo`, `shop.url`, and `shop.socials`, a list of `{ key, label, url }` from the theme's social links. `shop.email` is the support email from Settings, and it is only there on a page where a section has a `show_email` setting turned on. |
| `routes` | The addresses every Storelib website answers on: `root_url`, `products_url`, `search_url`, `cart_url`, `contact_url`, `wishlist_url`, `account_url`, `account_login_url`, `account_signin_url` and `account_register_url` (these two leave for Storelib to sign in or make an account, and come back to the account page), and `account_logout_url`. |
| `customer` | The signed-in visitor, on the account page: `customer.name`, `first_name`, `email`, `orders_count` and `orders`, each `{ title, image, url, date, price, action_label, action_url }`. `null` everywhere else, and on a page for a visitor who is not signed in. |
| `wishlist` | The visitor's saved products, on the account and Wishlist pages: `wishlist.items`, each `{ id, title, price, compare_price, image, url, tag }`, `wishlist.count`, and `wishlist.signed_in`. `null` on other pages. |
| `forloop.index`, `index0`, `first`, `last`, `length` | Inside a `for`. |

`customer` and `wishlist` belong to one visitor, so they are only given to the pages drawn for one visitor, which are never cached. A section on the home page cannot read who is looking; it can draw a heart (see [JavaScript and forms](/developers/javascript#saving-products)) and the page fills it in.

### Filters

@[filters]

Two rules worth remembering: put `| url` on every `href` built from a setting, and use `raw` only on a `richtext` setting.

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

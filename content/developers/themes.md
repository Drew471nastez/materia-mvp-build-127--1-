# Themes

On Storelib, a website is a theme: one copy of a theme with its own settings, its own pages and its own section files. The website library in your dashboard lists them, and the builder edits one at a time. This page is what a theme holds, where each part is stored, and the file format a theme travels in.

## What a theme holds

| Part | What it is | Stored as |
| --- | --- | --- |
| Theme settings | Colour schemes, fonts and text styles, buttons, layout, animations, the announcement bar, social links, SEO and the cookie banner. One JSON object per website. | A draft and a live copy. See [Data model](/developers/data-model#storethemesettings). |
| Pages | Each page's sections in order, with their settings and blocks. | A draft and a live copy per page. See [Pages and page settings](/developers/pages). |
| Section files | The `.storelib` source of every section type the website can draw. | The theme's own 33 files ship with Storelib. A row is stored for each file you save or create, with a draft and a live copy. |
| Media | Pictures, videos and files the settings point at. | In your account's storage. A setting holds the file's public URL. |

Change a section file and every page that uses the section changes how it looks, with nobody's content moved. Change a page and one page's content changes. Change a theme setting and every section that reads it follows. See [How the builder works](/developers/builder) for the whole map.

## The website library

The library holds up to five websites: **one live and four drafts**. Add theme, Duplicate and Import each refuse a sixth, checked on the server, and the library shows which websites are taking the room.

- **Add theme** makes a new draft from a theme Storelib ships. Browse themes offers one today, Storelib Default. A new website starts with its home page and its product page; the policy pages are added the first time it opens in the builder.
- **Duplicate** copies a website as it stands, drafts included. See [Sharing themes](/developers/sharing-themes#duplicate).
- **Import theme** makes a new draft from a `.storelib-theme.zip` file. See [Sharing themes](/developers/sharing-themes#import).
- **Publish** puts one website live. The website that was live is taken offline in the same step; only one is ever live.
- **Take offline** takes the live website down without deleting anything. **Remove** deletes a draft: its pages, settings and code. The live website has to be taken offline before it can be removed.

Each website's menu in the library also has **Edit code**, **Rename** and **Export theme**, and a draft's has **Website settings**; the live website's are beside Edit website.

## Theme settings

Every theme setting lives in one object, saved as a draft while you work and copied to the live object when you publish. The builder's Theme panel shows them in groups, and [Using the website builder](/developers/website-builder#theme-settings) draws every one with its default. By group, with the id each is stored under:

@[theme-setting-index]

A few keys are written by panels of their own rather than listed in a group:

| Key | Holds | Written by |
| --- | --- | --- |
| `color_schemes` | Each colour scheme's colours, by scheme key. | Theme › Colors |
| `default_color_scheme` | The scheme a section gets when it names none, or names one that no longer exists. | Theme › Colors |
| `color_scheme_remaps` | Where the sections on a deleted scheme went, so a page that was not open at the time follows too. | Deleting a scheme |
| `typography_styles` | Each text style, only what differs from its default. | Theme › Typography |
| `page_seo` | Each page's own search title, description and whether search engines may list it, by page key. | Website settings › Pages & Navigation |
| `site_language` | The language the site is written in, for the page's `lang`. | Website settings › General |

A template reads theme settings through `theme`: the tokens under `theme.colors`, `theme.typography`, `theme.radius` and `theme.spacing`, and every setting as stored under `theme.settings`. The full list, with defaults, is in [Dynamic values](/developers/dynamic-values#theme). The groups Shopify's theme settings have that a template reads as values are there too: `theme.brand` (`headline`, `description`, `image`, `image_width`), `theme.badges` (`sale`, `sale_text`, `position`), `theme.cart.type` (`drawer`, `page` or `notification`) and `theme.currency` (`code`, `show_code`).

### Settings that reach a section by attribute

Inputs, Variant pills, Product cards, Collection cards, Content containers, Media, Dropdowns and pop-ups and Badges are drawn by the theme, not by each section. The theme's stylesheet puts them on elements a section marks with an attribute, and only once a value is set, so a site that never opened the groups looks as it always did:

| Group | Reaches | Custom properties |
| --- | --- | --- |
| Inputs | every `input`, `select` and `textarea` in a section | `--theme-input-radius`, `--theme-input-border-width`, `--theme-input-border-opacity` |
| Variant pills | `[data-variant-pill]` | `--theme-pill-radius`, `--theme-pill-border-width` |
| Product cards | `[data-card="product"]` and its `[data-card-media]` | `--theme-product-card-radius`, `-border`, `-shadow`, `-image-padding` |
| Collection cards | `[data-card="collection"]` and its `[data-card-media]` | `--theme-collection-card-radius`, `-border`, `-shadow`, `-image-padding` |
| Content containers | `[data-container]` | `--theme-container-radius`, `-border`, `-shadow` |
| Media | `[data-media]` | `--theme-image-radius`, `--theme-media-border`, `--theme-media-shadow` |
| Dropdowns and pop-ups | `[data-popup]` and the header's dropdown | `--theme-popup-radius`, `-border`, `-shadow` |
| Badges | `[data-badges]` and each `[data-badge="sale"]`, `"soldout"` or `"tag"` | `--theme-badge-radius`, `--theme-badge-top`, `-bottom`, `-left`, `-right`, `--theme-badge-sale-bg`, `-color`, `--theme-badge-soldout-bg`, `-color` |

A section of your own gets them by marking its elements the same way:

```storelib
<article class="card" data-card="product">
  <div class="card__media" data-card-media>
    <img src="{{ block.settings.image }}" alt="{{ block.settings.title }}">
    {% if theme.badges.sale and block.settings.compare_price %}
      <span class="badges" data-badges><span class="tag" data-badge="sale">{{ theme.badges.sale_text }}</span></span>
    {% endif %}
  </div>
</article>
```

**Currency format.** With Show currency codes on, every price the page hands a section reads `$48.00 USD`: `products`, a product list, a collection's products.

**Custom CSS.** Theme settings › Custom CSS is CSS for every page of the site, kept inside the page root: each selector is put under it, `html`, `body` and `:root` mean the root itself, and a media query that asks only about width becomes a container query, so the builder's phone preview shows the phone rules. Left out, and named under the box: `@import`, `@font-face`, `@charset`, `@namespace`, the `<` character, backslash escapes, `expression()`, `behavior`, `-moz-binding`, and any `url()` that is not https or one of the site's own paths. What was typed is stored as typed, so nothing is lost; what is drawn is the cleaned copy, in its own `<style>` after every section.

## Colour schemes

A section does not choose colours. It chooses a **colour scheme**, and the scheme decides every colour it paints: background, text, headings, links, borders, two buttons with their hover colours, and inputs. Change a scheme and every section on it changes, in the builder and on the live site.

- **Five are built in**, with the keys `white`, `light`, `dark`, `black` and `highlight`, shown as Light, Soft, Dark, Brand and Accent. The keys are older than the names and never change, because every saved section stores the key. Renaming a scheme changes its name only.
- **Each has 21 colours** in five groups (surface, text, primary button, secondary button, inputs), a name, and an optional gradient laid over the background: a `linear-gradient`, `radial-gradient` or `conic-gradient`, with no `url()` in it.
- **Hover colours are automatic** until someone sets them. A filled button's hover is its background a step darker, or a step lighter when it is already near black. An outlined button's hover is its background, or the section's when the button is transparent, moved slightly towards its text. A hover colour is stored only when it was chosen.
- **A creator can add schemes**, with a key of letters, digits, `_` and `-`, and delete the ones they added. The sections on a deleted scheme move to another one.
- **A section stores its scheme's key** as the setting `color_scheme`, and any colours it overrides as `color_overrides`. A key the theme no longer has falls back to where the deleted scheme's sections went, then to `default_color_scheme`, then to `white`.

How a section reads its scheme, in a template and in CSS, is in [Styling](/developers/styling#colour-schemes).

## Typography

A theme has three fonts and nine text styles.

@[font-options]

Each text style has a font role (heading, body or accent), a weight, a size for desktop, tablet and phone, a line height, a letter spacing and a case. The tablet size applies when the section itself is 1023px wide or less, and the phone size at 767px or less, measured on the section rather than the window, so the builder's phone preview draws phone sizes.

@[builder-type-styles]

A section picks its heading style (Heading 1 to 4, or Custom) and its body style (Body, Body large, Body small, or Custom) in the builder. Without a choice, its heading is Heading 2 and its body is Body. How a section's CSS reads the choice is in [Styling](/developers/styling#type).

## The package format

A theme travels as one zip file, `<name>.storelib-theme.zip`. This is what an export writes:

```text
my-shop.storelib-theme.zip
├── theme.json                  what the theme is: name, version, the engine it needs
├── manifest.json               the SHA-256 and size of every file in the package
├── config/
│   └── settings.json           the theme settings, media as asset:// references
├── templates/
│   ├── home.json               one file per page, named by its page key
│   ├── product.json
│   ├── about.json
│   └── refund-policy.json
├── sections/
│   ├── hero_centered.storelib  all of the theme's section files, your edits in place
│   └── pricing_table.storelib  and every section file of your own
├── blocks/
│   ├── heading.storelib        the theme blocks, the same way
│   └── group.storelib
└── assets/
    └── 3f2a…c9.webp            media, named by the SHA-256 of its bytes
```

A package may hold files under `config`, `layout`, `templates`, `sections`, `blocks`, `snippets`, `assets` and `locales`, and `theme.json` and `manifest.json` at its root. Nothing reads `layout`, `snippets` or `locales` yet: an import keeps a `.storelib` file from them and nothing draws it.

### theme.json

```json
{
  "format": "storelib-theme",
  "format_version": 1,
  "name": "My shop",
  "version": "1.0.0",
  "engine": { "min": 1 },
  "source_theme_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "cover": { "desktop": "5d1e…", "phone": "9b0a…" }
}
```

| Key | Meaning |
| --- | --- |
| `format` | Always `storelib-theme`. |
| `format_version` | The package format, 1. |
| `name` | Required. The imported website is given this name. |
| `version` | The theme's own version. An export writes `1.0.0`. |
| `engine.min` | The oldest engine that can render the theme. A package asking for a newer engine than this one is refused. |
| `source_theme_id` | The catalogue theme it was made from. An import keeps it when Storelib's catalogue has that theme, and uses Storelib Default when it does not. |
| `cover` | The SHA-256 of the website's two cover pictures in `assets/`, for the library card. |
| `author`, `description` | Optional. |

Other keys are allowed, and an import ignores them.

### manifest.json

Every file in the package except the manifest itself is listed with its SHA-256 and its size in bytes, and every asset with its file name, type and size. An import recomputes each hash and refuses the package if one does not match, which is why a package edited by hand needs its manifest updated. [Sharing themes](/developers/sharing-themes#editing-a-package-by-hand) has a script that does it.

```json
{
  "format": "storelib-theme",
  "format_version": 1,
  "files": {
    "theme.json": { "sha256": "b61f…", "bytes": 212 },
    "sections/faq_accordion.storelib": { "sha256": "0c9d…", "bytes": 9038 }
  },
  "assets": {
    "3f2a…c9": { "filename": "hero.webp", "mime_type": "image/webp", "size": 182340 }
  },
  "generated_at": "2026-09-25T10:04:11.000Z"
}
```

### templates/*.json

One file per page, named by the page key: `templates/home.json`, `templates/about.json`, `templates/size-guide.json`. There is no `index.json`. Sections are keyed by their id, with `order` saying the order, and each section's blocks are keyed the same way with a `block_order` beside them:

```json
{
  "sections": {
    "faq_accordion-1727200000000": {
      "type": "faq_accordion",
      "name": "Accordion FAQ",
      "settings": { "heading": "Questions", "color_scheme": "light" },
      "hidden": false,
      "blocks": {
        "block-m1x2-1-ab3cd": { "type": "qa", "settings": { "question": "Do you ship abroad?" } }
      },
      "block_order": ["block-m1x2-1-ab3cd"]
    }
  },
  "order": ["faq_accordion-1727200000000"]
}
```

In the database the same page is a plain list, and blocks a list inside each section. An import converts one to the other. See [Pages and page settings](/developers/pages#what-a-page-stores).

### config/settings.json

The theme settings object, exactly as the builder stores it, with every media URL that travelled replaced by `asset://` and the SHA-256 of the file. An import stores the file in the importing account and writes its new URL back in place of the reference.

## Versions

@[versions]

## What the site reads, and what it does not

A visitor's page is drawn from three things: the website's live pages, its live theme settings, and its section files, which are the theme's own 33 with the website's changed and added files in their place. The code editor shows more files than that, laid out the way a Shopify theme is: `theme.json`, `config/settings_schema.json`, `config/settings_data.json`, `templates/*.json`, two files under `snippets` and `assets/styles.css` and `assets/theme.js`. Those are views of the theme's data. Saving an edit to one stores the file, and **nothing on the site reads it**. Only `sections/*.storelib` and `blocks/*.storelib` change what a page draws.

A section's CSS is always scoped to that section; see [Styling](/developers/styling). CSS for the whole site goes in Theme settings › Custom CSS, above.

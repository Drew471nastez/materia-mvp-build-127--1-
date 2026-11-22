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

The library holds up to seven websites: **one live and six drafts**. Add theme, Duplicate and Import each refuse an eighth, checked on the server, and the library shows which websites are taking the room.

- **Add theme** makes a new draft from a theme Storelib ships. Browse themes offers one today, Storelib Default. A new website starts with its home page and its product page; the policy pages are added the first time it opens in the builder.
- **Duplicate** copies a website as it stands, drafts included. See [Sharing themes](/developers/sharing-themes#duplicate).
- **Import theme** makes a new draft from a `.storelib-theme.zip` file. See [Sharing themes](/developers/sharing-themes#import).
- **Publish** puts one website live. The website that was live is taken offline in the same step; only one is ever live.
- **Take offline** takes the live website down without deleting anything. **Remove** deletes a draft: its pages, settings and code. The live website has to be taken offline before it can be removed.

Each website's menu in the library also has **Edit code**, **Rename** and **Export theme**, and a draft's has **Website settings**; the live website's are beside Edit website.

## Theme settings

Every theme setting lives in one object, saved as a draft while you work and copied to the live object when you publish. The builder's Theme panel shows them in groups, and [Using the website builder](/developers/website-builder#theme-settings) draws every one with its default. A theme can reorder, regroup and add to them in its own `config/settings_schema.json`, see [Theme settings as files](#theme-settings-as-files). Storelib's own, by group, with the id each is stored under:

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

A template reads theme settings through `theme`: the tokens under `theme.colors`, `theme.typography`, `theme.radius` and `theme.spacing`, and every setting as stored under `theme.settings`. The full list, with defaults, is in [Dynamic values](/developers/dynamic-values#theme). The groups other store themes' settings have that a template reads as values are there too: `theme.brand` (`headline`, `description`, `image`, `image_width`), `theme.badges` (`sale`, `sale_text`, `position`), `theme.cart.type` (`drawer`, `page` or `notification`) and `theme.currency` (`code`, `show_code`).

### Settings that reach a section by attribute

Some settings are drawn by the theme, not by each section. The theme's stylesheet puts them on elements a section marks with an attribute, and only once a value is set, so a site that never chose one looks as it always did:

| Group › setting | Reaches | Custom properties |
| --- | --- | --- |
| Buttons and inputs › Text boxes | every `input`, `select` and `textarea` in a section | `--theme-input-radius`, `--theme-input-border-width`, `--theme-input-border-opacity` |
| Buttons and inputs › Variant pills | `[data-variant-pill]` | `--theme-pill-radius`, `--theme-pill-border-width` |
| Layout › Cards (shadow, border) | `[data-container]` | `--theme-container-shadow`, `--theme-container-border` |
| Layout › Images and video | `[data-media]` | `--theme-image-radius`, `--theme-media-border`, `--theme-media-shadow` |
| Layout › Dropdowns and pop-ups | `[data-popup]` and the header's dropdown | `--theme-popup-radius`, `-border`, `-shadow` |
| Products and cart › Product cards | `[data-card="product"]` and its `[data-card-media]` | `--theme-product-card-radius`, `-border`, `-shadow`, `-image-padding` |
| Products and cart › Collection cards | `[data-card="collection"]` and its `[data-card-media]` | `--theme-collection-card-radius`, `-border`, `-shadow`, `-image-padding` |
| Products and cart › Badges | `[data-badges]` and each `[data-badge="sale"]`, `"soldout"` or `"tag"` | `--theme-badge-radius`, `--theme-badge-top`, `-bottom`, `-left`, `-right`, `--theme-badge-sale-bg`, `-color`, `--theme-badge-soldout-bg`, `-color` |

Card corner radius is not one of them: every section reads it as `{{ theme.radius.medium }}px`, so it reaches the cards and boxes of every section at once. A `container_radius` or `container_shadow` saved by the older Content containers group still wins over Layout's for `[data-container]`.

The page's frame reaches every section through custom properties on the page root:

| Setting | Custom property | What reads it |
| --- | --- | --- |
| Max page width | `--theme-page-width` | the `max-width` of a section's inner box |
| Side padding | `--theme-padding-x` | a section's inline padding |
| Spacing scale | `--theme-spacing-scale` | multiplies a section's `padding_top` and `padding_bottom` |
| Section gap | `--theme-section-gap` | a margin between every two sections in the page body, never above the first, below the last, or beside the header and footer |

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

**Show currency codes.** With it on, every price the page hands a section reads `$48.00 USD`: `products`, a product list, a collection's products.

**Social links.** One address per platform, under `social_<platform>`: `instagram`, `tiktok`, `youtube`, `twitter` (X), `facebook`, `linkedin`, `pinterest`, `threads`, `spotify`, `soundcloud`, `snapchat`, `bluesky`, `whatsapp`, `discord`, `twitch`, `github`, `website` and `email`. A web address must be http or https; a bare `instagram.com/name` is given its `https://`, and anything else (`javascript:`, `data:`) is left out. `social_email` takes an address and becomes a `mailto:` link. The footer draws each filled-in one as the platform's mark, in `currentColor`, named for its platform with `aria-label`; a template reads them as `shop.socials` and `theme.socials`.

**Custom CSS.** Theme settings › Custom CSS is CSS for every page of the site, kept inside the page root: each selector is put under it, `html`, `body` and `:root` mean the root itself, and a media query that asks only about width becomes a container query, so the builder's phone preview shows the phone rules. Left out, and named under the box: `@import`, `@font-face`, `@charset`, `@namespace`, the `<` character, backslash escapes, `expression()`, `behavior`, `-moz-binding`, and any `url()` that is not https or one of the site's own paths. What was typed is stored as typed, so nothing is lost; what is drawn is the cleaned copy, in its own `<style>` after every section.

### Settings taken out of the panel

These were in General settings and are not any more. A saved value is kept, never deleted, and is still read where it was read, so a published site does not change:

| Keys | Where they are now |
| --- | --- |
| `seo_title`, `seo_description`, `seo_og_image`, `seo_robots` | Website settings › SEO & Social, which writes the same keys. |
| `seo_twitter_card` | Nothing writes it now. A saved `summary` is still read; everything else is the large card. |
| `announcement_bar_*` | The Announcement bar section, in the Header group. The page still draws the old bar while `announcement_bar_enabled` is `true`, and only then does the panel show its switch, as **Old announcement bar**. |
| `primary_hover_color`, `secondary_color`, `accent_color`, `surface_color`, `surface_alt_color`, `text_secondary_color`, `text_muted_color`, `border_color`, `link_color`, `link_hover_color`, `success_color`, `error_color` | A section paints with its colour scheme. These are still written to the page root as `--theme-*` properties, for custom CSS that uses them. |
| `button_size` | Nothing: no button ever read it. |
| `button_font_weight` | Typography › Button, whose weight it still sets when the style has none of its own. |
| `brand_image_width` | Nothing in the shipped theme. Still `theme.brand.image_width` for a section that reads it. |
| `container_radius`, `container_shadow` | Layout › Card corner radius and Card shadow. A saved value still wins for `[data-container]`. |
| A text style's `size.tablet` | Typography has a desktop and a phone size. A saved tablet size is read as the phone size when there is no phone size, and is otherwise ignored. |

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

Each text style has a font role (heading, body or accent), a weight, a size for desktop and one for phones, a line height, a letter spacing and a case. The phone size applies when the section itself is 767px wide or less, measured on the section rather than the window, so the builder's phone preview draws phone sizes. A style is stored under `typography_styles.<style>` with only what differs from its default; a size is one number, or `{ "desktop": 40, "mobile": 30 }`. An older `tablet` size in a saved theme is read as the phone size when no phone size was saved, and is otherwise ignored.

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

The theme settings object, exactly as the builder stores it, with every media URL that travelled replaced by `asset://` and the SHA-256 of the file. An import stores the file in the importing account and writes its new URL back in place of the reference. A package may carry `config/settings_data.json` instead, or as well, in Shopify's shape; see below.

## Theme settings as files

A theme's global settings work the way a Shopify theme's do: `config/settings_schema.json` says what they are, `config/settings_data.json` holds their values. Change either in the code editor, over MCP, from Storelib AI or with a push to the linked repository, and Theme settings in the builder follow at once.

### config/settings_schema.json

What the theme settings are, in Shopify's format: a list of groups, each a name and its settings.

```json
[
  {
    "name": "Layout",
    "settings": [
      { "type": "range", "id": "page_width", "label": "Max page width", "min": 900, "max": 1800, "step": 20, "unit": "px", "default": 1400 },
      { "type": "header", "content": "Cards" },
      { "type": "range", "id": "border_radius", "label": "Card corner radius", "min": 0, "max": 24, "step": 1, "unit": "px", "default": 8 }
    ]
  },
  {
    "name": "Promo strip",
    "settings": [
      { "type": "toggle", "id": "promo_show", "label": "Show the promo strip", "default": true },
      { "type": "text", "id": "promo_text", "label": "Words", "default": "Free shipping over $50" },
      { "type": "color", "id": "promo_color", "label": "Background", "default": "#1a1a2e" }
    ]
  }
]
```

A theme without this file has Storelib's groups. With it, the file is laid over them:

- **Groups and settings appear in the file's order.** A group of Storelib's matches by its name (Layout, Typography, Buttons...) or its `id`; one the file does not list comes after the file's groups, and a Storelib setting the file does not list comes after the ones it does, in its own group. Nothing of Storelib's goes missing.
- **A theme may add groups and settings of its own**, of any [control type](/developers/schema#every-control-type), with `header` and `paragraph` to arrange them. A section reads one as `theme.settings.<id>`, so `{{ theme.settings.promo_text }}`.
- **A theme may change a Storelib setting's** `label`, `default`, `min`, `max`, `step`, `unit`, `info`, `placeholder` and `visible_if`, and relabel or reorder a select's options. Its `id`, `type` and group stay, because the theme's stylesheet reads it as it is.
- **Refused, with the line:** a type that does not exist, a setting without an `id` or a `label`, an id used twice, a range whose default is outside it, a select whose default is not an option, a Storelib setting moved to another group or given another type. Typography takes fonts only; Colors and Menus take nothing new.

A default the file adds, or moves, is written under every value nobody has set yet, so the live site draws it too. A value somebody chose is never changed by a new default.

### config/settings_data.json

The theme settings' values, `{ "current": { "page_width": 1400, "promo_show": true } }`. It is not a stored copy: in the code editor and over MCP it is the values the sidebar shows, read when you open it and written when you save it, so the sidebar and the file never disagree. What a save sets is set, `null` puts a setting back to its default, and what it leaves out stays as it is. Each value is checked against its setting (a range takes a number inside it, a select one of its options) and refused with its line. `{ "current": "Name", "presets": { "Name": { ... } } }` takes that preset's values. In a GitHub repository and a theme package the values are `config/settings.json`, and a `config/settings_data.json` there is taken the same way.

## Versions

@[versions]

## What the site reads, and what it does not

A visitor's page is drawn from three things: the website's live pages, its live theme settings, and its section files, which are the theme's own 33 with the website's changed and added files in their place. The code editor shows more files than that, laid out the way store themes usually are: `theme.json`, `config/settings_schema.json`, `config/settings_data.json`, `templates/*.json`, two files under `snippets` and `assets/styles.css` and `assets/theme.js`. `config/settings_schema.json` and `config/settings_data.json` are the theme settings, above: saving either changes Theme settings in the builder at once. The others are views of the theme's data. Saving an edit to one stores the file, and **nothing on the site reads it**. Only `sections/*.storelib`, `blocks/*.storelib` and the two theme settings files change what a page draws.

A section's CSS is always scoped to that section; see [Styling](/developers/styling). CSS for the whole site goes in Theme settings › Custom CSS, above.

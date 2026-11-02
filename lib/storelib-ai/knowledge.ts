/**
 * ===========================================================================
 *  WHAT STORELIB ACTUALLY IS, IN A FORM THAT SURVIVES A DEPLOY
 * ===========================================================================
 * The real documentation is docs/theme/00-16, and it is the authority. It is
 * also seventeen markdown files that nothing imports, which means Next never
 * traces them into the serverless bundle: a `readFileSync` against them works
 * on a laptop and throws on Vercel. Documentation the runtime cannot open is
 * documentation the model does not have.
 *
 * So the facts a model needs at runtime live here, as a module, the way
 * lib/storelib-theme/controls/storelib-controls.json already does. Anything
 * that can be derived from the engine is IMPORTED from the engine rather than
 * retyped, so the control list, the filter list and the capability list
 * cannot drift from the compiler that enforces them. What is left is prose,
 * kept short and checked by tests/storelib-ai.test.ts against the same
 * sources.
 *
 * RETRIEVAL, NOT A DUMP. Everything here at once is thousands of tokens on
 * every request, most of it irrelevant. `knowledgeFor` picks the topics the
 * request is actually about and returns those. The core facts, which are
 * short and always needed by anything authoring a file, go in the stable
 * prefix; retrieved topics go in the turn, because a prefix that changes per
 * request is a prefix nobody caches.
 */

import { CONTROL_TYPES } from "@/lib/storelib-theme/controls/registry"
import { EMBED_ALLOWED, FILTER_NAMES } from "@/lib/storelib-theme/storelib/template"
import { CAPABILITIES } from "@/lib/storelib-theme/storelib/script"
import { SCHEME_COLOR_KEYS } from "@/lib/storelib-theme/color-schemes"
import { TYPE_STYLE_KEYS, FONT_ROLES } from "@/lib/storelib-theme/typography"

export interface Topic {
  id: string
  /** Words in a request that mean this topic is worth including. */
  triggers: RegExp
  text: string
}

/**
 * THE FORMAT ITSELF, always sent to anything that writes a file.
 *
 * Short on purpose. It is the part that cannot be looked up, because getting
 * it wrong produces a file that does not compile rather than a file that is
 * merely worse.
 */
export const CORE_FORMAT = `A Storelib section is ONE file with four blocks, each tag on its own line:
  <template> markup </template>
  <style> CSS </style>
  <script> optional; runs in a sandbox against a copy of this section </script>
  <schema> JSON </schema>

THE TEMPLATE LANGUAGE IS NOT VUE, REACT OR JSX. v-if, @click, :class and JSX braces are refused by the compiler. It is:
  {{ settings.heading }}            print a value, HTML-escaped
  {% if x %} … {% elsif y %} … {% else %} … {% endif %}
  {% for block in blocks %} … {% else %} … {% endfor %}
  {# a comment, which never reaches the page #}
It can read: settings, blocks, section (.id .type .settings .blocks), theme (and theme.logo), scheme, page (.template, .in_editor), products, shop (.name .socials), and forloop inside a loop. settings and section.settings are the same thing.

THE TYPE IS WHAT THE VALUE IS: a picture image_picker, a link url, a menu link_list, a colour color defaulting to "scheme.<name>".

EVERY NAME MUST BE DECLARED. {{ settings.foo }} compiles only when the schema declares a setting with id "foo". The same for block settings. The compiler checks every path the template reads against the schema beside it, so a typo is an error with a line number, not a blank space on the page.

FILTERS, after a pipe, argument after a colon:
  ${FILTER_NAMES.join(" ")}
  url on every href. raw only on a richtext setting. asset on images.

SETTING TYPES:
  ${CONTROL_TYPES.join(" ")}`

const TOPICS: Topic[] = [
  /* First, so a request about the header never loses the live values under the topic cap. */
  {
    id: "site-chrome",
    triggers: /header|navbar|nav ?bar|navigation|menu ?bar|top ?bar|footer|sticky|mega ?menu/i,
    text: `A HEADER AND A FOOTER ARE DESIGNED FREELY. Layout, icons, buttons, type, motion and logo size are yours. Write sections/<name>.storelib with "kind": "header" or "kind": "footer" and it replaces the built-in one on every page. sections/header.storelib and sections/footer.storelib are reserved names. Do not copy the built-in header's setting list. WHAT STAYS LIVE, like a shop platform: the menu is one link_list (default "main-menu"), looped {% for link in settings.menu.links %} with {% for child in link.links %} for sub links, and a change to that menu is read_menus then edit_menu; the logo is theme.logo.url (theme.logo.width, theme.logo.mobile_url, theme.logo.text) or an image_picker, and size and colour are settings the creator can change; data-storelib-menu="{{ settings.menu.handle }}" opens the menu drawer (data-storelib-menu-from left, right or top), data-storelib-cart opens the cart drawer, data-storelib-cart-count shows the count, data-storelib-search opens search; account is routes.account_url (sign in and sign up are the same page); a buy button is the product's checkout_url; products and prices come from products; an email box is data-storelib-form="subscribe"; shop.email is the support address when the section asks for it. An announcement bar above the header says "enabled_on": { "groups": ["header"] } or has category "announcement". One kind per theme.`,
  },
  {
    /*
      A CART OF THE SECTION'S OWN (lib/website-builder/storefront-hooks.ts). The owner: "I should not be tied to
      native drawers, cart, search: I might want to build my own." Second, so a cart request keeps it under the cap.
    */
    id: "own-cart",
    triggers: /\bcart|bag|basket|add to (?:cart|bag)|mini ?cart|side ?cart|cart drawer|slide.?out cart|checkout|product card|quick ?add|shop the look/i,
    text: `A CART, ADD BUTTONS AND A CART DRAWER CAN BE THE SECTION'S OWN DESIGN, on the site's one cart (priced again on the server at checkout, so nothing typed can change a charge). ADD: <button type="button" data-storelib-add-to-cart="{{ block.id }}" data-title="{{ block.settings.title }}" data-price="{{ block.settings.price }}" data-image="{{ block.settings.image }}" data-url="{{ block.settings.url }}" data-kind="{{ block.settings.kind }}"> inside {% for block in products %}, behind {% if block.settings.available %}; for an option add data-variant-id="{{ variant.id }}" data-variant-name="{{ variant.name }}". OWN DRAWER: an element marked data-storelib-cart-panel (styled by its data-open="true|false"; it is inert while shut) opens on the section's data-storelib-cart button and on every add, instead of the built-in drawer. Inside it: a list marked data-storelib-cart-lines holding ONE element marked data-storelib-cart-line hidden (not a <template>, which is the file's own delimiter), copied per line, with data-line-title, data-line-variant, data-line-price, data-line-qty, img data-line-image, a data-line-url, and buttons data-line-inc, data-line-dec, data-line-remove; data-storelib-cart-subtotal; data-storelib-cart-empty and data-storelib-cart-filled (shown and hidden for you); a data-storelib-checkout button (straight to checkout, as the built-in drawer does) and a data-storelib-cart-close button. Escape closes it. Without a panel, data-storelib-cart opens the built-in drawer. Never a price, stock level or shipping cost typed by hand.`,
  },
  {
    /*
      PRODUCTS AND COLLECTIONS ARE READ FROM THE STORE, NEVER TYPED. "Make me
      a product grid like a Shopify theme" was answered with blocks holding a
      typed name, price and photo: products the shop does not have. The shop
      is the source, as in a Shopify theme, and the sidebar chooses which.
      The checker refuses the rest (lib/storelib-ai/integration.ts,
      integration-products and integration-product-typed).
    */
    id: "store-binding",
    triggers: /product|\bshop\b|\bstore\b|catalog|collection|merch|\bprices?\b|best ?sell|new ?(?:in|arrivals?|drops?)\b|featured|recommend|\bbuy\b|for sale|lookbook|apparel|cloth/i,
    text: `PRODUCTS COME FROM THE STORE, NEVER FROM TYPING. Never write a product's name, price, photo or "Sold out" into markup, a default, a block or a preset, and never give a product a price setting. No text boxes or image_pickers to describe a product: a product block holds a product_picker.
  WHICH PRODUCTS, chosen in the sidebar like any store theme's section: a select "source" with "shop" ({% for block in products limit: settings.product_count %}), "collection" (a collection_picker "collection": {% for block in settings.collection.products limit: settings.product_count %}) and "chosen" (a product_list "chosen", "limit": 12: {% for block in settings.chosen %}), each picker shown with "visible_if": "{{ section.settings.source == 'collection' }}"; default and preset "shop"; product_count a range. One product: a product_picker "product", printed as settings.product.title, .price, .compare_price, .image, .url, .checkout_url (on the product page set it to @current; page.product is there too). Several collections: a collection_list. On a collection page, collection is the page's own.
  EVERY CARD reads block.settings.title, .price (formatted: print it, never compute), .compare_price, .image (| asset, with width, height and alt), .images, .url (| url), .tag ("Sold out" or ""), .available, .kind, .checkout_url, .variants (each id, name, price, available, checkout_url), .options and .fields (the product's custom fields by name: block.settings.fields.material). Add to cart is data-storelib-add-to-cart behind {% if block.settings.available %}. A card may change a word from its product, {{ block.settings.title | default: block.settings.product.title }}, never its price.
  EMPTY: {% else %} in the loop with {% if page.in_editor %}<p>Your published products appear here</p>{% endif %}: nothing invented, nothing shown to a visitor. Filtering and sorting are the shop page's (page.filters), not a script's.`,
  },
  {
    /*
      THE BLOG IS READ FROM THE BLOG MANAGER, NEVER TYPED (lib/website-builder/blog-page.ts). A creator's posts are
      written in Website Settings › Blog; a section shows them the way a product section shows products.
    */
    id: "blog",
    triggers: /\bblog|\barticles?\b|\bposts?\b|journal/i,
    text: `POSTS COME FROM THE BLOG, NEVER FROM TYPING. A post's title, words, picture or date are never written into markup, a default, a block or a preset: they are written in Website Settings › Blog, and read_blog says what the blog holds.
  blog (every page that shows posts): blog.title, .handle, .url (/blogs/<handle>), .description, .articles (the posts this list shows), .articles_count, .recent (the newest live posts, on any page), .featured (the ones marked featured), .all_tags, .categories (each .name, .handle, .url, .count, .active, .posts), .tags (each .name, .url, .active), .current_tag, .current_category (.name, .url, .description), .pagination (.page, .pages, .total, .previous_url, .next_url, .parts: each .label, .url, .current, .gap), .sample (true only for the builder's sample posts).
  EVERY POST in those lists: post.title, .url (| url), .excerpt, .summary_html (| raw), .image (| asset), .image_alt, .date (already in the page's language), .published_at (for <time datetime>), .reading_minutes, .featured, .category (.name, .url) or null, .tags (each .name, .url), .author (.name, .role, .bio, .avatar, .links) or null.
  article (a post's own page only): every field above, and .content (the post's cleaned markup: {{ article.content | raw }}), .related (posts like it), .previous and .next (or null), .share (.url, .x, .facebook, .linkedin, .email).
  WHICH POSTS on another page: a select "source" with "latest" ({% for post in blog.recent limit: settings.post_count %}), "featured" (blog.featured) and "category" (a url setting "category_url": {% for c in blog.categories %}{% if c.url == settings.category_url or settings.category_url contains c.url %}{% for post in c.posts limit: settings.post_count %}…). The built-in ones are main_blog (the Blog template, page "blogs"), main_article (the Blog post template, page "article") and blog_featured (any page).
  EMPTY: {% if blog %} around the whole section, with {% elsif page.in_editor %}<p>Your posts appear here</p>{% endif %}: a site with no blog shows nothing to a visitor.`,
  },
  {
    id: "blocks",
    triggers: /block|repeat|item|entry|question|tier|testimonial|logo|slide|card|list|faq|accordion|gallery/i,
    text: `BLOCKS ONLY FOR A LIST THE CREATOR GROWS (questions, testimonials, slides, logos, tiers): declare the type, loop over \`blocks\`, data-block-id="{{ block.id }}" on each, preset 2 or 3, never question_1 / question_2. One of each thing (a hero, a banner, a call to action) is plain settings, NO blocks; no @theme blocks unless asked. Motion is the section's own CSS. A select with the id animation can follow or override the theme's entrance; it is optional.`,
  },
  {
    /*
      RICH SETTINGS, the way a Shopify theme's schema reads. The format
      lists every control by name (CORE_FORMAT); this says which one fits
      what, so a section is not all text and range boxes.
    */
    id: "rich-settings",
    triggers: /setting|option|configur|customi[sz]|schema|editable|control|flexib|shopify|let (?:me|them|the creator|creators) (?:change|pick|choose|edit)/i,
    text: `SETTINGS A CREATOR CAN USE. A heading or title is inline_richtext (never text), printed | raw in the h2; a paragraph is richtext (never textarea), default in <p>…</p>, printed | raw in a <div>; a button label stays text. Also: image_picker plus focal_point, image_gallery, video_url, icon_picker, url for a link, product_picker/product_list, collection_picker/collection_list, link_list for a menu, datetime, alignment, color_background, select or radio. Group with "header" settings (Content, Layout, Style), "visible_if": "{{ section.settings.layout == 'split' }}" for one mode's options, "responsive": true on phone sizes.`,
  },
  {
    id: "theme-blocks",
    triggers: /theme block|@theme|content_for|nested|group|blocks? inside|static block|preset|layout of blocks|build(?:ing)? blocks|heading block|image block|button block/i,
    text: `THEME BLOCKS work as in the common store theme format. A file blocks/<type>.storelib has <template>, <style> and <schema> (name, settings, optional "blocks": [{"type":"@theme"}] to hold blocks, max_blocks, presets, tag, class), and no <script>. The theme ships heading, text, button, image, video, spacer and group. A section takes them with "blocks": [{ "type": "@theme" }] (or names them: [{ "type": "image" }]) and draws them with {% content_for "blocks" %}; it does not also declare blocks of its own. Each is wrapped in <div class="sl-block" data-block-id data-block-type>, so style a row with .row > .sl-block { flex: 1 1 0 }. Inside a block file, read block.settings.<id> (or settings.<id>), block.blocks, and section.settings.<id> for the section it sits in; prefix classes. A colour a block draws is a color setting whose default names a scheme colour ("default": "scheme.heading"), which follows the section's scheme until the creator picks one; write it into an inline custom property, style="--heading-color: {{ block.settings.color | default: scheme.heading }};", and read it in the block's one rule with the section's --s-* property as the fallback: color: var(--heading-color, var(--s-heading)). The shipped heading and text have a text color, button a fill, text and hover pair per style (shown by visible_if on style), and group an optional background ("" for none) and a corner radius. A static block is placed by the template: {% content_for "block", type: "heading", id: "title" %}. Presets are written keyed by id: "blocks": { "title": { "type": "heading", "static": true, "settings": {…} }, "row": { "type": "group", "settings": {"direction":"row"}, "blocks": {…}, "block_order": […] } }, "block_order": ["row"]. Every non-static key is in block_order. A file whose name starts with _ is private: only a section that names it can hold it. On a page, add_block takes parentBlockId to add inside a group, and a nested block's id is its path, outer/inner.`,
  },
  {
    id: "color-scheme",
    triggers: /colou?r|scheme|background|dark|light|contrast|palette|brand|theme/i,
    text: `COLOURS MAY FOLLOW THE SCHEME, AND THE CREATOR MAY OVERWRITE THEM. A color_scheme setting and a color setting per element (default "scheme.heading", "scheme.text", "scheme.primary_button_background") let the sidebar change one colour. Scheme keys: ${SCHEME_COLOR_KEYS.join(", ")}. The aliases bg, paragraph, primary_btn_bg and primary_btn_text still resolve. Built-in schemes: white, light, dark, black and highlight (Light, Soft, Dark, Brand, Accent). A fixed colour is allowed. Print a color setting on the root, --s-heading: {{ settings.heading_color }}, and paint with var(--s-heading), when the sidebar should own it.`,
  },
  {
    id: "theme-globals",
    triggers: /logo|brand|social|instagram|store name|site name|theme setting|global|button style|animation|favicon/i,
    text: `THE THEME'S GENERAL SETTINGS ARE READ, NOT RETYPED. A section may read: theme.logo.url, .width, .mobile_url, .mobile_width and .text (the store name, for no picture); shop.name, shop.tagline, shop.logo; shop.socials, each { key, label, url }, looped {% for link in shop.socials %}; theme.buttons; theme.layout; theme.animation; theme.typography; theme.schemes; and theme.settings. Logo size and colour are settings the section may offer; theme.logo.width is a starting width, not a fixed size. Motion is the section's own CSS. A select with the id animation and the values theme, none, fade, fade_up and zoom is optional: "theme" follows Theme settings, anything else overrides it.`,
  },
  {
    id: "typography",
    triggers: /font|type|heading|text size|typograph|weight|uppercase|letter|headline/i,
    text: `TYPE MAY COME FROM THE THEME. The theme carries font roles (${FONT_ROLES.join(", ")}) and a type scale (${TYPE_STYLE_KEYS.join(", ")}), each with its own desktop, tablet and mobile size. A section that should match the rest of the site leaves its h1, h2, h3, p and buttons unstyled for font family, weight and size, or styles them with var(--type-h2-font), var(--type-h2-size), var(--type-h2-weight), var(--type-body-size) and the like, so a change in Theme settings, Typography reaches it. A select with the id heading_size (h1, h2, h3) lets the creator pick which theme style the heading takes. A section may still set its own type when the design asks for it; naming a font is allowed.`,
  },
  {
    id: "css-scoping",
    triggers: /css|style|class|scope|global|leak|selector/i,
    text: `A SECTION'S CSS IS SCOPED AUTOMATICALLY, to that section's instances and nothing else. You do not write the scope and you cannot escape it. html, body and :root are rewritten to point at the section root, so a rule written against them does not do what it looks like it does; do not write them. The CSS may read settings with {{ }} the same way the template does.`,
  },
  {
    id: "responsive",
    triggers: /mobile|phone|tablet|desktop|responsive|breakpoint|stack|column|width|overflow|wrap/i,
    text: `RESPONSIVE IS WRITTEN WITH CONTAINER QUERIES, NOT MEDIA QUERIES. A section is as wide as the column it is in, which in the builder's phone preview is not the width of the window, so @media asks the wrong question and a section built on it looks correct in the preview and wrong in the editor. Put container-type: inline-size on the outermost element, write the phone layout as the base rules, then @container (min-width: 640px) and @container (min-width: 1024px) for wider ones.`,
  },
  {
    id: "script",
    triggers: /script|javascript|js|slider|carousel|autoplay|interval|timer|animate|animation|click|toggle|drag|scroll|tab|modal|popup|menu|open|close/i,
    text: `A SECTION'S <script> RUNS IN A SANDBOX, against a copy of the section's own markup. root is that copy: query inside it, add listeners, toggle classes, set styles and text, and the page mirrors each change. It cannot add or remove elements (show and hide what the template drew, with hidden or a class), cannot measure layout, and cannot set src, href or on* attributes. Scroll with storelib.scrollTo(el, { left, behavior: "smooth" }); storelib.inEditor is true in the builder.
  PREFER HTML AND CSS where they do it alone, because they work before any script loads: <details> accordions (a shared name="{{ section.id }}-faq" keeps one open), radio :checked tabs, scroll-snap carousels, popovertarget pop-ups, CSS transitions stopped under prefers-reduced-motion. Use script for what they cannot: autoplay, counters, a slider's dots.
  window, document, fetch, localStorage, eval and Function are refused by name. Timers need the "timers" capability. Capabilities: ${CAPABILITIES.join(", ")}.`,
  },
  {
    id: "forms",
    triggers: /form|e-?mail|sign ?up|subscri|newsletter|join|mailing|waitlist|lead|capture|contact|input|notify/i,
    text: `AN EMAIL BOX COLLECTS EMAILS FOR THE SITE'S CREATOR. The page submits <form data-storelib-form="subscribe"> with <input type="email" name="email"> (and name="name" if asked) into the creator's Subscribers: no script, no action, and never ask the creator for a URL. It carries data-state="sending", "done" or "error" for the CSS, and an element marked data-storelib-success hidden replaces it on success. Give the input a <label>. For another mailing service, set its action and data-storelib-form="native".`,
  },
  {
    id: "embed",
    triggers: /video|youtube|vimeo|spotify|soundcloud|embed|iframe|player|podcast|music|playlist/i,
    text: `AN <iframe> NEEDS PERMISSION AND AN ADDRESS FROM THE embed FILTER. Declare "capabilities": ["embed"] in the schema and write <iframe src="{{ settings.video_url | embed }}" title="…" loading="lazy" allowfullscreen></iframe>. Any other iframe, or an iframe whose src comes from anywhere else, is refused when the file is saved. The filter accepts ${EMBED_ALLOWED.join(", ")}, turns what people paste (a youtu.be link, a watch?v= link) into the player's address, and returns "" for everything else, so put the frame inside {% if settings.video_url != "" %}. Size it with aspect-ratio: 16 / 9 and width: 100% in the CSS.`,
  },
  {
    id: "animation",
    triggers: /anim|transition|smooth|fade|slide|ease|motion|hover|open|close|expand|collapse/i,
    text: `MOTION IS THE SECTION'S OWN. Write the animation the design needs, in CSS. The theme can also fade a section in (Theme settings, Animations). A select with the id animation (theme, none, fade, fade_up, zoom) is optional and overrides that fade; CSS of the section's own does too. prefers-reduced-motion is a courtesy for a visitor who asked for less movement, not a reason to refuse the file, and not a limit on what may move. @media for that query is about the visitor, not about width.`,
  },
  {
    id: "assets",
    triggers: /image|picture|photo|asset|logo|icon|svg|video|media/i,
    text: `IMAGES come from an image_picker setting and are printed through the asset filter, never from a text or url setting holding an address: the editor draws an image_picker as the picker with an address box under it, so the creator can choose a file or paste a link, and a text setting only as a text box. The site's logo is theme.logo.url. Give every img a width, a height and an alt, and set object-fit where the crop matters. A section that renders an empty image box when nothing has been chosen looks broken; put the placeholder behind {% if %}.`,
  },
  {
    id: "editor-state",
    triggers: /empty|placeholder|preset|default|new section|first/i,
    text: `AN EMPTY STATE BELONGS BEHIND {% if page.in_editor %}, so it prompts the creator in the builder and never reaches a visitor. The schema's preset is what a section arrives with: fill it, so adding the section produces something finished rather than a shell.`,
  },
  {
    id: "settings-resolution",
    triggers: /setting|control|schema|option|default|toggle|range|select/i,
    text: `A SETTING'S VALUE is the creator's choice if they made one, otherwise the schema's default. A field id that does not exist, and a value the control cannot take, are both ignored silently by the renderer, so a change written against either looks like it worked and does nothing. Padding and spacing belong in range settings with a px unit rather than fixed numbers in the CSS.`,
  },
  {
    id: "multi-instance",
    triggers: /twice|two|multiple|instance|duplicate|id=|anchor/i,
    text: `A SECTION CAN BE ON A PAGE MORE THAN ONCE. Nothing in it may assume it is alone: no literal id="..." in the markup, because two instances would then share one id. Build ids from {{ section.id }}, and have the script query inside root rather than the document.`,
  },
  {
    id: "accessibility",
    triggers: /accessib|a11y|screen reader|aria|keyboard|focus|label|contrast|alt/i,
    text: `INTERACTIVE THINGS MUST BE REACHABLE. A control that can be clicked is a button or a link, not a div with a handler. <details>/<summary> is keyboard-accessible for free. Anything that opens says so with aria-expanded, every image has alt text, and text keeps at least 4.5:1 against what is behind it. Headings go in order and describe the section.`,
  },
]

/**
 * The topics this request is about, most relevant first, capped.
 *
 * A cap rather than a relevance score: the triggers are deliberately loose, a
 * long request matches half of them, and four topics is already more Storelib
 * detail than most changes need. Order is the order they are declared in,
 * which puts format before taste.
 */
export function knowledgeFor(request: string, opts: { limit?: number } = {}): Topic[] {
  const limit = opts.limit ?? 4
  const text = request.slice(0, 4_000)
  return TOPICS.filter((t) => t.triggers.test(text)).slice(0, limit)
}

/** The retrieved topics as one block, or "" when nothing matched. */
export function knowledgeBlock(request: string, opts: { limit?: number } = {}): string {
  const topics = knowledgeFor(request, opts)
  if (!topics.length) return ""
  return `STORELIB REFERENCE, for what you are about to do:\n\n${topics.map((t) => t.text).join("\n\n")}`
}

/**
 * Named topics, in the order asked for.
 *
 * Writing a WHOLE section from nothing needs some of these every time rather
 * than when a word happens to match: a new file has to decide whether it has
 * blocks at all (most single-purpose sections do not), always takes a colour
 * scheme, always has to be responsive, and arrives with the theme's motion. Composing them from the
 * same array is what stops the authoring prompt and the retrieved reference
 * drifting into two different accounts of the same format.
 */
export function topicsById(ids: string[]): string {
  return ids
    .map((id) => TOPICS.find((t) => t.id === id)?.text ?? "")
    .filter(Boolean)
    .join("\n\n")
}

/** What every new section needs, whatever it is a section of. */
export const AUTHORING_ESSENTIALS = topicsById([
  "blocks",
  "rich-settings",
  "color-scheme",
  "responsive",
  "css-scoping",
  "editor-state",
  "multi-instance",
  "script",
  "forms",
])

/** Every topic, for tests and for the one surface that wants the lot. */
export const ALL_TOPICS: readonly Topic[] = TOPICS

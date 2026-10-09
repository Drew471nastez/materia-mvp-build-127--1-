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
    id: "blocks",
    triggers: /block|repeat|item|entry|question|tier|testimonial|logo|slide|card|list|faq|accordion|gallery/i,
    text: `BLOCKS ONLY FOR A LIST THE CREATOR GROWS (questions, testimonials, slides, logos, tiers): declare the type, loop over \`blocks\`, data-block-id="{{ block.id }}" on each, preset 2 or 3, never question_1 / question_2. One of each thing (a hero, a banner, a call to action) is plain settings, NO blocks; no @theme blocks unless asked. Motion is the section's own CSS. A select with the id animation can follow or override the theme's entrance; it is optional.`,
  },
  {
    /*
      PRODUCTS AND COLLECTIONS, BOUND TO THE STORE. Every product section the
      model writes reads the catalogue; the checker refuses the rest
      (lib/storelib-ai/integration.ts, integration-products).
    */
    id: "store-binding",
    triggers: /product|shop|store|catalog|collection|price|buy|cart|checkout|carousel|grid|featured|recommend|bestsell|merch|cloth|apparel|course|membership|download/i,
    text: `PRODUCTS COME FROM THE STORE, NEVER FROM THE SECTION. The shop: {% for block in products %} with block.settings.title, price, compare_price, image, images, url, available, tag, checkout_url, fields (the product's custom fields by name: block.settings.fields.material) and variants (each with name, price, available, checkout_url). One product: a product_picker setting, printed as settings.product.title, .price, .image, .checkout_url (on the product page set it to @current for the page's own product, and page.product is there too). Several in the creator's order: a product_list setting, looped {% for block in settings.featured %} exactly like products. A collection: a collection_picker, with settings.collection.title, .url, .products_count and .products to loop; several: a collection_list. On a collection page, collection is the page's own. A buy button is the product's checkout_url (a variant's for one option); "Sold out" when available is false. Cards typed by the creator are optional overrides that fall back to the chosen product: {{ block.settings.title | default: block.settings.product.title }}. Defaults and presets never invent a product or a price; an empty product setting draws a short note only when page.in_editor. Filtering and sorting are the shop page's (page.filters), not a script's.`,
  },
  {
    /*
      RICH SETTINGS, the way a Shopify theme's schema reads. The format
      lists every control by name (CORE_FORMAT); this says which one fits
      what, so a section is not all text and range boxes.
    */
    id: "rich-settings",
    triggers: /setting|option|configur|customi[sz]|schema|editable|control|flexib|shopify|let (?:me|them|the creator|creators) (?:change|pick|choose|edit)/i,
    text: `SETTINGS A CREATOR CAN USE. Pick the control that fits the value: inline_richtext for a heading with emphasis, richtext for body copy, image_picker plus focal_point (with "image": "<picture id>") for a picture that crops, image_gallery for several, video_url for YouTube or Vimeo, icon_picker for an icon, url for a button link (it takes a page, a product or any address), product_picker or product_list for real products, collection_picker or collection_list, link_list for a menu, datetime for a countdown, alignment for left, centre or right, color_background for a gradient, select or radio for a style choice (radio when there are 2 to 4 options). Group the panel with "header" settings in the order a creator works (Content, Layout, Style), give "info" one plain line where a setting needs it, and hide what only matters in one mode with "visible_if": "{{ section.settings.layout == 'split' }}". Mark sizes that differ on a phone "responsive": true. Every setting has a sensible default so the section looks finished when added, and presets show it filled in.`,
  },
  {
    id: "theme-blocks",
    triggers: /theme block|@theme|content_for|nested|group|blocks? inside|static block|preset|layout of blocks|build(?:ing)? blocks|heading block|image block|button block/i,
    text: `THEME BLOCKS work as Shopify's do. A file blocks/<type>.storelib has <template>, <style> and <schema> (name, settings, optional "blocks": [{"type":"@theme"}] to hold blocks, max_blocks, presets, tag, class), and no <script>. The theme ships heading, text, button, image, video, spacer and group. A section takes them with "blocks": [{ "type": "@theme" }] (or names them: [{ "type": "image" }]) and draws them with {% content_for "blocks" %}; it does not also declare blocks of its own. Each is wrapped in <div class="sl-block" data-block-id data-block-type>, so style a row with .row > .sl-block { flex: 1 1 0 }. Inside a block file, read block.settings.<id> (or settings.<id>), block.blocks, and section.settings.<id> for the section it sits in; prefix classes. A colour a block draws is a color setting whose default names a scheme colour ("default": "scheme.heading"), which follows the section's scheme until the creator picks one; write it into an inline custom property, style="--heading-color: {{ block.settings.color | default: scheme.heading }};", and read it in the block's one rule with the section's --s-* property as the fallback: color: var(--heading-color, var(--s-heading)). The shipped heading and text have a text color, button a fill, text and hover pair per style (shown by visible_if on style), and group an optional background ("" for none) and a corner radius. A static block is placed by the template: {% content_for "block", type: "heading", id: "title" %}. Presets are written the Shopify way: "blocks": { "title": { "type": "heading", "static": true, "settings": {…} }, "row": { "type": "group", "settings": {"direction":"row"}, "blocks": {…}, "block_order": […] } }, "block_order": ["row"]. Every non-static key is in block_order. A file whose name starts with _ is private: only a section that names it can hold it. On a page, add_block takes parentBlockId to add inside a group, and a nested block's id is its path, outer/inner.`,
  },
  {
    id: "color-scheme",
    triggers: /colou?r|scheme|background|dark|light|contrast|palette|brand|theme/i,
    text: `COLOURS MAY FOLLOW THE SCHEME, AND THE CREATOR MAY OVERWRITE THEM. A color_scheme setting and a color setting per element (default "scheme.heading", "scheme.text", "scheme.primary_button_background") let the sidebar change one colour. Scheme keys: ${SCHEME_COLOR_KEYS.join(", ")}. The aliases bg, paragraph, primary_btn_bg and primary_btn_text still resolve. Built-in schemes: white, light, dark, black and highlight (Light, Soft, Dark, Brand, Accent). A fixed colour is allowed. Print a color setting on the root, --s-heading: {{ settings.heading_color }}, and paint with var(--s-heading), when the sidebar should own it.`,
  },
  {
    id: "theme-globals",
    triggers: /logo|brand|social|instagram|store name|site name|theme setting|global|button style|animation|favicon/i,
    text: `THE THEME'S GENERAL SETTINGS ARE READ, NOT RETYPED (Shopify's settings.logo). A section may read: theme.logo.url, .width, .mobile_url, .mobile_width and .text (the store name, for no picture); shop.name, shop.tagline, shop.logo; shop.socials, each { key, label, url }, looped {% for link in shop.socials %}; theme.buttons; theme.layout; theme.animation; theme.typography; theme.schemes; and theme.settings. Logo size and colour are settings the section may offer; theme.logo.width is a starting width, not a fixed size. Motion is the section's own CSS. A select with the id animation and the values theme, none, fade, fade_up and zoom is optional: "theme" follows Theme settings, anything else overrides it.`,
  },
  {
    id: "typography",
    triggers: /font|type|heading|text size|typograph|weight|uppercase|letter|headline/i,
    text: `TYPE MAY COME FROM THE THEME. The theme carries font roles (${FONT_ROLES.join(", ")}) and a type scale (${TYPE_STYLE_KEYS.join(", ")}), each with its own desktop, tablet and mobile size. A section may read them, or set its own type. Naming a font is allowed.`,
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

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
  /* First, so a request about the header never loses it to the cap: writing a header file is the mistake this exists to stop. */
  {
    id: "site-chrome",
    triggers: /header|navbar|nav ?bar|navigation|menu ?bar|top ?bar|footer|sticky|mega ?menu/i,
    text: `THE SITE HAS ONE HEADER AND ONE FOOTER, built in, of type "header" and "footer", on every page. CONNECT TO THEM, do not rebuild them: set their settings and links, and the theme's logo_url and brand_name, which both show. NEVER write a section file that is a header, a navigation bar or a footer, and never put header or footer content in a page: it is refused on save. The one exception is a creator who explicitly asks for a header of their own: then ONE section with "kind": "header" in its schema replaces the built-in one on every page, with a link_list setting for its menu (default "main-menu"), an image_picker or theme.logo.url for the logo, and a color setting per element. Never two. An announcement bar that sits above the header says "enabled_on": { "groups": ["header"] } or has category "announcement". The header's settings: header_layout, mobile_header_layout, mobile_menu_style (left, right, full), header_sticky_enabled, header_sticky_on_scroll_up, header_transparent with header_transparent_scope (all, home), show_search_icon with search_behaviour (header, page), show_account_icon, show_wishlist_icon, show_cart_icon (opens the cart drawer), show_cta_button with cta_text and cta_url, logo_url, logo_height, header_width, color_scheme, menu (a menu's handle, or empty for its own links). Its links are nav_link blocks {label, url, link_type: "custom"}, a sub-link naming its parent in parent_id, one level deep. A MENU is a named list of links the whole site shares (Website settings, Navigation); setting the header's menu to its handle shows that list instead of the header's own links, and a change to the menu reaches every place that shows it. The footer: logo_url, tagline, copyright, menu and menu_2 (menu handles), footer_column and footer_link blocks, show_policies, show_newsletter, show_social, show_payment_icons, layout, color_scheme.`,
  },
  {
    id: "blocks",
    triggers: /block|repeat|item|entry|question|tier|testimonial|logo|slide|card|list|faq|accordion|gallery/i,
    text: `REPEATED CONTENT IS BLOCKS, never question_1 / question_2. Declare a block type in the schema with its own settings, and loop over \`blocks\` in the template. Put data-block-id="{{ block.id }}" on each one so clicking it in the builder selects it. A preset with two or three blocks in it is what makes the section arrive with something in it rather than empty. Block settings are read as block.settings.<id> and must be declared on that block type.`,
  },
  {
    id: "theme-blocks",
    triggers: /theme block|@theme|content_for|nested|group|blocks? inside|static block|preset|layout of blocks|build(?:ing)? blocks|heading block|image block|button block/i,
    text: `THEME BLOCKS work as Shopify's do. A file blocks/<type>.storelib has <template>, <style> and <schema> (name, settings, optional "blocks": [{"type":"@theme"}] to hold blocks, max_blocks, presets, tag, class), and no <script>. The theme ships heading, text, button, image, video, spacer and group. A section takes them with "blocks": [{ "type": "@theme" }] (or names them: [{ "type": "image" }]) and draws them with {% content_for "blocks" %}; it does not also declare blocks of its own. Each is wrapped in <div class="sl-block" data-block-id data-block-type>, so style a row with .row > .sl-block { flex: 1 1 0 }. Inside a block file, read block.settings.<id> (or settings.<id>), block.blocks, and section.settings.<id> for the section it sits in; prefix classes. A colour a block draws is a color setting whose default names a scheme colour ("default": "scheme.heading"), which follows the section's scheme until the creator picks one; write it into an inline custom property, style="--heading-color: {{ block.settings.color | default: scheme.heading }};", and read it in the block's one rule with the section's --s-* property as the fallback: color: var(--heading-color, var(--s-heading)). The shipped heading and text have a text color, button a fill, text and hover pair per style (shown by visible_if on style), and group an optional background ("" for none) and a corner radius. A static block is placed by the template: {% content_for "block", type: "heading", id: "title" %}. Presets are written the Shopify way: "blocks": { "title": { "type": "heading", "static": true, "settings": {…} }, "row": { "type": "group", "settings": {"direction":"row"}, "blocks": {…}, "block_order": […] } }, "block_order": ["row"]. Every non-static key is in block_order. A file whose name starts with _ is private: only a section that names it can hold it. On a page, add_block takes parentBlockId to add inside a group, and a nested block's id is its path, outer/inner.`,
  },
  {
    id: "color-scheme",
    triggers: /colou?r|scheme|background|dark|light|contrast|palette|brand|theme/i,
    text: `COLOUR COMES FROM THE SCHEME. Declare a color_scheme setting and read the scheme in the template and CSS. Its keys: ${SCHEME_COLOR_KEYS.join(", ")}. The aliases bg, paragraph, primary_btn_bg and primary_btn_text still resolve. Paint a button's hover from its hover keys, never with opacity. Built-in schemes: white, light, dark, black and highlight (Light, Soft, Dark, Brand, Accent); a creator can add more. Never hardcode a hex value the scheme answers: it stops responding to the creator's theme. EVERY ELEMENT IT DRAWS GETS A color SETTING whose default NAMES a scheme colour (heading_color "scheme.heading", text_color "scheme.text", button_color "scheme.primary_button_background", card_color "scheme.background_secondary", border_color "scheme.border", stars "scheme.accent"). It follows the scheme until the creator picks one. Print it on the root, --s-heading: {{ settings.heading_color }}, and paint with var(--s-heading).`,
  },
  {
    id: "theme-globals",
    triggers: /logo|brand|social|instagram|store name|site name|theme setting|global|button style|animation|favicon/i,
    text: `THE THEME'S GENERAL SETTINGS ARE READ, NEVER RETYPED (Shopify's settings.logo). A section reads: theme.logo.url, .width, .mobile_url, .mobile_width and .text (the store name, for no picture); shop.name, shop.tagline, shop.logo; shop.socials, each { key, label, url }, looped {% for link in shop.socials %}; theme.buttons (.style filled, outline or ghost, .shape, .radius, .size, .weight, .shadow, .hover); theme.layout (.page_width, .padding_x, .section_gap, .spacing_scale, .card_radius, .image_radius, .card_shadow); theme.animation (.enabled, .style, .duration, .stagger); theme.typography; theme.schemes; and every stored theme setting under theme.settings. A section's own entrance animation is a select setting with the id animation and the values theme, none, fade, fade_up and zoom: "theme" follows Theme settings, anything else overrides it for this section.`,
  },
  {
    id: "typography",
    triggers: /font|type|heading|text size|typograph|weight|uppercase|letter|headline/i,
    text: `TYPE COMES FROM THE THEME. The theme carries font roles (${FONT_ROLES.join(", ")}) and a type scale (${TYPE_STYLE_KEYS.join(", ")}), each with its own desktop, tablet and mobile size. Read them from theme rather than naming a font family inside a section. Expose a type control only when the section genuinely needs one.`,
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
    text: `ANIMATION IS CSS FIRST. Transition the properties that are cheap to animate: opacity and transform. Height from 0 to auto does not transition; use grid-template-rows 0fr to 1fr, or max-height, or transform. Anything that moves must be wrapped so it stops for people who have asked it to: @media (prefers-reduced-motion: reduce) { … } with the transition or animation set to none. That media query is about the visitor's own setting, not about width, so it is the one place @media is right.`,
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
 * than when a word happens to match: a new file always declares blocks, always
 * takes a colour scheme, always has to be responsive. Composing them from the
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

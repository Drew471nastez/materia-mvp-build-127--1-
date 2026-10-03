/**
 * ===========================================================================
 *  SKILLS: WHAT AN AGENT NEEDS TO KNOW FOR THE TASK IN FRONT OF IT
 * ===========================================================================
 * The rules (lib/agent-rules) are how to work, the same on every task. A
 * skill is how to do ONE kind of task well: the steps, the tools to use, the
 * part of the framework it touches, what goes wrong, and the checks that say
 * it is done. This is Ask Storelib's trainer, and the same one agents over
 * MCP are handed.
 *
 * Handing a model every skill on every request is thousands of tokens of
 * mostly irrelevant detail, and a model given everything weighs everything.
 * So `selectSkills` picks the few a request is about, and only those go in:
 *
 *   - over MCP, `storelib_skills` with the task in the agent's own words
 *     (lib/agent-access/mcp.ts), and the chosen skills' checks are what
 *     `storelib_run_tests` runs;
 *   - in the builder, Storelib AI's turn carries `skillContext(prompt)`
 *     (lib/website-builder/agent/loop.ts), and a request that matches no
 *     skill carries none: a headline change needs no authoring reference.
 *
 * THE FRAMEWORK FACTS ARE NOT REPEATED HERE. A skill names what it needs:
 * knowledge topics from lib/storelib-ai/knowledge (which imports the control,
 * filter and capability lists from the compiler), and sections of the
 * developer docs (`docs`, read through lib/developers/doc-sections). Two
 * accounts of the same format drift; one cannot. When a new setting type or
 * page lands in the docs, the skill that points there reads it next request.
 *
 * Short on purpose. A skill is a checklist a good engineer would keep beside
 * them for the task, not an essay: steps, pitfalls, checks.
 */

import { topicsById } from "@/lib/storelib-ai/knowledge"
import { docSection } from "@/lib/developers/doc-sections"

/** Checks storelib_run_tests knows how to run. See lib/agent-access/checks.ts. */
export type CheckId = "compile" | "quality" | "page-types" | "page-settings" | "contrast" | "limits"

export interface Skill {
  id: string
  title: string
  /** One line: what the task is. Shown in the list. */
  summary: string
  /** Words that mean a request is this task. Scored, not just matched. */
  triggers: RegExp[]
  steps: string[]
  /** MCP tools, in the order they are used. */
  tools: string[]
  /** lib/storelib-ai/knowledge topic ids, composed in, not copied. */
  topics: string[]
  /**
   * Sections of the developer docs, by page and heading, composed in at
   * request time. The docs are the one account of the format.
   */
  docs?: { page: string; heading: string }[]
  /** What goes wrong, and what to do instead. */
  pitfalls: string[]
  /**
   * What the builder's assistant does differently, in its own tools' names,
   * when that is not obvious from the steps: it has no file paths and no
   * compile tool, and reads the store with read_store.
   */
  builder?: string[]
  /** What storelib_run_tests checks for this task. */
  checks: CheckId[]
  /** Where a worked example lives, for a model that wants one. */
  examples?: string[]
}

export const SKILLS: Skill[] = [
  {
    id: "build-section",
    title: "Build a new section",
    summary: "Write a section type that does not exist yet, from a description.",
    triggers: [/\b(new|create|build|make|add|write|design)\b.{0,40}\bsection/i, /from scratch|custom section/i],
    steps: [
      "storelib_search_components for the job. If a section already does it, use that and stop here.",
      "Read one close built-in section with storelib_read_file and keep its setting ids for the same jobs.",
      "Write the file: every visible word, picture, link and button a setting or block, a color_scheme setting, container queries, a preset that arrives filled.",
      "storelib_compile until clean, then storelib_create_section with the page to put it on.",
      "storelib_run_tests on the file and the page, then storelib_run_preview.",
    ],
    tools: ["storelib_search_components", "storelib_read_file", "storelib_compile", "storelib_create_section", "storelib_run_tests", "storelib_run_preview"],
    topics: ["blocks", "color-scheme", "responsive", "editor-state", "multi-instance"],
    pitfalls: [
      "A whole page written as one section. Split it: header, hero, features, footer, each its own file.",
      "Text or links typed into the markup. The creator cannot change them.",
      "A schema name that is already another section's name. The save refuses it.",
    ],
    builder: ["Build from the section types listed on add_section: read_section_type first, then add_section and fill every block and control."],
    checks: ["compile", "quality", "page-types"],
    examples: ["sections/faq.storelib", "https://storelib.com/developers/examples"],
  },
  {
    id: "image-to-section",
    title: "A section from a picture",
    summary: "Build a section like a screenshot or mockup: its layout and style, with this site's theme and content.",
    /* A picture attached to the request selects this on its own: see selectSkills. */
    triggers: [
      /screenshot|mock ?up|figma|wireframe|dribbble|from (an? |this |the )?(image|picture|photo)/i,
      /\b(similar|like this|like that|looks like|same as|replicate|recreate|copy (this|the) (page|design|layout|section))\b/i,
    ],
    steps: [
      "Read the picture in order: layout, hierarchy, spacing, type, colour, shape, then every slot (heading, text, button, price, image).",
      "Find the built-in section closest to its layout (storelib_search_components). Its settings may already do it; a new file only when none is close.",
      "Map its colours to the nearest colour scheme of this site and its type to the theme's scale. Custom colours only where no scheme is close.",
      "Fill every slot with this creator's words and products (storelib_site), the same length as the slot in the picture. Leave photographs empty for the creator's own.",
      "A whole page is split into sections, top to bottom. If the picture cannot be read, ask one question.",
    ],
    tools: ["storelib_site", "storelib_search_components", "storelib_read_file", "storelib_create_section", "storelib_run_tests", "storelib_run_preview"],
    topics: ["color-scheme", "responsive", "blocks"],
    pitfalls: [
      "Copying the picture's headline, logo, brand name, prices or testimonials. They are somebody else's.",
      "Hex colours lifted from the picture when a scheme of this site is close.",
      "One giant section for a whole page, or a layout that only works at the picture's width.",
    ],
    builder: ["read_store for the words and products; a built-in section from add_section with its controls set is usually the answer; write code only for a layout no section has."],
    checks: ["compile", "quality", "page-types", "contrast"],
  },
  {
    id: "edit-section",
    title: "Change a section safely",
    summary: "Change how a section the creator already has is built: its markup, CSS, script or schema, without losing anything.",
    triggers: [/\b(change|edit|fix|update|modify|tweak|adjust)\b.{0,40}\b(section|markup|template|file|code|css)/i, /\bbug\b|broken|doesn'?t work|not working/i],
    steps: [
      "storelib_read_selected_section, or storelib_read_page, to find the instance and its type.",
      "storelib_read_file for the type and keep its updated_at.",
      "If it is built in, it cannot be written. Copy it under a new type with the same setting ids, place it with storelib_create_section, and hide the old instance with a set_section_visibility patch.",
      "Change only the lines the task needs with storelib_patch_section (find and replace, each find once in the file) and base_updated_at.",
      "storelib_run_tests on the file.",
    ],
    tools: ["storelib_read_selected_section", "storelib_read_file", "storelib_patch_section", "storelib_run_tests"],
    topics: ["css-scoping", "settings-resolution"],
    docs: [{ page: "schema", heading: "Changing a section safely" }],
    pitfalls: [
      "Rewriting the whole file to change one thing. Every unrelated line changed is a regression waiting.",
      "Removing or renaming a setting id. The creator's content under it disappears from the page.",
      "Saving without base_updated_at. A newer save by the creator could be overwritten; the tool refuses a stale one when it is sent.",
    ],
    builder: ["read_section_code, then edit_section_code with exact find and replace for the lines that change. write_section_code with the whole file only for a new layout."],
    checks: ["compile", "quality"],
  },
  {
    id: "schema-design",
    title: "Section settings and schema",
    summary: "Decide which settings and blocks a section offers the creator, and write them in its schema.",
    triggers: [/\bschema\b|\bsettings?\b.{0,30}\b(add|new|expose|offer)|let (me|them|the creator|users?) (change|choose|pick|edit|turn)|customi[sz]|configurable|option to/i],
    steps: [
      "List the choices a creator would make again: colour scheme, layout, alignment, columns, spacing, what shows. Not CSS properties.",
      "Reuse the setting ids other sections use for the same job, so content carries over.",
      "Repeated content is a block type with its own settings; set max_blocks where a layout breaks past a number.",
      "Give every setting a default that looks finished, and a preset that arrives filled.",
    ],
    tools: ["storelib_read_file", "storelib_compile", "storelib_patch_section", "storelib_run_tests"],
    topics: ["settings-resolution", "blocks", "editor-state"],
    docs: [{ page: "schema", heading: "A setting" }],
    pitfalls: [
      "A setting per CSS property (flex-direction, z-index, letter-spacing).",
      "Ten colour pickers beside a colour scheme that already answers them.",
      "A setting added for a one-off fix. Put the fix in the CSS.",
    ],
    checks: ["compile", "quality"],
  },
  {
    id: "restyle",
    title: "Colours, schemes and buttons",
    summary: "Change how sections look using the settings they already have: colour scheme, button colours and hover, backgrounds.",
    triggers: [/colou?r|scheme|background|dark mode|light|palette|brand|contrast|button|hover|cta/i],
    steps: [
      "storelib_read_selected_section to see the section's settings and which scheme it uses.",
      "Prefer switching the section's color_scheme to a scheme the site has (storelib_read_project lists them) over per-section colours.",
      "For one section's own colours, storelib_update_styles with the setting ids the section declares. Leave a hover colour empty to let it follow the fill.",
      "For the whole site, storelib_update_styles with scope theme.",
      "storelib_run_tests on the page: contrast must be at least 4.5:1.",
    ],
    tools: ["storelib_read_selected_section", "storelib_read_project", "storelib_update_styles", "storelib_run_tests"],
    topics: ["color-scheme"],
    pitfalls: [
      "A hex value where a scheme would do. It stops following the creator's theme.",
      "A hover drawn with opacity. Hover has its own keys and follows the fill when left empty.",
      "Light text on a light scheme. The contrast check fails it.",
    ],
    builder: ["update_section with color_scheme set to a scheme the theme has before any colour of a section's own; the whole site's colours are update_theme. Neighbouring sections on different schemes give a page its rhythm."],
    checks: ["page-settings", "contrast"],
  },
  {
    id: "typography",
    title: "Type and text styling",
    summary: "Fonts, sizes, weights and text styles, for the site or one section.",
    triggers: [/font|typograph|type ?scale|heading size|text size|weight|letter ?spacing|uppercase|line height/i],
    steps: [
      "Site wide: storelib_update_styles with scope theme on the font and type scale settings.",
      "One section: only the type settings the section declares. A section never names a font family.",
      "storelib_run_preview at phone width: each size has its own phone value.",
    ],
    tools: ["storelib_read_project", "storelib_update_styles", "storelib_run_preview"],
    topics: ["typography"],
    pitfalls: ["A font-family in a section's CSS. It breaks the theme's type for that section only."],
    checks: ["page-settings"],
  },
  {
    id: "layout",
    title: "Layout, spacing and phones",
    summary: "Spacing, alignment, columns, borders and how a section behaves at phone, tablet and desktop width.",
    triggers: [/mobile|phone|tablet|responsive|breakpoint|stack|column|spacing|padding|margin|align|center|border|overflow|sideways scroll|width|gap/i],
    steps: [
      "Spacing and alignment the section declares (padding_top, padding_bottom, alignment) are settings: storelib_update_styles.",
      "Behaviour that is not a setting is the file: container queries, phone layout first.",
      "storelib_run_preview and look at 375px and 1280px.",
    ],
    tools: ["storelib_read_selected_section", "storelib_update_styles", "storelib_patch_section", "storelib_run_preview"],
    topics: ["responsive", "settings-resolution"],
    pitfalls: ["@media for width. Use @container.", "100vh. Use var(--sl-vh) so the builder and the live site agree."],
    checks: ["quality", "page-settings"],
  },
  {
    id: "landing-page",
    title: "A whole landing page",
    summary: "Build a full page from nothing: a running order of finished sections about the real business, ending on one ask.",
    triggers: [
      /\b(landing|sales|launch|home|one)[ -]?page\b|\bhomepage\b/i,
      /\b(whole|full|complete|entire)\b.{0,20}\b(page|site|website)\b|\bbuild (me )?(a|my|the) (page|site|website)\b/i,
    ],
    steps: [
      "Read the business first (storelib_site): what it sells, to whom, what it costs. With no products, the page sells the creator, not a catalogue.",
      "Write the running order before any section: what it is and who it is for, proof, what they get, the price, questions, the ask. Five or six sections.",
      "For each, storelib_search_components for a built-in section that does the job; a new file only when none does.",
      "storelib_create_page with the sections in order, then fill every block and heading in one storelib_create_safe_patch.",
      "Alternate colour schemes so neighbours differ, and keep one button wording for the main action all the way down.",
      "storelib_run_tests on the page (page-types, page-settings, contrast, limits), then storelib_run_preview at phone and desktop width.",
    ],
    tools: ["storelib_site", "storelib_search_components", "storelib_create_page", "storelib_create_safe_patch", "storelib_run_tests", "storelib_run_preview"],
    topics: ["color-scheme", "blocks"],
    pitfalls: [
      "One long section standing in for a page, or six sections each with a different style.",
      "Sections left on their preset's demo copy. Every one gets this store's words before the next is started.",
      "Numbers, reviews or guarantees nobody gave you. Leave the slot for the creator, or ask.",
      "A product grid on a store with no products. It renders empty.",
    ],
    builder: [
      "Plan the running order in your first turn, then per section: read_section_type, add_section at its index, fill every block and control, then the next. read_store first.",
      "Alternate color_scheme between neighbours; finish with one call to action that names what the buyer does.",
    ],
    checks: ["page-types", "page-settings", "contrast", "limits"],
    examples: ["https://storelib.com/developers/examples"],
  },
  {
    id: "compose-page",
    title: "Pages and page structure",
    summary: "Create a page, add sections to it, reorder, hide or rename them.",
    triggers: [/\bpage\b|about us|contact page|landing|reorder|move .* (up|down|above|below)|hide|show|arrange/i],
    steps: [
      "storelib_read_project for the pages that exist, storelib_search_components for sections to use.",
      "storelib_create_page with its sections from the library, or a patch of add_section, move_section and set_section_visibility operations.",
      "storelib_run_tests on the page.",
    ],
    tools: ["storelib_read_project", "storelib_search_components", "storelib_create_page", "storelib_create_safe_patch", "storelib_run_tests"],
    topics: [],
    pitfalls: ["Removing a section the creator filled in. Hide it instead unless they asked for it gone.", "A section above the header or below the footer. The operations keep them in place."],
    checks: ["page-types", "page-settings", "limits"],
  },
  {
    id: "repeated-content",
    title: "Lists, cards, FAQs and menus",
    summary: "Anything repeated: FAQ entries, cards, testimonials, logos, pricing tiers, menu links.",
    triggers: [/block|faq|question|testimonial|review|logo|tier|pricing|card|list|menu|nav|link|slide|gallery|item|entry/i],
    steps: [
      "Content in an existing section: add_block, update_block and move_block operations in a patch.",
      "A new section: declare a block type and loop over blocks, with data-block-id on each.",
    ],
    tools: ["storelib_read_selected_section", "storelib_create_safe_patch", "storelib_patch_section"],
    topics: ["blocks"],
    pitfalls: ["question_1, question_2 settings. Use blocks.", "More blocks than the section's limit. The page check refuses it.", "Testimonials or reviews nobody wrote. Leave them for the creator."],
    checks: ["page-settings", "limits"],
  },
  {
    id: "theme-blocks",
    title: "Theme blocks and blocks inside blocks",
    summary: "Build with theme blocks: block files in blocks/, sections that take them with content_for, groups that hold blocks, static blocks and presets.",
    triggers: [/theme blocks?|content_for|@theme|blocks?\/|static block|nested block|blocks? (inside|within|in) (a |another )?(block|group)|\bgroup block\b/i],
    steps: [
      "storelib_list_files for blocks/: heading, text, button, image, video, spacer and group ship with the theme. Use them before writing a new one.",
      "A section takes them with \"blocks\": [{ \"type\": \"@theme\" }] and draws them with {% content_for \"blocks\" %}, and declares no blocks of its own.",
      "A new block is blocks/<type>.storelib: template, style and schema, no script. Prefix its classes and take colours from the section's --s-* properties.",
      "A row or column is a group holding blocks. A block the template places itself is static: {% content_for \"block\", type: \"heading\", id: \"title\" %}.",
      "Presets the Shopify way: blocks keyed by id with block_order, every non static key listed. storelib_compile, then storelib_run_tests.",
    ],
    tools: ["storelib_list_files", "storelib_read_file", "storelib_write_section", "storelib_compile", "storelib_run_tests"],
    topics: ["theme-blocks"],
    docs: [
      { page: "blocks", heading: "Rendering theme blocks: content_for" },
      { page: "blocks", heading: "Static blocks" },
    ],
    pitfalls: [
      "A <script> in a block file. The section owns the script; it finds its blocks by data-block-type.",
      "A section that takes @theme and also loops over blocks of its own. Pick one.",
      "A preset key missing from block_order. It is never drawn.",
      "Changing a built-in block file. Write blocks/<type>_custom.storelib instead.",
    ],
    builder: ["On a page: add_block with parentBlockId to put a block inside a group, address a nested block by its path outer/inner, and change a static block's settings but never remove it."],
    checks: ["compile", "quality"],
    examples: ["blocks/group.storelib", "https://storelib.com/developers/blocks"],
  },
  {
    id: "section-colours",
    title: "A section's own colour settings",
    summary: "Give a section colour controls the creator can change, without leaving the theme's colour schemes.",
    triggers: [
      /colou?r (setting|control|picker|option|choice)s?|(own|custom|separate|different) colou?rs?\b/i,
      /let (me|them|the creator|users?) (change|pick|choose|set) (the |its )?colou?r/i,
    ],
    steps: [
      "Start from the color_scheme setting: most colour requests are a different scheme, and the section already has one.",
      "Only for a colour no scheme key answers (stars, a badge, an overlay): a color setting whose default names a scheme colour, \"default\": \"scheme.accent\".",
      "Read it in the template or CSS as {{ settings.star_color }}. It follows the scheme until the creator picks a colour, then keeps theirs.",
      "Buttons keep the scheme's button keys and hover keys; no per section button colours drawn with opacity.",
      "storelib_compile, then storelib_run_tests with contrast.",
    ],
    tools: ["storelib_read_file", "storelib_patch_section", "storelib_compile", "storelib_run_tests"],
    topics: ["color-scheme"],
    docs: [{ page: "styling", heading: "Colour schemes" }],
    pitfalls: [
      "A hex default. It stops following the creator's theme the day they change their palette.",
      "A colour picker per element beside a color_scheme that already answers them.",
      "Text colour set without its background. The contrast check fails it on the other schemes.",
    ],
    builder: ["To recolour a section on the page, update_section its color_scheme to one the theme has, or the colour settings read_section lists. Adding a colour control is a code change: read_section_code, then edit_section_code on the schema and the CSS."],
    checks: ["compile", "quality", "contrast"],
  },
  {
    id: "navigation",
    title: "Navigation menus",
    summary: "The header's links and sub links, the footer's link columns, and the site's named menus.",
    triggers: [/\b(nav|navigation|menus?|header links?|footer links?|sub ?menus?|sub ?links?|dropdown menu|mega ?menu|top bar links?)\b/i],
    steps: [
      "storelib_read_page for the header (or footer) instance. There is one of each, on every page; it is changed, never rebuilt.",
      "Header links are its nav_link blocks: label, url and link_type \"custom\", a sub link naming its parent in parent_id. One level of sub links.",
      "Or point the header's menu setting at one of the site's menus by handle (storelib_read_project lists them); its own links are then not shown.",
      "The footer: menu and menu_2 for two menus, and footer_column with footer_link blocks for columns of its own.",
      "One storelib_create_safe_patch with the add_block and update_block operations, then storelib_run_tests on the page.",
    ],
    tools: ["storelib_read_page", "storelib_read_project", "storelib_create_safe_patch", "storelib_run_tests"],
    topics: ["site-chrome"],
    docs: [{ page: "header-and-footer", heading: "What the header does" }],
    pitfalls: [
      "A new header, nav bar or footer section. It is refused, and it would have no cart, search or phone menu.",
      "A link to a page that does not exist. Read the pages first and link to those, or to /products/<slug>.",
      "Typing the site's menu out as links when a menu with those links already exists.",
    ],
    builder: ["read_section on the header, then add_block and update_block for its nav_link blocks, or update_section to set its menu. The footer the same way with footer_column and footer_link."],
    checks: ["page-settings"],
  },
  {
    id: "forms",
    title: "Email sign up and forms",
    summary: "Collect emails or contact messages for the creator.",
    triggers: [/form|e-?mail|sign ?up|subscri|newsletter|waitlist|contact|input|notify/i],
    steps: ["Use the contact or newsletter section if there is one. A new one uses data-storelib-form=\"subscribe\" with no script and no action."],
    tools: ["storelib_search_components", "storelib_create_section"],
    topics: ["forms", "accessibility"],
    pitfalls: ["Asking the creator for a form URL or API key. The platform collects the submissions."],
    checks: ["compile", "quality"],
  },
  {
    id: "media",
    title: "Images and video",
    summary: "Pictures, video and embeds.",
    triggers: [/image|picture|photo|video|youtube|vimeo|embed|iframe|media|gallery/i],
    steps: ["Pictures are image_picker settings through | asset; video is the embed filter with the embed capability."],
    tools: ["storelib_read_selected_section", "storelib_update_styles", "storelib_patch_section"],
    topics: ["assets", "embed"],
    pitfalls: ["An image URL in a default. The creator picks pictures.", "An iframe whose src is not from | embed. The save refuses it.", "A picture in a flex row without min-width: 0. Once it loads it widens to its own size and the page jumps."],
    checks: ["compile", "quality"],
  },
  {
    id: "interaction",
    title: "Menus, sheets, sliders and motion",
    summary: "Anything that opens, moves or responds: dropdowns, phone menus, tabs, carousels, entrance motion.",
    triggers: [/anim|motion|transition|slider|carousel|tab|accordion|modal|popup|dropdown|sheet|menu|toggle|scroll|hover effect/i],
    steps: ["HTML first: details, popover, radio :checked, scroll-snap. Script only for what they cannot do, inside root."],
    tools: ["storelib_read_file", "storelib_compile", "storelib_patch_section", "storelib_run_preview"],
    topics: ["script", "animation", "accessibility"],
    pitfalls: ["document.querySelector. Refused by name; query inside root.", "Motion that ignores prefers-reduced-motion."],
    checks: ["compile", "quality"],
  },
  {
    id: "selling",
    title: "Products, product pages and checkout",
    summary: "Show the creator's real products, build a product page, and send buyers to Storelib checkout and back.",
    triggers: [
      /product|price|shop|store|buy|cart|checkout|sell|collection|sold out|catalog|merch|preset|course|ebook|download/i,
      /product page|buy button|add to cart|variant|option|pay what you want/i,
    ],
    steps: [
      "storelib_site lists the published products with id, url, price, checkout_url and variants. With none, say so and add no product section.",
      "A list or grid: a built-in product section with source \"shop\" stays in step with the shop; a new section loops over products.",
      "One chosen product: loop over products and keep the one whose url or id matches a product_picker setting. On the product page, read page.product.",
      "Buy buttons link to checkout_url, or a variant's checkout_url for one option. Checkout returns the buyer to this site; never add payment code.",
      "storelib_run_tests, then storelib_run_preview on a product page.",
    ],
    tools: ["storelib_site", "storelib_search_components", "storelib_read_file", "storelib_create_section", "storelib_run_tests", "storelib_run_preview"],
    topics: ["blocks"],
    docs: [
      { page: "selling", heading: "Products reach a section" },
      { page: "selling", heading: "Buy buttons and checkout" },
    ],
    pitfalls: [
      "A made-up product, price or picture, or a price typed into a default.",
      "A payment form or payment script. Checkout takes the payment.",
      "A buy button on a product that is not available, or arithmetic on a price. Print the price you are given.",
    ],
    builder: [
      "read_store lists each product with its id, page address, prices, options and checkout address.",
      "product_grid, product_featured and product_spotlight with source shop draw the real catalogue; a product picker setting takes the product's page address, /products/<slug>.",
    ],
    checks: ["compile", "quality", "page-types"],
    examples: ["https://storelib.com/developers/selling", "https://storelib.com/developers/examples"],
  },
  {
    id: "copywriting",
    title: "Copy for creators",
    summary: "Write or rewrite headings, text and buttons about what the creator really sells.",
    triggers: [
      /\b(copy|copywriting|headlines?|taglines?|wording|rewrite|reword|slogan|bio|about (us|me))\b/i,
      /\b(shorter|longer|punchier|clearer|friendlier|tone|voice)\b|\bwrite\b.{0,30}\b(text|copy|description|intro|about)\b/i,
    ],
    steps: [
      "Read what the site sells (storelib_site) and the section's current words before writing any.",
      "One idea per heading, a few words long. Text says what the thing is and what happens. Buttons name the action.",
      "Keep each slot's length: a heading that fits one line still fits one line.",
    ],
    tools: ["storelib_site", "storelib_read_selected_section", "storelib_update_styles", "storelib_create_safe_patch"],
    topics: [],
    pitfalls: [
      "Filler (Welcome to our website, We are passionate about) and the banned words from the rules.",
      "Invented facts: a number of customers, a review, a guarantee, a delivery time.",
      "Em dashes, and a sentence explaining what a card already shows.",
    ],
    builder: ["update_section and update_block with the new words; read_store first when the words are about the business."],
    checks: ["page-settings"],
  },
  {
    id: "accessibility",
    title: "Accessibility",
    summary: "Keyboard, screen readers, labels, alt text, heading order and contrast.",
    triggers: [/accessib|a11y|screen reader|aria|keyboard|focus|alt text|contrast|label|heading order/i],
    steps: ["Buttons and links for anything clickable, a visible :focus-visible ring, alt on every image, labels on inputs, headings in order, aria-expanded on anything that opens, contrast of at least 4.5:1."],
    tools: ["storelib_read_file", "storelib_run_tests"],
    topics: ["accessibility"],
    pitfalls: ["A div with a click handler.", "outline: none with nothing in its place.", "An h4 chosen for its size."],
    checks: ["quality", "contrast"],
  },
  {
    id: "performance",
    title: "Speed and layout shift",
    summary: "Pictures that load light and hold their space, motion that does not jank, no script where CSS does it.",
    triggers: [/slow|speed|perf|lazy|load(ing)? time|jank|stutter|layout shift|\bcls\b|\blcp\b|heavy|lighter|faster/i],
    steps: [
      "Every img has width and height or an aspect-ratio, loading=\"lazy\" and decoding=\"async\" below the first screen.",
      "Animate opacity and transform only; nothing animates on scroll.",
      "Replace script with HTML and CSS where they do the job; a timer stops when its section is off screen.",
    ],
    tools: ["storelib_read_file", "storelib_patch_section", "storelib_run_tests", "storelib_run_preview"],
    topics: ["assets", "animation"],
    pitfalls: ["An image with no size, which moves the page as it arrives.", "Transitions on width, height, top or box-shadow."],
    checks: ["compile", "quality"],
  },
  {
    id: "questions",
    title: "When to ask, and how",
    summary: "Ask one short question with choices when a missing fact changes the result, and never otherwise.",
    triggers: [
      /\bwhich (product|page|one|colou?r)\b|\bfeature (a|my|one) product\b/i,
      /\b(my|our) (brand|colou?rs?|logo|hours|address|phone|prices?)\b|not sure|you (choose|decide|pick)/i,
    ],
    steps: [
      "First read everything a tool can tell you: products, pages, colour schemes, the conversation so far.",
      "Ask only if the answer still changes what you build: which of several products, which page, brand colours the site does not have, a business fact nowhere on the site.",
      "One sentence, two to four choices taken from what you read, and why in a few words. Then stop until it is answered.",
    ],
    tools: ["storelib_site", "storelib_read_project"],
    topics: [],
    pitfalls: [
      "Asking which product when the store has one.",
      "Asking about taste (which shade, which layout) you can decide.",
      "Asking again, in other words, what was just answered or skipped.",
    ],
    builder: ["ask_creator, once a run; the creator's tap is their next message, with this conversation shown above it."],
    checks: [],
  },
  {
    id: "debug",
    title: "Fix a compile error or a failing check",
    summary: "A save was refused, or a check failed.",
    triggers: [/error|refused|did not compile|doesn'?t compile|failed|failing|line \d+|undeclared|not declared/i],
    steps: [
      "Read the message: it names the file and line. Open that line with storelib_read_file.",
      "Change that line only, with storelib_patch_section. storelib_compile. Repeat.",
      "After three rounds on the same message, stop and report it with the line.",
    ],
    tools: ["storelib_read_file", "storelib_compile", "storelib_patch_section", "storelib_run_tests"],
    topics: ["settings-resolution"],
    pitfalls: ["Rewriting the file to make an error go away. It brings new ones."],
    checks: ["compile", "quality"],
  },
]

/** A skill every MCP request gets when nothing more specific matched. */
const FALLBACK = ["build-section"]

/**
 * The skills a request is about, best first.
 *
 * Scored by how many of a skill's triggers the request hits, so "make the
 * FAQ buttons darker on phones" ranks restyle and layout above everything
 * that merely mentions a list. Ties keep declaration order, which puts the
 * broad authoring skills before the narrow ones.
 *
 * `fallback: false` is the builder: a request that matches nothing (a
 * headline, a greeting) gets no skill rather than the authoring one, which
 * is several hundred tokens about writing files it is not going to write.
 */
export function selectSkills(request: string, opts: { limit?: number; fallback?: boolean; images?: boolean } = {}): Skill[] {
  const limit = opts.limit ?? 3
  const text = request.slice(0, 4_000)
  const scored = SKILLS.map((skill, order) => ({
    skill,
    order,
    /* A picture attached IS the image task, whatever the words say (or if there are none). */
    score: skill.triggers.reduce((n, t) => n + (t.test(text) ? 1 : 0), 0) + (opts.images && skill.id === "image-to-section" ? 10 : 0),
  }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map((s) => s.skill)
  if (scored.length || opts.fallback === false) return scored
  return SKILLS.filter((s) => FALLBACK.includes(s.id))
}

export function skillById(id: string): Skill | undefined {
  return SKILLS.find((s) => s.id === id)
}

/** The checks the chosen skills ask for, each once. */
export function checksFor(skills: Skill[]): CheckId[] {
  return [...new Set(skills.flatMap((s) => s.checks))]
}

/** The docs sections the chosen skills point at, each once, as the docs say them. */
export function docsFor(skills: Skill[]): string {
  const seen = new Set<string>()
  const parts: string[] = []
  for (const s of skills) {
    for (const d of s.docs ?? []) {
      const key = `${d.page}#${d.heading}`
      if (seen.has(key)) continue
      seen.add(key)
      const text = docSection(d.page, d.heading)
      if (text) parts.push(text)
    }
  }
  return parts.join("\n\n")
}

/** One skill as the agent reads it, with its framework topics composed in. */
export function skillText(skill: Skill, opts: { withTopics?: boolean } = {}): string {
  const parts = [
    `## ${skill.title} (${skill.id})`,
    skill.summary,
    `Steps:\n${skill.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
    `Tools: ${skill.tools.join(", ")}`,
    `Watch for:\n${skill.pitfalls.map((p) => `- ${p}`).join("\n")}`,
    skill.checks.length ? `Done when storelib_run_tests passes: ${skill.checks.join(", ")}` : "",
  ].filter(Boolean)
  if (skill.examples?.length) parts.push(`Examples: ${skill.examples.join(", ")}`)
  if (opts.withTopics !== false && skill.topics.length) parts.push(topicsById(skill.topics))
  if (opts.withTopics !== false && skill.docs?.length) parts.push(docsFor([skill]))
  return parts.join("\n\n")
}

/** The list, one line each, for an agent choosing for itself. */
export function skillIndex(): string {
  return SKILLS.map((s) => `${s.id}: ${s.summary}`).join("\n")
}

/** What an MCP agent is handed for a request: the chosen skills, whole. */
export function skillsForRequest(request: string, opts: { limit?: number } = {}): string {
  const chosen = selectSkills(request, opts)
  const topics = [...new Set(chosen.flatMap((s) => s.topics))]
  const checks = checksFor(chosen)
  const docs = docsFor(chosen)
  return [
    `Skills for this task: ${chosen.map((s) => s.id).join(", ")}.${checks.length ? ` Run storelib_run_tests with checks ${checks.join(", ")} before saying it is done.` : ""}`,
    ...chosen.map((s) => skillText(s, { withTopics: false })),
    topics.length ? `STORELIB REFERENCE for this task:\n\n${topicsById(topics)}` : "",
    docs ? `FROM THE DOCS (storelib.com/developers):\n\n${docs}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

/**
 * What Storelib AI's turn carries: the chosen skills' pitfalls and builder
 * notes in a few lines each, the framework topics once, and the docs
 * sections they point at. Per request, beside the request, so the cached
 * system prompt is untouched. Empty when the request matches no skill.
 */
export function skillContext(request: string, opts: { limit?: number; images?: boolean } = {}): string {
  const chosen = selectSkills(request, { ...opts, fallback: false })
  if (chosen.length === 0) return ""
  /**
   * The format reference only for the tasks where the builder's assistant
   * writes or restyles against it. Adding a built-in section, writing copy or
   * choosing a product is settings and blocks, and a page of template facts
   * beside it is paid for on every turn of the run and used on none.
   */
  const topics = [...new Set(chosen.filter((s) => BUILDER_REFERENCE.has(s.id)).flatMap((s) => s.topics))].slice(0, 4)
  const lines = chosen.map((s) => `${s.title}: ${[...(s.builder ?? []), ...s.pitfalls].join(" ")}`)
  return [
    `TASK NOTES:\n${lines.join("\n")}`,
    topics.length ? `STORELIB REFERENCE, for what you are about to do:\n\n${topicsById(topics)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

/** The skills whose framework topics the builder's assistant works against: code, colour, type, layout. */
const BUILDER_REFERENCE = new Set(["edit-section", "schema-design", "interaction", "debug", "performance", "accessibility", "layout", "restyle", "typography", "theme-blocks", "section-colours", "navigation"])

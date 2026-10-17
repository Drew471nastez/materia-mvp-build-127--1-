/**
 * ===========================================================================
 *  WHAT TO ASK NEXT, FROM WHERE THE CREATOR IS
 * ===========================================================================
 * "The suggestions are really bad. They should update based on what the user
 * is doing there." Four fixed sentences ("Add an FAQ with five questions
 * about what I sell") read like a demo of the assistant, not help with this
 * page. These are chosen from what is on screen, in this order:
 *
 *   A SECTION IS SELECTED   things to do to THAT section, its weakest
 *                           points first: no heading, a long heading, no
 *                           button, a hero with no picture, three questions
 *                           where a FAQ wants more, a product grid whose
 *                           products have no photos
 *   THE PAGE IS EMPTY       a first section, named for the store
 *   SOMETHING IS MISSING    a section left empty, products on no product
 *                           section, no newsletter, no way to get in touch,
 *                           no FAQ page on the site
 *   OTHERWISE               the page's own kind (About, Contact, Shop)
 *
 * Two to four, each short enough to be one chip on a 360px phone, computed
 * from what the editor already holds: never a model call. Pure:
 * tests/ask-dock.test.ts and tests/ask-unified-v.test.ts hold it to that.
 */

export interface SuggestionSection {
  id: string
  type: string
  name?: string
  hidden?: boolean
  settings?: Record<string, unknown>
  blocks?: { type?: string }[]
}

export interface SuggestionContext {
  /** The page key: home, about, contact, products, product, search, or a custom page's. */
  page: string
  sections: SuggestionSection[]
  selectedId?: string
  /** The site's name as the creator wrote it (the theme's brand_name). */
  storeName?: string
  /** How many products the store has, when known. */
  productCount?: number | null
  /** How many of them have no photo, when known. */
  productsWithoutImages?: number | null
  /** The site's other pages, by key or name, when known: "Add an FAQ page" only when there is none. */
  pages?: string[]
}

/** Chips on a phone: longer than this and a chip starts to crowd the row. */
export const MAX_SUGGESTION_CHARS = 34
export const MAX_SUGGESTIONS = 4
export const MIN_SUGGESTIONS = 2

const text = (value: unknown): string => (typeof value === "string" ? value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : "")

const is = (type: string, ...families: RegExp[]) => families.some((f) => f.test(type))
const HERO = /^hero(?!_product)/
const PRODUCTS = /^(product_grid|product_list|products_carousel|product_featured|product_spotlight|hero_product|collection_list)$/
const FAQ = /^faq/
const PROOF = /testimonial|^proof_(testimonials|featured)$|social_proof/
const NEWSLETTER = /newsletter/
const CONTACT = /contact|map_embed/
const TEXT = /^(text_|rich_text|split_content|tabs_content)/
const CTA = /^cta|promotion_banner|image_banner/
const MEDIA = /^(media_|gallery|image_|lookbook|slideshow|video_embed)/
const ABOUT = /^(about_|author_bio|team_members|timeline)/
const FEATURES = /^(features_|feature_grid|icon_box|process_steps|trust_badges)/
const PRICING = /pricing|comparison_table/

/** A section with nothing in it yet: no words in its settings and no blocks. Not one that fills itself (products, a form, pictures). */
function isEmpty(section: SuggestionSection): boolean {
  if (section.type === "header" || section.type === "footer" || is(section.type, PRODUCTS, NEWSLETTER, CONTACT, MEDIA)) return false
  if ((section.blocks ?? []).length > 0) return false
  return !Object.values(section.settings ?? {}).some((v) => typeof v === "string" && text(v).split(" ").length >= 2)
}

/** What the sidebar calls a section, for a chip: "FAQ", "Testimonials", or its kind in words. */
function sectionWord(section: SuggestionSection): string {
  return text(section.name) || section.type.replace(/[_-]+/g, " ").toLowerCase()
}

/** Things to do to the one section that is selected, its weakest points first. */
function forSection(section: SuggestionSection, productCount: number | null, noPhotos: number | null): string[] {
  const s = section.settings ?? {}
  const heading = text(s.heading ?? s.title)
  const button = text(s.button_text ?? s.button_label)
  const body = text(s.body ?? s.text ?? s.subheading)
  const image = text(s.image ?? s.background_image ?? s.image_url)
  const type = section.type
  const out: string[] = []
  const longHeading = heading.split(" ").length > 6
  const blocks = (section.blocks ?? []).length

  if (isEmpty(section)) out.push(`Fill in this ${sectionWord(section)}`)
  if (!heading && "heading" in s) out.push("Add a heading")

  if (type === "header") return ["Add a Shop link to the menu", "Make the logo bigger", "Make the header stick on scroll"]
  if (type === "footer") return ["Add my email to the footer", "Add links to my socials", "Make the footer quieter"]

  if (is(type, HERO)) {
    if (longHeading) out.push("Make this heading shorter")
    if (!image) out.push("Put a photo behind it")
    out.push(button ? "Add a second button" : "Add a button under the heading")
    if (image) out.push("Make the heading bigger")
  } else if (is(type, PRODUCTS)) {
    if (noPhotos && noPhotos > 0) out.push("Style cards that have no photo")
    if (productCount && productCount > 0) out.push(`Show my ${Math.min(3, productCount)} newest products`)
    out.push("Make the prices stand out", "Show four in a row")
  } else if (is(type, FAQ)) {
    out.push(blocks > 0 && blocks < 4 ? "Add three more questions" : "Answer shipping and refunds", "Make the answers shorter", blocks > 0 && blocks < 4 ? "Answer shipping and refunds" : "Add three more questions")
  } else if (is(type, PROOF)) {
    out.push("Add two more quotes", "Make the quotes shorter", "Put this under the hero")
  } else if (is(type, NEWSLETTER)) {
    out.push("Rewrite the signup line", "Say what people get", button ? "Make the button stand out" : "Add a Join button")
  } else if (is(type, PRICING)) {
    out.push("Highlight the middle plan", "Add a row per feature", "Make the prices bigger")
  } else if (is(type, CTA)) {
    if (longHeading) out.push("Make this heading shorter")
    out.push("Make the button stand out", "Try a darker background")
  } else if (is(type, MEDIA)) {
    out.push("Round the corners", "Add a caption under each", "Make it full width")
  } else if (is(type, ABOUT)) {
    out.push("Tell my story in fewer words", "Add a photo of me", "Add a line about why I started")
  } else if (is(type, FEATURES)) {
    out.push("Add a fourth feature", "Make each one shorter", "Use icons for each")
  } else if (is(type, TEXT)) {
    if (longHeading) out.push("Make this heading shorter")
    if (body.split(" ").length > 40) out.push("Make this text shorter")
    if (!button) out.push("Add a button under this text")
    out.push("Give it more room")
  } else {
    if (longHeading) out.push("Make this heading shorter")
    out.push("Give it more room", "Try a darker background")
  }
  if (section.hidden) out.unshift("Show this section again")
  return out
}

/** The first thing on an empty page, named for the store when there is a name. */
function firstSection(page: string, storeName: string, productCount: number | null): string[] {
  const name = storeName && `Start with a hero for ${storeName}`.length <= MAX_SUGGESTION_CHARS ? storeName : ""
  if (page === "about") return ["Tell my story in a short section", "Add a photo and a few lines", "Add a timeline of how I started"]
  if (page === "contact") return ["Add a contact form", "Add my email and hours", "Answer common questions"]
  if (page === "products") return productCount ? ["Show all my products in a grid", "Add a short line above them", "Add a newsletter signup"] : ["Add a product grid", "Add a short line above it", "Add a newsletter signup"]
  const out = [name ? `Start with a hero for ${name}` : "Start with a hero section"]
  if (productCount && productCount > 0) out.push(`Show my ${Math.min(3, productCount)} newest products`)
  out.push("Add a line about what I make", "Add a newsletter signup")
  return out
}

/** What a page with sections on it is still missing. */
function missing(ctx: SuggestionContext, body: SuggestionSection[]): string[] {
  const types = ctx.sections.map((s) => s.type)
  const has = (family: RegExp) => types.some((t) => family.test(t))
  const out: string[] = []
  const footer = ctx.sections.find((s) => s.type === "footer")
  const footerText = footer ? JSON.stringify(footer.settings ?? {}) + JSON.stringify(footer.blocks ?? []) : ""
  const reachable = has(CONTACT) || /@|mailto:|tel:/.test(footerText)

  if (ctx.page === "home" || ctx.page === "index") {
    if (ctx.productCount && ctx.productCount > 0 && !has(PRODUCTS)) out.push(`Show my ${Math.min(3, ctx.productCount)} newest products`)
    if (!has(PROOF)) out.push("Add what buyers say")
    if (!has(NEWSLETTER)) out.push("Add a newsletter signup")
    if (!reachable) out.push("Add a way to contact me")
  } else if (ctx.page === "about") {
    if (!has(ABOUT)) out.push("Tell my story in a short section")
    out.push("Add a photo of me")
  } else if (ctx.page === "contact") {
    if (!has(CONTACT)) out.push("Add a contact form")
    if (!has(FAQ)) out.push("Answer common questions")
  } else if (ctx.page === "products") {
    if (!has(PRODUCTS)) out.push("Show my products in a grid")
  } else {
    if (!reachable) out.push("Add a way to contact me")
  }
  /* A section left empty is the weakest thing on the page: right after the store's own products. */
  const empty = body.find((s) => !s.hidden && isEmpty(s))
  if (empty) out.splice(out[0]?.startsWith("Show my") ? 1 : 0, 0, `Fill in the empty ${sectionWord(empty)}`)
  if (!has(NEWSLETTER) && !out.includes("Add a newsletter signup")) out.push("Add a newsletter signup")
  /* A site with no FAQ page: one, from the home page, when the pages are known. */
  if ((ctx.page === "home" || ctx.page === "index") && Array.isArray(ctx.pages) && !ctx.pages.some((p) => /faq|question/i.test(p)) && !has(FAQ)) out.push("Add an FAQ page")
  if (body.length > 0) out.push("Make the whole page calmer", "Try a warmer colour palette")
  return out
}

/** A new kind of section the page does not have yet: what fills a short list. */
function newKinds(ctx: SuggestionContext): string[] {
  const types = ctx.sections.map((s) => s.type)
  const ideas: [string, RegExp][] = [
    ["A comparison table of my plans", /comparison|pricing/],
    ["A before and after slider", /image_comparison/],
    ["Press logos in one row", /press|logos?/],
    ["A map of where to find me", /map/],
  ]
  return ideas.filter(([, taken]) => !types.some((t) => taken.test(t))).map(([idea]) => idea)
}

export function suggestionsFor(ctx: SuggestionContext): string[] {
  const productCount = typeof ctx.productCount === "number" ? ctx.productCount : null
  const noPhotos = typeof ctx.productsWithoutImages === "number" ? ctx.productsWithoutImages : null
  const body = ctx.sections.filter((s) => s.type !== "header" && s.type !== "footer")
  const selected = ctx.selectedId ? ctx.sections.find((s) => s.id === ctx.selectedId) : undefined

  let picked: string[]
  if (selected) picked = forSection(selected, productCount, noPhotos)
  else if (body.length === 0) picked = firstSection(ctx.page, text(ctx.storeName), productCount)
  else picked = [...missing(ctx, body), ...newKinds(ctx)]

  const seen = new Set<string>()
  return picked.filter((s) => s.length <= MAX_SUGGESTION_CHARS && !seen.has(s) && seen.add(s)).slice(0, MAX_SUGGESTIONS)
}

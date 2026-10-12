/**
 * ===========================================================================
 *  EVERY PRODUCT PAGE SHOWS THE PRODUCT
 * ===========================================================================
 * The product template is drawn once per product, and the one section that
 * knows which product it is drawing is `product`: the pictures, the price,
 * the Buy button. Everything else on the template is the same for every
 * product.
 *
 * Every theme used to ship its product template WITHOUT that section. What
 * it had instead was a Split Content section reading "Product name" and
 * "Describe your product here", with a Buy button linking to `#`. The
 * builder added the real section the first time a creator opened the
 * product page and saved it; a creator who never did had every product on
 * their live site drawn as "Product name". The new-theme presets now start
 * with the real section, and this puts it on templates saved before that,
 * as the page is drawn, the same way the builder does.
 *
 * THE PLACEHOLDER IS REPLACED ONLY WHILE IT IS STILL THE PLACEHOLDER: the
 * section the preset made (id `product-hero`), still a Split Content, still
 * saying "Product name". A creator who rewrote it made it theirs, and it is
 * kept; the product section then goes under the header instead.
 *
 * Pure: the route passes the page and gets the page back, the same array
 * when it already had a product section.
 */
import type { BlockInstance, SectionInstance } from "./types"
import productSchema from "../../themes/default/sections/product.json"

/** The ids and the words the shipped presets gave their placeholder. */
const PLACEHOLDER_ID = "product-hero"
const PLACEHOLDER_HEADINGS = new Set(["product name", "product title"])

type BlockDef = { type: string; fields: { id: string; type: string; default?: unknown }[] }
const BLOCK_DEFS = (productSchema as unknown as { blocks: BlockDef[] }).blocks
const PRESET = (productSchema as unknown as { presets: { settings: Record<string, unknown>; blocks: BlockInstance[] }[] }).presets[0]

/** A product block's settings as its schema defaults them. */
export function productBlockDefaults(type: string): Record<string, unknown> {
  const def = BLOCK_DEFS.find((b) => b.type === type)
  const out: Record<string, unknown> = {}
  for (const f of def?.fields ?? []) if (f.type !== "header" && f.default !== undefined) out[f.id] = f.default
  return out
}

/** The main product section, as the builder's own "Default product" preset makes it: settings and blocks. */
export function mainProductSection(id = "main-product"): SectionInstance {
  return {
    id,
    type: "product",
    name: "Product",
    hidden: false,
    settings: { ...PRESET.settings },
    blocks: PRESET.blocks.map((b) => ({ id: b.id, type: b.type, settings: { ...b.settings } })),
  }
}

/**
 * ===========================================================================
 *  A PRODUCT SECTION SAVED BEFORE IT HAD BLOCKS
 * ===========================================================================
 * The product section used to be one fixed layout with switches: show the
 * wishlist link, show the share link, show the file list. It is blocks now,
 * the way Shopify's main product section is, and a section saved before
 * that has no blocks and those switches instead.
 *
 * Such a section is drawn with the blocks its switches describe, in the
 * order the old layout drew them, so a live page looks as it did until its
 * creator changes it. The builder puts the same blocks in the sidebar when
 * the page opens (and the next save keeps them), so what the creator edits
 * is what the visitor sees. Nothing stored is removed: the switches stay in
 * the settings, unread.
 *
 * A section is legacy when it has no blocks AND still carries one of the old
 * switches. A section made since has no switches, so a creator who deletes
 * every block gets the pictures alone, as they asked, not this list back.
 */
const LEGACY_KEYS = ["show_wishlist", "show_share_button", "show_whats_included", "show_social_icons", "show_reviews_summary"]

export function isLegacyProductSection(section: Pick<SectionInstance, "type" | "settings" | "blocks">): boolean {
  if (section.type !== "product") return false
  if (Array.isArray(section.blocks) && section.blocks.length > 0) return false
  const s = section.settings ?? {}
  return LEGACY_KEYS.some((k) => k in s)
}

/** The blocks an old section's switches describe. Ids are fixed, so the canvas and the sidebar agree on them. */
export function legacyProductBlocks(settings: Record<string, unknown>): BlockInstance[] {
  const on = (key: string) => settings[key] !== false
  const b = (type: string, extra: Record<string, unknown> = {}): BlockInstance => ({
    id: `legacy-${type}`,
    type,
    settings: { ...productBlockDefaults(type), ...extra },
  })
  return [
    /* The old page showed only a sale badge, above the title. */
    b("badges", { show_new: false, show_sold_out: true }),
    b("title"),
    b("price"),
    b("variant_picker"),
    b("pay_what_you_want"),
    b("quantity"),
    b("buy_buttons"),
    b("low_stock"),
    ...(on("show_wishlist") ? [b("wishlist")] : []),
    ...(on("show_share_button") ? [b("share")] : []),
    b("description"),
    /* The product's own questions, under its description: draws nothing on a product without any. */
    b("product_faq"),
    ...(on("show_whats_included") ? [b("files")] : []),
  ]
}

/**
 * ===========================================================================
 *  THE PRODUCT'S QUESTIONS ON A PRODUCT SECTION SAVED BEFORE THEY HAD A BLOCK
 * ===========================================================================
 * The product editor's FAQ card fills `products.faqs`, and a product section
 * shows them with its Product questions block. A section made from the
 * preset since that block exists has it (and Product details beside it). A
 * section saved before has neither, so a creator who wrote questions in the
 * editor saw them nowhere on their website.
 *
 * Such a section gets the block once, under the description (else at the
 * end), and `product_faq_seeded` on its settings says it was given. The
 * builder does the same when the page opens, so the creator sees it in the
 * sidebar and the next save keeps both; a creator who then deletes the block
 * keeps it deleted, because the mark stays. A section with Product details
 * or Product questions already was made knowing about them, and is left as
 * it is. With no questions the block draws nothing on a live page.
 */
export const FAQ_SEEDED = "product_faq_seeded"

export function withProductFaq(section: SectionInstance): SectionInstance {
  if (section.type !== "product") return section
  const blocks = section.blocks ?? []
  if (blocks.length === 0) return section
  if ((section.settings ?? {})[FAQ_SEEDED] === true) return section
  if (blocks.some((b) => b.type === "product_faq" || b.type === "product_details")) return section
  const after = blocks.findIndex((b) => b.type === "description")
  const faq: BlockInstance = { id: "auto-product_faq", type: "product_faq", settings: productBlockDefaults("product_faq") }
  const next = [...blocks]
  next.splice(after >= 0 ? after + 1 : next.length, 0, faq)
  return { ...section, settings: { ...(section.settings ?? {}), [FAQ_SEEDED]: true }, blocks: next }
}

/** The section with the blocks it draws: its own, or its old switches' when it has none, with the product's questions. */
export function withProductBlocks(section: SectionInstance): SectionInstance {
  const blocked = isLegacyProductSection(section) ? { ...section, blocks: legacyProductBlocks(section.settings ?? {}) } : section
  return withProductFaq(blocked)
}

/**
 * ===========================================================================
 *  DELIVERY AND PICKUP ON EVERY PRODUCT PAGE THAT HAD NONE
 * ===========================================================================
 * The "Delivery and pickup" block (the cheapest delivery and how long, the
 * pickup points; components/website-builder/sections/renderers/product/
 * product-blocks.tsx) came after many product pages were saved, so those
 * pages never showed it. A product section with blocks and no such block
 * draws it after the low stock line (or after the buy buttons, or last),
 * the way the default preset places it, without the creator adding it.
 *
 * The creator still decides. The section remembers it was given the block
 * (DELIVERY_ADDED, a setting kept with the section, as the legacy switches
 * are): the builder opens with it in the sidebar, where it can be moved or
 * removed like any block, and a section saved with the mark and without the
 * block was emptied of it on purpose, so it is never put back. A section
 * that has the block gets the mark too, so removing it later sticks.
 *
 * The canvas, the sidebar and the live page call this one function
 * (ProductSection, theme/render-product, the editor's load), so all three
 * agree on the blocks and their ids.
 */
export const DELIVERY_ADDED = "delivery_block_added"
export const AUTO_DELIVERY_ID = "auto-delivery"

export function withDeliveryBlock(section: SectionInstance): SectionInstance {
  if (section.type !== "product" || !Array.isArray(section.blocks) || section.blocks.length === 0) return section
  const settings = section.settings ?? {}
  if (section.blocks.some((b) => b.type === "delivery")) return settings[DELIVERY_ADDED] === true ? section : { ...section, settings: { ...settings, [DELIVERY_ADDED]: true } }
  /* Given once and taken out by the creator: left out. */
  if (settings[DELIVERY_ADDED] === true) return section
  const after = ["low_stock", "buy_buttons", "quantity", "variant_picker", "price"]
  let at = section.blocks.length
  for (const type of after) {
    const i = section.blocks.map((b) => b.type).lastIndexOf(type)
    if (i >= 0) {
      at = i + 1
      break
    }
  }
  const block: BlockInstance = { id: AUTO_DELIVERY_ID, type: "delivery", settings: productBlockDefaults("delivery") }
  const blocks = [...section.blocks.slice(0, at), block, ...section.blocks.slice(at)]
  return { ...section, blocks, settings: { ...settings, [DELIVERY_ADDED]: true } }
}

export function isUntouchedPlaceholder(section: SectionInstance): boolean {
  if (section.id !== PLACEHOLDER_ID || section.type !== "split_content") return false
  const heading = typeof section.settings?.heading === "string" ? section.settings.heading.trim().toLowerCase() : ""
  return PLACEHOLDER_HEADINGS.has(heading)
}

/** The page with a product section on it, where the placeholder was or under the header. */
export function withMainProduct(sections: SectionInstance[], ownProductSection?: (type: string) => boolean): SectionInstance[] {
  if (sections.some((s) => s.type === "product" && !s.hidden)) return sections
  /* A hidden product section was hidden on purpose. */
  if (sections.some((s) => s.type === "product")) return sections
  /* A product page of the creator's own design draws the product itself: adding the built-in one under it drew it twice. */
  if (ownProductSection && sections.some((s) => !s.hidden && s.type !== "header" && s.type !== "footer" && ownProductSection(s.type))) return sections
  const at = sections.findIndex(isUntouchedPlaceholder)
  if (at >= 0) return sections.map((s, i) => (i === at ? mainProductSection() : s))
  const header = sections.findIndex((s) => s.type === "header")
  const out = [...sections]
  out.splice(header + 1, 0, mainProductSection())
  return out
}

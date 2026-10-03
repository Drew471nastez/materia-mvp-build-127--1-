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
    ...(on("show_whats_included") ? [b("files")] : []),
  ]
}

/** The section with the blocks it draws: its own, or its old switches' when it has none. */
export function withProductBlocks(section: SectionInstance): SectionInstance {
  return isLegacyProductSection(section) ? { ...section, blocks: legacyProductBlocks(section.settings ?? {}) } : section
}

export function isUntouchedPlaceholder(section: SectionInstance): boolean {
  if (section.id !== PLACEHOLDER_ID || section.type !== "split_content") return false
  const heading = typeof section.settings?.heading === "string" ? section.settings.heading.trim().toLowerCase() : ""
  return PLACEHOLDER_HEADINGS.has(heading)
}

/** The page with a product section on it, where the placeholder was or under the header. */
export function withMainProduct(sections: SectionInstance[]): SectionInstance[] {
  if (sections.some((s) => s.type === "product" && !s.hidden)) return sections
  /* A hidden product section was hidden on purpose. */
  if (sections.some((s) => s.type === "product")) return sections
  const at = sections.findIndex(isUntouchedPlaceholder)
  if (at >= 0) return sections.map((s, i) => (i === at ? mainProductSection() : s))
  const header = sections.findIndex((s) => s.type === "header")
  const out = [...sections]
  out.splice(header + 1, 0, mainProductSection())
  return out
}

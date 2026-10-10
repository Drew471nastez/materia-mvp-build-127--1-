/**
 * ===========================================================================
 *  A PRODUCT'S BLOCKS LIVE IN ITS DETAILS COLUMN
 * ===========================================================================
 * A theme's product section (Horizon's "Product information", Dawn style
 * "main-product" rewrites, a featured product) is a media block and a
 * Details block, both static, side by side. Blocks the section holds itself
 * are drawn after both, full width under the picture and the details. That
 * is where a block added "at the end of the list" used to land: a buy button
 * or a text under the product instead of beside it (the owner: "it puts the
 * blocks under the section instead of in the information side").
 *
 * So it is a rule of the builder, not of each theme: in a product section
 * with a Details block, a block the section holds that the Details block can
 * take is moved into it, at its end, in the order it was in. The editor
 * applies it to what it loads and to every change (so the sidebar, the
 * canvas and the saved page agree), and the website applies it as it draws
 * (so a page saved before the rule draws the same way, published or not).
 *
 * Pictures stay where they are (a media or gallery block is the other
 * column's), and so does a block the Details block can't hold.
 */

/** A product section's Details block: Horizon's _product-details, product-details, a "product-info". */
export const PRODUCT_DETAILS_BLOCK = /(^|[-_])(product[-_]?)?(details|info|information)$/i
const MEDIA_BLOCK = /media|gallery|image[-_]?slider/i

interface Block {
  id: string
  type: string
  static?: boolean
  blocks?: Block[]
}

/** Whether a section is one this rule is about: a product section, or one with a media block beside its Details. */
export function isProductSection(sectionType: string, blocks: readonly Block[] | undefined, statics: readonly { type: string }[] = []): boolean {
  if (/product/i.test(sectionType)) return true
  const all = [...(blocks ?? []).filter((b) => b.static), ...statics]
  return all.some((b) => MEDIA_BLOCK.test(b.type)) && all.some((b) => PRODUCT_DETAILS_BLOCK.test(b.type))
}

/**
 * The section's blocks with every one that belongs in its Details block
 * moved there, or null when nothing moves. `statics` is the section's static
 * blocks as its file places them, for a Details block nobody has edited yet
 * (it isn't in the data until something is put in it). `takes` says whether
 * the Details block, of that type, can hold a block of this type.
 */
export function blocksIntoDetails<T extends Block>(
  sectionType: string,
  blocks: readonly T[] | undefined,
  takes: (detailsType: string, type: string) => boolean,
  statics: readonly { type: string; id: string }[] = [],
): T[] | null {
  if (!blocks?.length || !isProductSection(sectionType, blocks, statics)) return null
  const stored = blocks.find((b) => b.static && PRODUCT_DETAILS_BLOCK.test(b.type))
  const placed = stored ? null : statics.find((s) => PRODUCT_DETAILS_BLOCK.test(s.type))
  const details = stored ?? (placed ? ({ id: placed.id, type: placed.type, static: true, settings: {}, blocks: [] } as unknown as T) : null)
  if (!details) return null
  const moving = blocks.filter((b) => !b.static && !MEDIA_BLOCK.test(b.type) && !PRODUCT_DETAILS_BLOCK.test(b.type) && takes(details.type, b.type))
  if (moving.length === 0) return null
  const into = { ...details, blocks: [...(details.blocks ?? []), ...moving] } as T
  const rest = blocks.filter((b) => !moving.includes(b))
  return stored ? rest.map((b) => (b === stored ? into : b)) : [...rest, into]
}

/** The static blocks a section's file places (`{% content_for 'block', type: 'x', id: 'y' %}`), in order. */
export function contentForStatics(markup: string): { type: string; id: string }[] {
  const out: { type: string; id: string }[] = []
  for (const m of markup.matchAll(/\{%-?\s*content_for\s+['"]block['"]\s*,([^%]*)-?%\}/g)) {
    const type = m[1].match(/\btype\s*:\s*['"]([^'"]+)['"]/)?.[1]
    const id = m[1].match(/\bid\s*:\s*['"]([^'"]+)['"]/)?.[1]
    if (type && id && !out.some((o) => o.id === id)) out.push({ type, id })
  }
  return out
}

/** Whether a block may be taken out of a product section's Details block to the section's own level: never, while Details can hold it. */
export function staysInDetails(sectionType: string, blocks: readonly Block[] | undefined, fromParentType: string | undefined, statics: readonly { type: string }[] = []): boolean {
  return !!fromParentType && PRODUCT_DETAILS_BLOCK.test(fromParentType) && isProductSection(sectionType, blocks, statics)
}

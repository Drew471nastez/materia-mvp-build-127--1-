/**
 * ===========================================================================
 *  A PRODUCT'S OWN DESCRIPTION, WHEREVER A SECTION SHOWS THAT PRODUCT (round 12)
 * ===========================================================================
 * The owner: "Description blocks of the featured product, main product
 * information or any section should pull the Storelib description of that
 * product automatically ... displayed dynamically all the time."
 *
 * The product page's own section was handed its product's description; a
 * section that FEATURES a product (Product hero, Product spotlight, an
 * imported theme's Featured product) was handed the product's card, which
 * carries no description, so it showed a sentence typed into the section,
 * or nothing. Here a card gets `description_html`: the product's description
 * from Products, as safe markup (cleaned against the rich text allow list,
 * or plain text made paragraphs: the same rule the product page uses), read
 * fresh with the shop (cached under the shop's tag, which a product's save
 * clears), so an edit in Products is what every section shows next.
 *
 * Only the cards that need it: every card the builder offers (the editor,
 * and an imported theme's page, drawn on the server), and on a Storelib
 * page only the products a section picked, so a page's payload does not
 * carry every product's description for a grid that never shows one.
 */
import { cleanStoredHtml, looksLikeHtml, plainTextToHtml } from "@/lib/rich-text/html"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** A description as markup a section may draw: cleaned rich text, or plain text as paragraphs. */
export function descriptionMarkup(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return ""
  return looksLikeHtml(raw) ? cleanStoredHtml(raw) : plainTextToHtml(raw)
}

interface CardLike {
  id: string
  settings: Record<string, unknown>
}

/**
 * The descriptions of these products (by id, or by the slug a picker holds),
 * published and the creator's own, as markup, keyed by id and by slug.
 * Never throws: a read that fails leaves the cards as they were.
 */
export async function productDescriptions(db: Db, creatorId: string, refs: { ids?: string[]; slugs?: string[] }): Promise<Record<string, string>> {
  /* A plain object, not a Map: it is held in the shop's cache, which keeps what JSON can say. */
  const out: Record<string, string> = {}
  const ids = [...new Set((refs.ids ?? []).filter((x) => /^[0-9a-f-]{8,64}$/i.test(x)))].slice(0, 200)
  const slugs = [...new Set((refs.slugs ?? []).filter((x) => typeof x === "string" && x))].slice(0, 200)
  if (!creatorId || (ids.length === 0 && slugs.length === 0)) return out
  const take = (rows: unknown) => {
    for (const r of (Array.isArray(rows) ? rows : []) as { id: string; slug?: string | null; description?: unknown }[]) {
      const html = descriptionMarkup(r.description)
      out[String(r.id).toLowerCase()] = html
      if (r.slug) out[`slug:${r.slug}`] = html
    }
  }
  try {
    const reads: Promise<unknown>[] = []
    for (let i = 0; i < ids.length; i += 80) {
      reads.push(Promise.resolve(db.from("products").select("id, slug, description").eq("creator_id", creatorId).eq("status", "published").in("id", ids.slice(i, i + 80))).then((r: { data?: unknown }) => take(r?.data)))
    }
    for (let i = 0; i < slugs.length; i += 80) {
      reads.push(Promise.resolve(db.from("products").select("id, slug, description").eq("creator_id", creatorId).eq("status", "published").in("slug", slugs.slice(i, i + 80))).then((r: { data?: unknown }) => take(r?.data)))
    }
    await Promise.all(reads)
  } catch {
    /* The cards keep what they had. */
  }
  return out
}

/** The cards, each named in `byKey` carrying its description; the rest as they were. */
export function withDescriptions<C extends CardLike>(cards: C[], byKey: Record<string, string>): C[] {
  if (Object.keys(byKey).length === 0) return cards
  const has = (k: string) => Object.prototype.hasOwnProperty.call(byKey, k)
  return cards.map((c) => {
    const slug = typeof c.settings.slug === "string" ? c.settings.slug : ""
    const id = c.id.toLowerCase()
    const html = has(id) ? byKey[id] : slug && has(`slug:${slug}`) ? byKey[`slug:${slug}`] : undefined
    return html === undefined ? c : { ...c, settings: { ...c.settings, description_html: html } }
  })
}

/** Every one of these cards with its description (the builder's cards, an imported theme's catalogue). */
export async function cardsWithDescriptions<C extends CardLike>(db: Db, creatorId: string, cards: C[]): Promise<C[]> {
  if (cards.length === 0) return cards
  return withDescriptions(cards, await productDescriptions(db, creatorId, { ids: cards.map((c) => c.id) }))
}

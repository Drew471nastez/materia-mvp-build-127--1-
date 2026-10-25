/**
 * ===========================================================================
 *  A PRODUCT'S OWN QUESTIONS, ON EVERY CARD A SECTION FEATURES
 * ===========================================================================
 * Round 13, the owner: product FAQs should "fetch with the FAQs in the blocks
 * of the product pages, product info section, featured product, and all
 * places", and "use assigned Storelib size chart doesn't work".
 *
 * The product page's own product was read in full (its questions, its size
 * chart). A section that FEATURES a product (an imported theme's Featured
 * product, its quick view, a product picked in a block) was handed the
 * product's card, which carried neither, so `product.metafields.storelib`
 * was empty there and the theme's "Use assigned Storelib size chart" found
 * nothing. Here a card gets, beside its description (./product-descriptions.ts):
 *
 *   settings.faqs        the product editor's questions, in their order,
 *                        plain text (lib/products/product-faqs.ts)
 *
 * which lib/storelib-theme/compat/objects.ts turns into
 * `product.metafields.storelib.faqs`, the same for a card as for the product
 * page. The size chart reaches every card another way, one read for the
 * store (lib/size-charts/storefront.ts sizeChartsForStore, handed to the
 * page as `sizeCharts`): its own chart, else its collection's or category's. Read with the shop's catalogue, held under the
 * shop's tag, which a product's save, a chart's save and a collection's
 * save clear, so a change is what every section shows next.
 *
 * Never throws: a read that fails leaves the cards as they were.
 */
import { productFaqs, type ProductFaq } from "@/lib/products/product-faqs"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

interface CardLike {
  id: string
  settings: Record<string, unknown>
}

/** What a card gains, by product id. A plain object: it is held in the shop's cache, which keeps what JSON can say. */
export type ProductExtras = Record<string, { faqs?: ProductFaq[] }>

const isId = (x: string) => /^[0-9a-f-]{8,64}$/i.test(x)

/** The questions of these cards' products, the creator's own, published. */
export async function productExtras(db: Db, creatorId: string, cards: readonly CardLike[]): Promise<ProductExtras> {
  const out: ProductExtras = {}
  const ids = [...new Set(cards.map((c) => c.id).filter(isId))].slice(0, 500)
  if (!creatorId || !ids.length) return out
  const put = (id: string, patch: ProductExtras[string]) => (out[id.toLowerCase()] = { ...(out[id.toLowerCase()] ?? {}), ...patch })
  const readFaqs = async () => {
    for (let i = 0; i < ids.length; i += 80) {
      const { data, error } = await db.from("products").select("id, faqs").eq("creator_id", creatorId).eq("status", "published").in("id", ids.slice(i, i + 80))
      /* A database without the column: no questions anywhere, as before. */
      if (error) return
      for (const r of (data ?? []) as { id: string; faqs?: unknown }[]) {
        const faqs = productFaqs(r.faqs)
        if (faqs.length) put(String(r.id), { faqs })
      }
    }
  }
  try {
    await readFaqs()
  } catch {
    /* The cards keep what they had. */
  }
  return out
}

/** The cards, each with its questions; a card without any is returned as it was. */
export function withExtras<C extends CardLike>(cards: C[], byId: ProductExtras): C[] {
  if (Object.keys(byId).length === 0) return cards
  return cards.map((c) => {
    const x = byId[c.id.toLowerCase()]
    if (!x) return c
    return x.faqs ? { ...c, settings: { ...c.settings, faqs: x.faqs } } : c
  })
}

/** Every one of these cards with its questions (an imported theme's catalogue, the builder's cards). */
export async function cardsWithExtras<C extends CardLike>(db: Db, creatorId: string, cards: C[]): Promise<C[]> {
  if (cards.length === 0) return cards
  return withExtras(cards, await productExtras(db, creatorId, cards))
}

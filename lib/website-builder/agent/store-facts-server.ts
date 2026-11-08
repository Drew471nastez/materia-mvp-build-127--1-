import "server-only"

/**
 * ===========================================================================
 *  WHAT THE STORE ACTUALLY SELLS, READ ONCE FOR EVERY AI THAT WRITES A SITE
 * ===========================================================================
 * The facts the website agent's read_store gives the model (./operations.ts
 * StoreFacts): products with their ids, addresses, prices and options, the
 * collections, the selling currency and what buyers said. Moved here from the
 * agent route so Start with AI's capability manifest
 * (lib/website-builder/ai-site/capabilities.ts) reads exactly the same facts.
 *
 * Read through the client it is handed: the agent passes the creator's own
 * client, so row level security decides what the model sees, and every query
 * is also scoped to this creator. Never throws: a catalogue that will not load
 * answers null, and the caller writes copy that does not depend on it.
 */
import { storeCurrencyOf } from "@/lib/store/currency"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { getWebsiteShareUrl } from "@/lib/url-helpers"
import type { StoreFacts } from "./operations"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export async function readStoreFacts(supabase: Db, creatorId: string): Promise<StoreFacts | null> {
  try {
    /**
     * The product data API's fields (lib/website-builder/shop-products):
     * ids and page addresses for a product picker and a buy button,
     * sale prices, pay what you want, and the options below. Asked
     * again with the basic columns when an older database does not
     * have one of them, so the store is described either way.
     */
    const productQuery = (cols: string) =>
      supabase
        .from("products")
        .select(cols, { count: "exact" })
        .eq("creator_id", creatorId)
        .order("created_at", { ascending: false })
        .limit(30)
    const [{ data: profile }, first] = await Promise.all([
      supabase
        .from("creators")
        .select("slug, store_published")
        .eq("id", creatorId)
        .maybeSingle(),
      productQuery("id, title, type, slug, price_cents, compare_at_cents, pay_what_you_want, pwyw_min_price_cents, status"),
    ])
    const { data: rows, count } = first.error ? await productQuery("id, title, type, slug, price_cents, status") : first

    type Row = {
      id: string
      title: string
      type: string
      slug?: string | null
      price_cents: number
      compare_at_cents?: number | null
      pay_what_you_want?: boolean | null
      pwyw_min_price_cents?: number | null
      status: string
    }
    const list = (rows as unknown as Row[] | null) ?? []
    /* The options each product is bought as, read the same way; none if they will not load. */
    let options: { product_id: string; name: string | null; price_cents: number | null }[] = []
    if (list.length) {
      const { data: variantRows } = await supabase
        .from("product_variants")
        .select("product_id, name, price_cents, position")
        .in("product_id", list.map((p) => p.id))
        .order("position", { ascending: true })
      options = (variantRows as typeof options | null) ?? []
    }
    const products = list.map((p) => ({
      id: p.id,
      title: p.title,
      type: p.type,
      priceCents: p.pay_what_you_want ? p.pwyw_min_price_cents ?? 0 : p.price_cents,
      payWhatYouWant: p.pay_what_you_want === true,
      compareAtCents: p.compare_at_cents ?? null,
      url: p.slug ? `/products/${p.slug}` : undefined,
      published: p.status === "published",
      options: options
        .filter((o) => o.product_id === p.id)
        .map((o) => ({ name: o.name ?? "Option", priceCents: o.price_cents ?? 0 })),
    }))

    /* The creator's collections, for a collection picker; none when the table is not there. */
    const { data: collectionRows } = await supabase
      .from("product_collections")
      .select("id, title, slug, published")
      .eq("creator_id", creatorId)
      .order("created_at", { ascending: false })
      .limit(30)
    const collections = ((collectionRows as { id: string; title: string; slug: string; published: boolean }[] | null) ?? []).map((c) => ({ id: c.id, title: c.title, handle: c.slug, published: c.published === true }))

    /*
      THE CURRENCY AND WHAT BUYERS SAID (round Z3), each read on its own so a database without the column or the
      table still describes the store: prices were always said to be US dollars, and a testimonials section had no
      real people to quote. The currency is the store's selling currency (Settings, the one checkout charges in). The reviews are the ones the site shows, through the creator's own client.
    */
    const [currencyRow, reviewRows] = await Promise.all([
      readStoreCurrency(supabase, creatorId),
      supabase
        .from("reviews")
        .select("rating, content, reviewer_name, product_id")
        .eq("creator_id", creatorId)
        .eq("status", "published")
        .eq("site_status", "shown")
        .order("created_at", { ascending: false })
        .limit(40),
    ])
    const currency = storeCurrencyOf(currencyRow.currency)
    const shown = reviewRows.error ? [] : ((reviewRows.data ?? []) as { rating: number | null; content: string | null; reviewer_name: string | null; product_id: string | null }[])
    const rated = shown.filter((r) => typeof r.rating === "number")
    const titleOf = new Map(list.map((p) => [p.id, p.title]))
    const reviews = reviewRows.error
      ? undefined
      : {
          count: shown.length,
          average: rated.length ? rated.reduce((sum, r) => sum + (r.rating as number), 0) / rated.length : null,
          quotes: shown
            .filter((r) => (r.content ?? "").trim().length >= 12 && (r.rating ?? 0) >= 4)
            .slice(0, 6)
            .map((r) => ({ name: (r.reviewer_name ?? "").trim() || "A buyer", rating: r.rating ?? 5, text: (r.content ?? "").trim(), product: (r.product_id && titleOf.get(r.product_id)) || undefined })),
        }

    const slug = (profile as { slug?: string } | null)?.slug ?? null
    return {
      currency,
      reviews,
      collections,
      storeName: slug ?? "this store",
      live: (profile as { store_published?: boolean } | null)?.store_published === true,
      totalProducts: count ?? products.length,
      publishedProducts: products.filter((p) => p.published).length,
      products,
      address: slug ? getWebsiteShareUrl(slug) : null,
    }
  } catch {
    return null
  }
}

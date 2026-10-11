import "server-only"

/**
 * ===========================================================================
 *  THE LAST COPY GOES TO ONE BUYER, EVEN TWO AT ONCE
 * ===========================================================================
 * A download with "Limit sales" on (products.sales_limit, SQL part 133) sells
 * that many copies and no more. Counting orders before charging is not
 * enough: with one copy left, two buyers pressing Pay together both see one
 * left, both pay, and the limit is passed. So, as a discount code's last use
 * is (./coupon-holds.ts), a payment first takes a place under the limit in
 * one statement in the database (hold_product_sale): the product's row is
 * locked, the paid orders and the places still held are counted, and a place
 * is only given while there is room. The second buyer is told "Sold out"
 * before anything is charged.
 *
 *   taken     when a payment starts: the single product checkout
 *             (stripe-session), the free checkouts (process, quick-free),
 *             the basket (checkout/cart) and a website's own checkout
 *             (checkout/site);
 *   taken     AGAIN when a paid payment becomes its order (claimSale), so a
 *             place that lapsed in between is only taken back while there
 *             is room. A payment that arrives over the limit is refunded,
 *             never fulfilled (./sold-out-refund.ts);
 *   given up  when the order exists (the order counts the copy now), when
 *             the payment could not be started, when Stripe says the
 *             payment or its page is over, and otherwise after
 *             SALE_HOLD_SECONDS.
 *
 * WHO HOLDS IT. The buyer's address, hashed (holderForEmail), so a declined
 * card and a second try refresh the same place rather than taking two. A
 * basket that goes to Stripe's page before anyone typed an address holds
 * under the browser's own holder, as its code does.
 *
 * NEVER A NEW WAY TO FAIL A PAYMENT. A product with no limit is never asked
 * about. Until part 133 has run, and whenever the database cannot be asked,
 * the answer is yes: the only new refusal is the database saying there is
 * no copy left. Nothing the browser sends is counted.
 */
import { holderForEmail } from "./coupon-holds"
import { unpackItems } from "./cart-items"
import { readSalesLimit, type SalesStanding } from "@/lib/products/sales-limit"

type Db = { from: (table: string) => any; rpc?: (fn: string, args: Record<string, unknown>) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** How long a started payment keeps its copy: the same as a code's place, so a basket's Stripe page (31 minutes) expires first. */
export const SALE_HOLD_SECONDS = 35 * 60
/** How long a paid payment's copy is kept while its order is written: the order then counts it. */
export const CLAIM_HOLD_SECONDS = 10 * 60
/** The metadata key a payment carries its holder under. */
export const SALE_HOLDER_KEY = "sale_holder"

/** The holder for a buyer's address: the same address is the same holder, and the table never sees it. */
export const saleHolderForEmail = holderForEmail

/** A product's limit from a row read with `*`, or null: no limit, or a database before part 133. */
export function limitOf(row: unknown): number | null {
  if (!row || typeof row !== "object") return null
  return readSalesLimit((row as { sales_limit?: unknown }).sales_limit)
}

/**
 * Takes (or refreshes) this holder's place for `quantity` copies. False only
 * when the database answered that there is no copy left.
 */
export async function holdSale(db: Db, productId: string, holder: string, quantity = 1, seconds = SALE_HOLD_SECONDS): Promise<boolean> {
  if (!db.rpc || !productId || !holder) return true
  try {
    const { data, error } = await db.rpc("hold_product_sale", { p_product: productId, p_holder: holder, p_quantity: Math.max(1, Math.floor(quantity) || 1), p_seconds: seconds })
    if (error) return true
    return data !== false
  } catch {
    return true
  }
}

/** Gives the place back. Never throws. */
export async function releaseSale(db: Db, productId: string | null | undefined, holder: string | null | undefined): Promise<void> {
  if (!db.rpc || !productId || !holder) return
  try {
    await db.rpc("release_product_sale", { p_product: productId, p_holder: holder })
  } catch {
    /* it lapses on its own */
  }
}

/** Gives back every place a payment took, one per product. Never throws. */
export async function releaseSales(db: Db, productIds: Iterable<string>, holder: string | null | undefined): Promise<void> {
  if (!holder) return
  await Promise.all([...new Set(productIds)].map((id) => releaseSale(db, id, holder)))
}

/**
 * A basket's copies of its limited products, held together: one hold per
 * product for all its lines' copies. When one has no copy left, the ones
 * already held are given back and that product's title is answered.
 */
export async function holdBasket(
  db: Db,
  lines: { productId: string; quantity: number; title?: string | null }[],
  limited: string[],
  holder: string,
  seconds = SALE_HOLD_SECONDS,
): Promise<{ ok: true; held: string[] } | { ok: false; title: string }> {
  const want = new Map<string, { quantity: number; title: string }>()
  for (const l of lines) {
    if (!limited.includes(l.productId)) continue
    const had = want.get(l.productId)
    want.set(l.productId, { quantity: (had?.quantity ?? 0) + Math.max(1, Math.floor(l.quantity) || 1), title: String(l.title ?? "") })
  }
  const held: string[] = []
  for (const [productId, w] of want) {
    if (!(await holdSale(db, productId, holder, w.quantity, seconds))) {
      await releaseSales(db, held, holder)
      return { ok: false, title: w.title }
    }
    held.push(productId)
  }
  return { ok: true, held }
}

/** The product's limit, read on its own so a database without the column (before part 133) answers "none". */
export async function readLimit(db: Db, productId: string): Promise<number | null> {
  try {
    const { data, error } = await db.from("products").select("sales_limit").eq("id", productId).maybeSingle()
    if (error) return null
    return limitOf(data)
  } catch {
    return null
  }
}

/** Each limited product's limit, by id, in one read; the others are absent. */
export async function readLimits(db: Db, productIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const ids = [...new Set(productIds)].filter(Boolean)
  if (!ids.length) return out
  try {
    const { data, error } = await db.from("products").select("id, sales_limit").in("id", ids)
    if (error) return out
    for (const r of (data ?? []) as { id: string; sales_limit: unknown }[]) {
      const limit = readSalesLimit(r.sales_limit)
      if (limit !== null) out.set(r.id, limit)
    }
  } catch {
    /* no limits: sells as before part 133 */
  }
  return out
}

/**
 * When a paid payment becomes its order: may this order have its copy?
 * Takes the place again (a place still held is simply refreshed), and keeps
 * it while the order is written; `releaseSale` once the order exists. True
 * for a product with no limit, and whenever the database cannot be asked.
 */
export async function claimSale(db: Db, productId: string, holder: string, quantity = 1): Promise<boolean> {
  const limit = await readLimit(db, productId)
  if (limit === null) return true
  return holdSale(db, productId, holder, quantity, CLAIM_HOLD_SECONDS)
}

/**
 * Each limited product's standing: its limit, copies sold, copies held.
 * Products with no limit are absent, and so is everything on a database
 * before part 133 or one that cannot be asked: the page sells as before.
 */
export async function salesStandings(db: Db, productIds: string[]): Promise<Map<string, SalesStanding>> {
  const out = new Map<string, SalesStanding>()
  const ids = [...new Set(productIds)].filter((id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)).slice(0, 500)
  if (!ids.length || !db.rpc) return out
  try {
    const { data, error } = await db.rpc("product_sales_status", { p_products: ids })
    if (error) return out
    for (const r of (data ?? []) as { product_id: string; sales_limit: unknown; sold: unknown; held: unknown }[]) {
      const limit = readSalesLimit(r.sales_limit)
      if (limit === null) continue
      out.set(r.product_id, { limit, sold: Math.max(0, Number(r.sold) || 0), held: Math.max(0, Number(r.held) || 0) })
    }
  } catch {
    /* no standings: nothing is shown as limited */
  }
  return out
}

/** One product's standing, or null. */
export async function salesStanding(db: Db, productId: string): Promise<SalesStanding | null> {
  return (await salesStandings(db, [productId])).get(productId) ?? null
}

/**
 * A payment that will not happen (Stripe cancelled it, or its page expired
 * or failed): the copies it held go back now rather than when the hold
 * lapses. Read from what the payment carries: its holder, and its product
 * or its basket's lines. Never throws.
 */
export async function releaseHeldCopies(db: Db, metadata: Record<string, string> | null | undefined): Promise<void> {
  const holder = metadata?.[SALE_HOLDER_KEY]
  if (!metadata || !holder) return
  const ids = metadata.product_id ? [metadata.product_id] : unpackItems(metadata).map((i) => i.productId)
  await releaseSales(db, ids, holder)
}

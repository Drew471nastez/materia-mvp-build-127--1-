/**
 * WHERE AN ORDER CAME FROM
 *
 * Two places sell: Storelib itself (a profile, a product page, the
 * marketplace) and a website the creator built. The Orders table has a
 * Source column for the difference, so it has to be written down when the
 * order is made; nothing about a finished order says which door the buyer
 * walked through.
 *
 * A website's Buy button sends the buyer to `/checkout?productId=…&src=website`
 * and a basket is only ever filled on a website. Everything else is Storelib.
 *
 * THE COLUMN IS OPTIONAL. `orders.source` arrives with
 * supabase/sql/RUN_ORDER_SOURCE.sql, and the payment paths insert with a
 * full payload first and a minimal one if that fails. Putting `source` in
 * the insert would make every order fall back to the minimal payload until
 * the SQL is run. So it is written by a separate update after the order
 * exists, and that update is allowed to fail: an order without a source is
 * an order, one that failed to save is not.
 */

export type OrderSource = "storelib" | "website"

/** The query parameter a website's Buy button adds to /checkout. */
export const SOURCE_PARAM = "src"
export const WEBSITE_SOURCE: OrderSource = "website"

/** Stripe metadata key that carries the source from checkout to fulfilment. */
export const SOURCE_METADATA_KEY = "order_source"

export function isOrderSource(value: unknown): value is OrderSource {
  return value === "storelib" || value === "website"
}

/**
 * The checkout page's own address is the Referer of every call it makes, so
 * a route the checkout page calls can read the source from there without
 * the page having to send it.
 */
export function orderSourceFromRequest(request: Request): OrderSource {
  const referer = request.headers.get("referer")
  if (!referer) return "storelib"
  try {
    const url = new URL(referer)
    return url.searchParams.get(SOURCE_PARAM) === WEBSITE_SOURCE ? "website" : "storelib"
  } catch {
    return "storelib"
  }
}

/** Metadata first (it was decided on the checkout page), the request second. */
export function orderSourceFrom(metadata: Record<string, unknown> | null | undefined, request?: Request): OrderSource {
  const recorded = metadata?.[SOURCE_METADATA_KEY]
  if (isOrderSource(recorded)) return recorded
  return request ? orderSourceFromRequest(request) : "storelib"
}

interface UpdatableAdmin {
  from: (table: string) => any
}

/**
 * Best effort, and never thrown: see the note at the top. A missing column
 * is expected until the SQL is run and is not logged; anything else is.
 */
export async function tagOrderSource(
  admin: UpdatableAdmin,
  orderIds: string | Array<string | null | undefined>,
  source: OrderSource,
): Promise<void> {
  const ids = (Array.isArray(orderIds) ? orderIds : [orderIds]).filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  )
  if (ids.length === 0) return
  try {
    const { error } = await admin.from("orders").update({ source }).in("id", ids)
    if (error && !/source/.test(String(error.message))) {
      console.warn("[orders] could not record the order source:", error.message)
    }
  } catch (error) {
    console.warn("[orders] could not record the order source:", (error as Error)?.message)
  }
}

import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { isPlanPriced } from "@/lib/money/product-currency"
import { MARKETPLACE_CURRENCY, toUsdMinor } from "@/lib/money/marketplace"
import { marketplaceRates, marketplaceUsdFor } from "@/lib/money/marketplace-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * A PRODUCT'S OWN DOLLAR PRICE FOR STORELIB'S MARKETPLACE (lib/money/marketplace).
 *
 * GET  ?productId=   -> { enabled, storeCurrency, usdPerUnit, fxAsOf, fixedCents, approvedAt }
 * POST { productId, usdCents }  -> sets it (usdCents a whole number of cents) or clears it (null)
 *
 * By default the marketplace shows a product at its store price converted
 * at the day's ECB rate. A creator can instead set a dollar price of their
 * own: saving it here is their approval (`marketplace_usd_approved_at`), and
 * clearing it goes back to the converted price. Nothing here changes the
 * store's own price, and Storelib never sets or rounds one for them.
 *
 * Only while the marketplace is in dollars for the store (enabled), and
 * never for a plan, which is already in dollars. The columns arrive with SQL
 * part 244; before it, GET says so (ready: false) and POST refuses.
 */

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_USD_CENTS = 100_000_000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

async function ownProduct(db: Db, creatorId: string, productId: unknown) {
  if (typeof productId !== "string" || !ID.test(productId)) return null
  const { data } = await db.from("products").select("id, creator_id, type, price_cents").eq("id", productId).eq("creator_id", creatorId).maybeSingle()
  return (data as { id: string; creator_id: string; type: string | null; price_cents: number | null } | null) ?? null
}

async function fixedOf(db: Db, productId: string): Promise<{ ready: boolean; fixedCents: number | null; approvedAt: string | null }> {
  const { data, error } = await db.from("products").select("marketplace_usd_cents, marketplace_usd_approved_at").eq("id", productId).maybeSingle()
  if (error) return { ready: false, fixedCents: null, approvedAt: null }
  const row = (data ?? {}) as { marketplace_usd_cents?: number | null; marketplace_usd_approved_at?: string | null }
  return { ready: true, fixedCents: row.marketplace_usd_cents ?? null, approvedAt: row.marketplace_usd_approved_at ?? null }
}

export async function GET(request: Request) {
  const c = await shopCaller("products", { read: true })
  if (c instanceof NextResponse) return c
  const product = await ownProduct(c.db, c.creatorId, new URL(request.url).searchParams.get("productId"))
  if (!product) return physicalJson({ error: "Not found." }, 404)
  const store = (await readStoreCurrency(c.db, c.creatorId)).currency.toUpperCase()
  const enabled = (await marketplaceUsdFor(c.creatorId)) && store !== MARKETPLACE_CURRENCY && !isPlanPriced(product)
  if (!enabled) return physicalJson({ enabled: false })
  const [fx, fixed] = await Promise.all([marketplaceRates(c.db, undefined, { cached: true }), fixedOf(c.db, product.id)])
  /* What one whole unit of the store's currency is in dollar cents today, for the editor's "about $12.34"; null with no fresh rate. */
  const per100 = fx ? toUsdMinor(100, store, fx) : null
  return physicalJson({ enabled: true, ready: fixed.ready, storeCurrency: store, usdPerUnit: per100 === null ? null : per100 / 100, fxAsOf: fx?.asOf ?? null, fixedCents: fixed.fixedCents, approvedAt: fixed.approvedAt })
}

export async function POST(request: Request) {
  const c = await shopCaller("products")
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  const product = await ownProduct(c.db, c.creatorId, body?.productId)
  if (!product) return physicalJson({ error: "Not found." }, 404)
  if (!(await marketplaceUsdFor(c.creatorId)) || isPlanPriced(product)) return physicalJson({ error: "This product has no separate marketplace price." }, 400)
  const raw = body?.usdCents
  const cents = raw === null ? null : typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= MAX_USD_CENTS ? raw : undefined
  if (cents === undefined) return physicalJson({ error: "Enter a dollar price." }, 400)
  const patch = cents === null ? { marketplace_usd_cents: null, marketplace_usd_approved_at: null } : { marketplace_usd_cents: cents, marketplace_usd_approved_at: new Date().toISOString() }
  const { error } = await c.db.from("products").update(patch).eq("id", product.id).eq("creator_id", c.creatorId)
  if (error) return physicalJson({ error: /marketplace_usd/.test(String(error.message)) ? "This needs its database update (SQL part 244)." : "Could not save. Try again." }, 400)
  return physicalJson({ ok: true, fixedCents: patch.marketplace_usd_cents, approvedAt: patch.marketplace_usd_approved_at })
}

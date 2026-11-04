import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { loadTaxSetup, saveTaxSwitches } from "@/lib/tax/server"
import { detectedCountry, loadStoreSettings } from "@/lib/store/settings-server"
import { recordActivity } from "@/lib/activity/log-server"
import { readinessChanged } from "@/lib/physical/readiness-server"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Settings › Taxes, for every store: the switches, the regions and the overrides in one read. */
export async function GET() {
  const c = await shopCaller("store", { read: true })
  if (c instanceof NextResponse) return c
  const db = c.db
  const [setup, h, selling, products, store] = await Promise.all([
    loadTaxSetup(c.db, c.creatorId),
    headers(),
    /* The store's selling currency (Settings › Store details), what its prices and taxes are in. Never the payout currency, which is only where money lands. */
    readStoreCurrency(db, c.creatorId),
    /* For a product's own rate: the store's products by name. */
    c.db.from("products").select("id, title").eq("creator_id", c.creatorId).neq("status", "archived").order("title").limit(500),
    /* Settings › Store details' country: "New locations and tax start here". */
    loadStoreSettings(c.db, c.creatorId).catch(() => null),
  ])
  return physicalJson({
    ...setup,
    /* The country the first region is offered in: where the store says it is based, else where the request came from. */
    detectedCountry: store?.defaultCountry ?? detectedCountry(h),
    currency: selling.currency,
    products: ((products?.data ?? []) as { id: string; title: string | null }[]).map((p) => ({ id: p.id, title: p.title || "Untitled product" })),
  })
}

export async function PUT(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const done = await saveTaxSwitches(c.db, c.creatorId, body)
  if (!done.ok) return physicalJson({ error: done.error }, done.status)
  /* Tax on with no rate is on the checklist (lib/physical/readiness): asked again now. */
  readinessChanged(c)
  await recordActivity(c.db, c, { action: "settings.taxes" })
  return physicalJson(await loadTaxSetup(c.db, c.creatorId))
}

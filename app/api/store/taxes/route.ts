import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { loadTaxSetup, saveTaxSwitches } from "@/lib/tax/server"
import { detectedCountry } from "@/lib/store/settings-server"
import { recordActivity } from "@/lib/activity/log-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Settings › Taxes, for every store: the switches, the regions and the overrides in one read. */
export async function GET() {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const db = c.db
  const [setup, h, creator, products] = await Promise.all([
    loadTaxSetup(c.db, c.creatorId),
    headers(),
    db.from("creators").select("payout_currency").eq("id", c.creatorId).maybeSingle(),
    /* For a product's own rate: the store's products by name. */
    c.db.from("products").select("id, title").eq("creator_id", c.creatorId).neq("status", "archived").order("title").limit(500),
  ])
  return physicalJson({
    ...setup,
    detectedCountry: detectedCountry(h),
    currency: (creator?.data?.payout_currency as string | null) ?? "USD",
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
  await recordActivity(c.db, c, { action: "settings.taxes" })
  return physicalJson(await loadTaxSetup(c.db, c.creatorId))
}

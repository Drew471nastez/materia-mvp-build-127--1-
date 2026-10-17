import { NextResponse } from "next/server"
import { physicalJson, shopCaller } from "@/lib/physical/auth"
import { loadTaxSetup } from "@/lib/tax/server"
import { taxOrders, taxOverview } from "@/lib/tax/report"
import { taxCsv, taxPeriod } from "@/lib/tax/report-model"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/store/taxes/overview?days=30|90|365            -> { status, summary, days, currency }
 * GET /api/store/taxes/overview?days=…&format=csv          -> the orders behind it, as CSV
 * Settings › Taxes' overview (round AG): the store's own orders only, by its owner or team.
 */
export async function GET(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const url = new URL(request.url)
  const days = taxPeriod(url.searchParams.get("days"))
  /* c.db is the service client (shopCaller), and the caller owns or works in this store. */
  const db = c.db
  const [setup, creator] = await Promise.all([loadTaxSetup(db, c.creatorId), db.from("creators").select("payout_currency").eq("id", c.creatorId).maybeSingle()])
  const currency = ((creator?.data?.payout_currency as string | null) ?? "USD").toUpperCase()
  if (url.searchParams.get("format") === "csv") {
    const rows = await taxOrders(c.db, c.creatorId, days)
    return new NextResponse(taxCsv(rows, currency), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="storelib-tax-${days}-days.csv"`, "Cache-Control": "no-store" },
    })
  }
  return physicalJson({ ...(await taxOverview(c.db, c.creatorId, setup, days)), currency })
}

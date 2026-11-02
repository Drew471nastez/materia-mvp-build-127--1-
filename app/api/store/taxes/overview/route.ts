import { NextResponse } from "next/server"
import { physicalJson, shopCaller } from "@/lib/physical/auth"
import { loadTaxSetup } from "@/lib/tax/server"
import { taxOrders, taxOverview } from "@/lib/tax/report"
import { taxCsv, taxPeriod } from "@/lib/tax/report-model"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/store/taxes/overview?days=30|90|365            -> { status, summary, days, currency }
 * GET /api/store/taxes/overview?days=…&format=csv          -> the orders behind it, as CSV
 * Settings › Taxes' overview (round AG): the store's own orders only, by its owner or team.
 */
export async function GET(request: Request) {
  const c = await shopCaller("store", { read: true })
  if (c instanceof NextResponse) return c
  const url = new URL(request.url)
  const days = taxPeriod(url.searchParams.get("days"))
  /* c.db is the service client (shopCaller), and the caller owns or works in this store. */
  const db = c.db
  /* The store's selling currency, the one its orders are charged in (lib/store/selling-currency), not the payout's. */
  const [setup, store] = await Promise.all([loadTaxSetup(db, c.creatorId), readStoreCurrency(db, c.creatorId)])
  const currency = (store.currency || "USD").toUpperCase()
  if (url.searchParams.get("format") === "csv") {
    const rows = await taxOrders(c.db, c.creatorId, days)
    return new NextResponse(taxCsv(rows, currency), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="storelib-tax-${days}-days.csv"`, "Cache-Control": "no-store" },
    })
  }
  return physicalJson({ ...(await taxOverview(c.db, c.creatorId, setup, days, currency)), currency })
}

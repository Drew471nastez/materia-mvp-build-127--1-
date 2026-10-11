import { creatorFor } from "@/lib/team/server"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { groupOrders } from "@/lib/orders/order-view"
import { readCreatorOrders } from "@/lib/orders/load-rows"
import { decodeRuns, isExportFormat, ordersCsv, pickByNumber, safeFileName } from "@/lib/orders/export-csv"
import { isTimeZone } from "@/lib/orders/time-zone"
import { signOrderLink, verifyOrderLink } from "@/lib/orders/signed-link"

export const runtime = "nodejs"

/**
 * THE ORDERS EXPORT, FOR THE PHONE APP
 *
 * In a browser the export dialog writes the CSV itself and saves it
 * (app/app/orders/export-dialog.tsx). In the app a file written in the page
 * cannot be saved (lib/platform/save-file.ts), so:
 *
 *   POST  signed in. Takes the chosen orders by number, the format and the
 *         time zone, and answers with a link signed for this creator, good
 *         for five minutes.
 *   GET   ?t=<that link>. Opened by the system browser sheet, which has no
 *         session. Reads the same rows the Orders page reads, picks the same
 *         orders by number, writes the same CSV and sends it as a download.
 */

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in again to export." }, { status: 401 })

  const admin = createAdminClient()
  /* The store's, for its owner or a team member whose role has orders (lib/team). */
  const found = await creatorFor(admin, user.id, "orders")
  if (found.kind === "denied") return NextResponse.json({ error: "Your role on this store's team does not include this." }, { status: 403 })
  if (found.kind === "none") return NextResponse.json({ error: "Sign in again to export." }, { status: 401 })
  const creator = found.creator

  const body = await request.json().catch(() => null)
  const runs = typeof body?.numbers === "string" ? body.numbers : ""
  if (!decodeRuns(runs) || runs.length > 6000) return NextResponse.json({ error: "Choose the orders to export again." }, { status: 400 })
  const format = isExportFormat(body?.format) ? body.format : "spreadsheet"
  const zone = isTimeZone(body?.timeZone) ? body.timeZone : "UTC"
  const name = safeFileName(body?.name, "orders.csv")

  const token = signOrderLink({ k: "csv", c: creator.id, n: runs, f: format, z: zone, name, d: "attachment" })
  if (!token) return NextResponse.json({ error: "Exporting is not available right now." }, { status: 503 })

  const origin = new URL(request.url).origin
  return NextResponse.json({ url: `${origin}/api/app/orders/export?t=${encodeURIComponent(token)}` }, { headers: { "Cache-Control": "no-store" } })
}

export async function GET(request: Request) {
  const link = verifyOrderLink(new URL(request.url).searchParams.get("t"))
  if (!link || link.k !== "csv") {
    return new NextResponse("This link has expired. Export again from the Orders page.", {
      status: 410,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    })
  }

  const admin = createAdminClient()
  const { rows } = await readCreatorOrders(admin, link.c)
  const chosen = pickByNumber(groupOrders(rows), decodeRuns(link.n) ?? [])
  const csv = ordersCsv(chosen, isTimeZone(link.z) ? link.z : "UTC", link.f === "plain" ? "plain" : "spreadsheet")

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFileName(link.name, "orders.csv")}"`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  })
}

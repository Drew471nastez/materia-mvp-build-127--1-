import { creatorFor } from "@/lib/team/server"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { queryFromParams } from "@/lib/orders/order-view"
import { readOrdersForExport, type ExportChoice } from "@/lib/orders/paged"
import { decodeRuns, isExportFormat, ordersCsv, safeFileName } from "@/lib/orders/export-csv"
import { isTimeZone } from "@/lib/orders/time-zone"
import { signOrderLink, verifyOrderLink } from "@/lib/orders/signed-link"

export const runtime = "nodejs"

/**
 * THE ORDERS EXPORT
 *
 * The Orders page has one page of orders (lib/orders/paged.ts). The export
 * dialog (app/app/orders/export-dialog.tsx) writes the CSV itself for the
 * orders it has; for any other choice (this view, all orders, by date, ticked
 * orders on other pages), and always in the app, where a file written in the
 * page cannot be saved (lib/platform/save-file.ts), the server writes it:
 *
 *   POST  signed in. Takes the chosen orders, by number or as a list the
 *         page draws (its address and dates), the format and the time zone.
 *         With `download` it answers with the file; without, with a link
 *         signed for this creator, good for five minutes.
 *   GET   ?t=<that link>. Opened by the system browser sheet, which has no
 *         session. Reads the same orders, numbered as the page numbers them,
 *         writes the same CSV and sends it as a download.
 */

type Choice = { n: string; q?: string; ws?: number; we?: number }

/** The choice as the link and the body carry it, or null when it says nothing usable. */
function choiceFrom(body: { numbers?: unknown; query?: unknown; window?: unknown }): Choice | null {
  if (typeof body.numbers === "string") {
    if (!decodeRuns(body.numbers) || body.numbers.length > 6000) return null
    return { n: body.numbers }
  }
  if (typeof body.query !== "string" || body.query.length > 1000) return null
  const w = body.window as { start?: unknown; end?: unknown } | null | undefined
  if (w === null || w === undefined) return { n: "", q: body.query }
  if (!Number.isSafeInteger(w.start) || !Number.isSafeInteger(w.end) || (w.end as number) < (w.start as number)) return null
  return { n: "", q: body.query, ws: w.start as number, we: w.end as number }
}

function exportChoice(c: Choice): ExportChoice {
  if (typeof c.q !== "string") return { numbers: decodeRuns(c.n) ?? [] }
  return { query: queryFromParams(new URLSearchParams(c.q)), window: typeof c.ws === "number" && typeof c.we === "number" ? { start: c.ws, end: c.we } : null }
}

function csvResponse(csv: string, name: string): NextResponse {
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFileName(name, "orders.csv")}"`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  })
}

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
  const choice = body && typeof body === "object" ? choiceFrom(body) : null
  if (!choice) return NextResponse.json({ error: "Choose the orders to export again." }, { status: 400 })
  const format = isExportFormat(body?.format) ? body.format : "spreadsheet"
  const zone = isTimeZone(body?.timeZone) ? body.timeZone : "UTC"
  const name = safeFileName(body?.name, "orders.csv")

  /* A browser: the file itself, for the orders the page does not have. */
  if (body?.download === true) {
    const chosen = await readOrdersForExport(admin, creator.id, exportChoice(choice))
    return csvResponse(ordersCsv(chosen, zone, format), name)
  }

  const token = signOrderLink({ k: "csv", c: creator.id, ...choice, f: format, z: zone, name, d: "attachment" })
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
  /* The orders of the creator the link was signed for, numbered as the Orders page numbers them. */
  const chosen = await readOrdersForExport(admin, link.c, exportChoice({ n: link.n, q: link.q, ws: link.ws, we: link.we }))
  const csv = ordersCsv(chosen, isTimeZone(link.z) ? link.z : "UTC", link.f === "plain" ? "plain" : "spreadsheet")
  return csvResponse(csv, link.name)
}

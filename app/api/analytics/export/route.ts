import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getMainDomain } from "@/lib/url-helpers"
import { creatorFor, storeAccessOf, viewerKey } from "@/lib/team/server"
import { countReportAnswer, reportQuestion } from "@/lib/analytics/report-answer"
import { countCommerce } from "@/lib/analytics/commerce-server"
import JSZip from "jszip"
import { analyticsCsv, analyticsFiles, exportFileName, parseExportFormat, parseExportReports } from "@/lib/analytics/export-csv"
import { profileOf, sectionsFor, modeFor } from "@/lib/analytics/sections"
import { propertyLabel, propertyParam } from "@/lib/analytics/properties"
import { todayIn } from "@/lib/date-range/range"
import type { Reports } from "@/lib/analytics/reports"
import { signOrderLink, verifyOrderLink } from "@/lib/orders/signed-link"
import { authUnavailableResponse, readUserForRoute, routeUser } from "@/lib/auth/route-user"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ANALYTICS AS A CSV FILE: every report the page shows, for the very
 * question the page asks (the period, what it is compared with, the time
 * zone, the place, the product and the All / Digital / Physical switch),
 * counted by the same code (lib/analytics/report-answer and
 * lib/analytics/commerce-server) and written by lib/analytics/export-csv.
 *
 *   GET  ?start=&end=&cstart=&cend=&tz=&property=&product=&kind=
 *        &reports=summary,sales,...   which reports (lib/analytics/export-csv
 *                                     EXPORT_REPORTS); none named is all
 *        &format=csv|zip              one CSV with them all, or a zip with
 *                                     a CSV per report (jszip)
 *        signed in: the file, as a download
 *   POST the same question as `query`: a link signed for this person and
 *        this question, good for five minutes, for the phone app, whose
 *        system browser sheet has no session (lib/platform/save-file)
 *   GET  ?t=<that link>
 *
 * WHO. The store the session works in (lib/team/server creatorFor, area
 * analytics): the owner's own, or the store a team member given Analytics
 * works in. A signed link names the store and the account, and opening it
 * reads the membership and its permissions again (storeAccessOf). Nothing in
 * the question can name another store.
 */

type Who = { ok: true; creatorId: string; store: string; ownerUserId: string | null; actingIn: string | null } | { ok: false; status: number; error: string }

/** The store this account exports: the one the session works in, or (a signed link) the one the link names, if it still may. */
async function owner(userId: string, linkStore?: string): Promise<Who> {
  const admin = createAdminClient()
  if (linkStore) {
    const access = await storeAccessOf(admin, userId, linkStore, "analytics")
    if (!access.ok && access.failed) return { ok: false, status: 503, error: "Storelib is not answering right now. Try again." }
    if (!access.ok) return { ok: false, status: 403, error: "You don't have access to this store's analytics any more." }
    const { data } = await admin.from("creators").select("display_name, slug").eq("id", linkStore).maybeSingle()
    const c = (data ?? {}) as { display_name?: string | null; slug?: string | null }
    return { ok: true, creatorId: linkStore, store: c.display_name || c.slug || "Store", ownerUserId: access.ownerUserId, actingIn: access.isOwner ? null : linkStore }
  }
  const found = await creatorFor<{ id: string; display_name: string | null; slug: string | null }>(admin, userId, "analytics", "id, display_name, slug")
  if (found.kind === "denied") return { ok: false, status: 403, error: "You don't have access to Analytics. Ask the store's owner." }
  if (found.kind === "none") return { ok: false, status: 404, error: "Set up your store first." }
  return { ok: true, creatorId: found.creator.id, store: found.creator.display_name || found.creator.slug || "Store", ownerUserId: found.acting ? found.acting.ownerUserId : userId, actingIn: found.acting ? found.creator.id : null }
}

async function fileFor(userId: string, query: string, linkStore?: string): Promise<NextResponse> {
  const who = await owner(userId, linkStore)
  if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status })
  const admin = createAdminClient()
  const url = new URL(`https://export.local/?${query}`)
  const asked = await reportQuestion(admin, userId, url, getMainDomain(), { creatorId: who.creatorId, ownerUserId: who.ownerUserId })
  if ("error" in asked) return NextResponse.json({ error: asked.error }, { status: asked.status })
  const q = asked.q
  /* The very store the check found: a question is never answered for another store. */
  if (q.creatorId !== who.creatorId) return NextResponse.json({ error: "You don't have access to this store's analytics." }, { status: 403 })

  const products = Object.entries(asked.productTypes).map(([, type]) => ({ type }))
  const profile = profileOf({ products, onePageId: q.properties.onePageId, websites: q.properties.websites, communities: 0 })
  const mode = modeFor(profile, q.mode ?? "all")
  const productKind = q.product ? ((asked.productTypes[q.product] ?? "digital") as never) : null
  const sections = sectionsFor(profile, { property: propertyParam(q.selector) ?? "all", productKind, mode })

  const [answer, commerce] = await Promise.all([
    countReportAnswer(admin, { ...q, mode }, asked.productTitles, asked.productTypes, viewerKey(userId, who.actingIn)),
    sections.sales
      ? countCommerce(admin, { creatorId: q.creatorId, properties: q.properties, selector: q.selector, productId: q.product, productTypes: asked.productTypes, span: q.window, previous: q.previous, timeZone: q.timeZone, mode })
      : Promise.resolve(null),
  ])
  const reports = answer.reports as Reports
  const conversion = answer.conversion as { currency?: string } | undefined
  const day = (ms: number) => todayIn(q.timeZone, ms)
  const input = {
    meta: {
      store: who.store,
      from: day(q.window.start),
      to: day(q.window.end - 1),
      comparedFrom: q.previous ? day(q.previous.start) : null,
      comparedTo: q.previous ? day(q.previous.end - 1) : null,
      timeZone: q.timeZone,
      place: propertyLabel(q.properties, q.selector),
      sales: mode === "digital" ? "Digital" : mode === "physical" ? "Physical" : "All",
      currency: commerce?.currency || conversion?.currency || "USD",
      madeAt: new Date().toISOString(),
    },
    reports,
    commerce,
    sections,
    timeZone: q.timeZone,
    only: parseExportReports(url.searchParams.get("reports")),
  }
  const from = day(q.window.start)
  const to = day(q.window.end - 1)
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" }
  if (parseExportFormat(url.searchParams.get("format")) === "zip") {
    /* A CSV per report, each with the same head, in one zip. A byte order mark on each, for Excel. */
    const zip = new JSZip()
    for (const f of analyticsFiles(input)) zip.file(f.name, `﻿${f.csv}`)
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" })
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${exportFileName(from, to, "zip")}"` },
    })
  }
  /* A byte order mark first, so Excel reads the names in their own letters. */
  return new NextResponse(`﻿${analyticsCsv(input)}`, {
    status: 200,
    headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${exportFileName(from, to)}"` },
  })
}

/** The page's question, without anything that is not part of it. */
function questionOf(params: URLSearchParams): string {
  const keep = new URLSearchParams()
  for (const k of ["start", "end", "cstart", "cend", "compare", "tz", "property", "product", "kind", "reports", "format"]) {
    const v = params.get(k)
    if (v !== null && v.length <= 200) keep.set(k, v)
  }
  return keep.toString()
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get("t")
  try {
    if (token) {
      const link = verifyOrderLink(token)
      if (!link || link.k !== "analytics") {
        return new NextResponse("This link has expired. Export again from Analytics.", { status: 410, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } })
      }
      /* The store the link was made for, if this account may still use its Analytics. */
      return await fileFor(link.u, link.q, link.c)
    }
    const supabase = await createClient()
    const { data: { user }, unavailable } = await readUserForRoute()
    if (unavailable) return authUnavailableResponse()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    return await fileFor(user.id, questionOf(url.searchParams))
  } catch (error) {
    console.error("[analytics/export]", (error as Error).message)
    return NextResponse.json({ error: "The export could not be made. Try again." }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const caller = await routeUser()
  if (caller.kind === "unavailable") return authUnavailableResponse()
  const user = caller.kind === "user" ? caller.user : null
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { query?: unknown; disposition?: unknown } | null
  if (!body || typeof body.query !== "string" || body.query.length > 2000) return NextResponse.json({ error: "Bad request" }, { status: 400 })
  const who = await owner(user.id)
  if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status })
  const token = signOrderLink({ k: "analytics", c: who.creatorId, u: user.id, q: questionOf(new URLSearchParams(body.query)), d: body.disposition === "inline" ? "inline" : "attachment" })
  if (!token) return NextResponse.json({ error: "The export link could not be made." }, { status: 500 })
  return NextResponse.json({ url: `/api/analytics/export?t=${encodeURIComponent(token)}` }, { headers: { "Cache-Control": "no-store" } })
}

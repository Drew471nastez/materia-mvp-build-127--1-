import { type NextRequest, NextResponse } from "next/server"

import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { recordAdminAction } from "@/lib/admin/audit"
import { createAdminClient } from "@/lib/supabase/admin"
import { CATEGORY_ORDER, INTEGRATIONS } from "@/lib/integrations/catalog"
import { catalogMissing, clearCatalogCache, readCatalogOverrides } from "@/lib/integrations/overrides-server"
import { isIntegrationSlug, safeLogoUrl } from "@/lib/integrations/overrides"
import { readTracking } from "@/lib/store/tracking"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  /admin › INTEGRATIONS
 * ===========================================================================
 * The admin cookie first (requireAdmin), then the service role. No key a
 * store saved is ever read here: health is counts and the last error's
 * words, never a secret, never a ciphertext.
 *
 *   GET                                 requests, the catalog with /admin's
 *                                       rows over it, and health
 *   POST  { action: "request", id, status, adminNote }
 *                                       answer a request
 *   POST  { action: "catalog", id, ... }
 *                                       set /admin's row for one integration
 *                                       (or add a custom one)
 *   POST  { action: "remove", id }      drop /admin's row (back to the code's)
 */

const NO_STORE = { "Cache-Control": "no-store" }
const STATUSES = ["new", "planned", "done", "declined"] as const

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  const db = createAdminClient()

  const [requests, catalog, trackingRows, providerRows] = await Promise.all([
    db.from("integration_requests").select("*").order("created_at", { ascending: false }).limit(500),
    readCatalogOverrides(db),
    db.from("store_settings").select("tracking").not("tracking", "is", null).limit(20000),
    db.from("commerce_integrations").select("provider, status, last_error, last_sync_at").limit(20000),
  ])

  let requestRows: Record<string, unknown>[] = []
  let requestsReady = true
  if (requests.error) {
    if (catalogMissing(requests.error)) requestsReady = false
    else return adminFailure("integration requests", requests.error, "The requests could not be read.")
  } else requestRows = (requests.data ?? []) as Record<string, unknown>[]

  const creatorIds = [...new Set(requestRows.map((r) => r.creator_id).filter((v): v is string => typeof v === "string"))]
  const { data: creators } = creatorIds.length ? await db.from("creators").select("id, display_name, username").in("id", creatorIds) : { data: [] as unknown[] }
  const creatorName = new Map(((creators ?? []) as { id: string; display_name: string | null; username: string | null }[]).map((c) => [c.id, c.display_name || c.username || "A store"]))

  /* Health: how many stores have each installed, and the provider errors. */
  const installs = new Map<string, number>()
  const errors = new Map<string, { count: number; last: string | null }>()
  for (const row of (trackingRows.data ?? []) as { tracking: unknown }[]) {
    for (const id of Object.keys(readTracking(row.tracking))) installs.set(id, (installs.get(id) ?? 0) + 1)
  }
  for (const row of (providerRows.data ?? []) as { provider: string; status: string; last_error: string | null }[]) {
    if (row.status !== "disconnected") installs.set(row.provider, (installs.get(row.provider) ?? 0) + 1)
    if (row.status === "error") {
      const e = errors.get(row.provider) ?? { count: 0, last: null }
      errors.set(row.provider, { count: e.count + 1, last: e.last ?? (row.last_error ? String(row.last_error).slice(0, 200) : null) })
    }
  }

  const health = INTEGRATIONS.map((i) => {
    const key = i.kind === "tracker" ? i.trackerId! : i.kind === "commerce" ? i.providerId! : i.id
    const asked = requestRows.filter((r) => r.integration_id === i.id || String(r.name ?? "").toLowerCase() === i.name.toLowerCase()).length
    return { id: i.id, name: i.name, kind: i.kind, category: i.category, builtIn: i.builtIn, comingSoon: !!i.comingSoon, installs: installs.get(key) ?? 0, errors: errors.get(key)?.count ?? 0, lastError: errors.get(key)?.last ?? null, asked }
  })

  return NextResponse.json(
    {
      requestsReady,
      catalogReady: catalog.ready,
      requests: requestRows.map((r) => ({
        id: r.id,
        name: r.name,
        note: r.note ?? null,
        integrationId: r.integration_id ?? null,
        status: r.status ?? "new",
        adminNote: r.admin_note ?? null,
        createdAt: r.created_at,
        store: creatorName.get(String(r.creator_id)) ?? "A store",
      })),
      overrides: catalog.overrides,
      health,
      categories: CATEGORY_ORDER,
    },
    { headers: NO_STORE },
  )
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const db = createAdminClient()
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: "Bad request." }, { status: 400 })
  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null)

  if (body.action === "request") {
    const id = typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null
    const status = STATUSES.find((s) => s === body.status)
    if (!id || !status) return NextResponse.json({ error: "Bad request." }, { status: 400 })
    const patch: Record<string, unknown> = { status }
    if (body.adminNote !== undefined) patch.admin_note = text(body.adminNote, 600)
    let { error } = await db.from("integration_requests").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id)
    /* Before part 115 there is no admin_note or updated_at: the status alone. */
    if (error && catalogMissing(error)) ({ error } = await db.from("integration_requests").update({ status }).eq("id", id))
    if (error) return adminFailure("integration request", error, "That did not save.")
    await recordAdminAction(db, { action: "integration_request_status", targetType: "platform", targetId: id, detail: { status } })
    return NextResponse.json({ ok: true })
  }

  if (body.action === "catalog") {
    if (!isIntegrationSlug(body.id)) return NextResponse.json({ error: "Use a short id: lower case letters, digits and dashes." }, { status: 400 })
    const known = INTEGRATIONS.some((i) => i.id === body.id)
    const availability = body.availability === "coming_soon" || body.availability === "hidden" ? body.availability : "default"
    const category = typeof body.category === "string" && (CATEGORY_ORDER as string[]).includes(body.category) ? body.category : null
    if (!known && !text(body.name, 60)) return NextResponse.json({ error: "A new integration needs a name." }, { status: 400 })
    const logo = body.logoUrl === undefined || body.logoUrl === "" || body.logoUrl === null ? null : safeLogoUrl(body.logoUrl)
    if (body.logoUrl && !logo) return NextResponse.json({ error: "The icon must be an https image address or a file under /integrations." }, { status: 400 })
    const row = {
      id: body.id,
      name: text(body.name, 60),
      summary: text(body.summary, 160),
      category,
      logo_url: logo,
      docs_url: typeof body.docsUrl === "string" && /^https:\/\//.test(body.docsUrl) ? body.docsUrl.slice(0, 500) : null,
      availability,
      custom: !known,
      physical: !known && body.physical === true,
      sort: typeof body.sort === "number" && Number.isFinite(body.sort) ? Math.round(body.sort) : null,
      updated_at: new Date().toISOString(),
    }
    const { error } = await db.from("integration_catalog").upsert(row, { onConflict: "id" })
    if (error) {
      if (catalogMissing(error)) return NextResponse.json({ error: "Run SQL part 115 in Supabase first: the catalog table is not there yet." }, { status: 409 })
      return adminFailure("integration catalog", error, "That did not save.")
    }
    clearCatalogCache()
    await recordAdminAction(db, { action: known ? "integration_catalog_set" : "integration_catalog_add", targetType: "platform", targetId: String(body.id), targetLabel: row.name ?? String(body.id), detail: { availability } })
    return NextResponse.json({ ok: true })
  }

  if (body.action === "remove") {
    if (!isIntegrationSlug(body.id)) return NextResponse.json({ error: "Bad request." }, { status: 400 })
    const { error } = await db.from("integration_catalog").delete().eq("id", body.id)
    if (error && !catalogMissing(error)) return adminFailure("integration catalog", error, "That did not save.")
    clearCatalogCache()
    await recordAdminAction(db, { action: "integration_catalog_remove", targetType: "platform", targetId: String(body.id) })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Bad request." }, { status: 400 })
}

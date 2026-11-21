import { NextResponse, type NextRequest } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { recordAdminAction } from "@/lib/admin/audit"
import { UUID_RE } from "@/lib/admin/platform-metrics"
import { mergeListings } from "@/lib/themes/marketplace-shared"
import { parseListingInput, type ListingInput } from "@/lib/themes/marketplace-admin"
import { LISTINGS_TABLE, LISTING_COLUMNS, PACKAGE_BUCKET, previewPathFor, readListingRows, revalidateMarketplace, rowToListing, type ListingRow } from "@/lib/themes/marketplace-server"
import { STORELIB_DEFAULT_ID } from "@/lib/website-builder/theme-registry"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }
const SQL_MISSING = "The theme marketplace needs SQL part 252 (supabase/sql/run-now/252_theme_marketplace_and_plan_overrides.sql) to run first."

/**
 * ===========================================================================
 *  GET    /api/admin/themes          every listing, hidden ones too
 *  POST   /api/admin/themes          { id?, name, slug, author_name, category, tier, price_cents, published, sort_order, demo_url, screenshots?, builtin? }
 *  DELETE /api/admin/themes?id=…     remove a listing (installs made from it are the creators' own and stay)
 * ===========================================================================
 * The cookie is checked first in every handler. Each save drops the
 * marketplace cache, so the library and storelib.com/themes show it on the
 * next request.
 */
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  const { rows, missing, failed } = await readListingRows({ includeHidden: true })
  if (failed) return NextResponse.json({ error: "The themes could not be read." }, { status: 500, headers: NO_STORE })
  return NextResponse.json({ listings: mergeListings(rows.map(rowToListing), { includeHidden: true }), missing, notice: missing ? SQL_MISSING : null }, { headers: NO_STORE })
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const parsed = parseListingInput(body)
  if (parsed.ok === false) return NextResponse.json({ error: (parsed as { error: string }).error }, { status: 400, headers: NO_STORE })
  const input = (parsed as { value: ListingInput }).value

  const admin = createAdminClient()
  const id = typeof body?.id === "string" && UUID_RE.test(body.id) ? body.id : null
  /*
    A native registry theme's row, only when the form says so. The default
    address is a template listed from code now (templates round 16): a row
    saved for it dresses that template and must not name the native theme,
    which mergeListings retires.
  */
  const builtin = body?.builtin === true
  const row: Record<string, unknown> = { ...input, updated_at: new Date().toISOString() }
  if (builtin && !id) row.builtin_theme_id = STORELIB_DEFAULT_ID

  const write = id
    ? admin.from(LISTINGS_TABLE).update(row).eq("id", id).select(LISTING_COLUMNS).maybeSingle()
    : admin.from(LISTINGS_TABLE).insert(row).select(LISTING_COLUMNS).maybeSingle()
  const { data, error } = await write
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Another theme already has that address." }, { status: 409, headers: NO_STORE })
    if (error.code === "42P01" || error.code === "PGRST205") return NextResponse.json({ error: SQL_MISSING }, { status: 503, headers: NO_STORE })
    return adminFailure("theme listing save", error, "The theme did not save.")
  }
  if (!data) return NextResponse.json({ error: "No theme has this id." }, { status: 404, headers: NO_STORE })

  const saved = data as ListingRow
  await recordAdminAction(admin, { action: id ? "theme_listing_updated" : "theme_listing_created", targetType: "platform", targetId: saved.id, targetLabel: saved.name, detail: { slug: saved.slug, tier: saved.tier, published: saved.published } })
  revalidateMarketplace([saved.slug])
  return NextResponse.json({ ok: true, listing: rowToListing(saved) }, { headers: NO_STORE })
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const id = new URL(req.url).searchParams.get("id") ?? ""
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "No theme has this id." }, { status: 400, headers: NO_STORE })
  const admin = createAdminClient()
  const { data, error } = await admin.from(LISTINGS_TABLE).delete().eq("id", id).select("id, slug, name, package_path").maybeSingle()
  if (error) return adminFailure("theme listing delete", error, "The theme was not removed.")
  if (!data) return NextResponse.json({ error: "No theme has this id." }, { status: 404, headers: NO_STORE })
  const gone = data as { id: string; slug: string; name: string; package_path: string | null }
  /* Its zip and preview go with it. Websites already made from it are copies and keep everything. */
  const paths = [gone.package_path, previewPathFor(gone.id)].filter((p): p is string => !!p)
  await admin.storage.from(PACKAGE_BUCKET).remove(paths).catch(() => undefined)
  await recordAdminAction(admin, { action: "theme_listing_removed", targetType: "platform", targetId: gone.id, targetLabel: gone.name, detail: { slug: gone.slug } })
  revalidateMarketplace([gone.slug])
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}

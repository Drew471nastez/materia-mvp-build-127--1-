import { NextResponse, type NextRequest } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { recordAdminAction } from "@/lib/admin/audit"
import { UUID_RE } from "@/lib/admin/platform-metrics"
import { checkThemeZipSize } from "@/lib/themes/zip-rules"
import {
  LISTINGS_TABLE,
  LISTING_COLUMNS,
  LISTING_COLUMNS_FULL,
  PACKAGE_BUCKET,
  isMissingColumn,
  PACKAGE_PATH_RE,
  checkThemeZip,
  packagePathFor,
  previewPathFor,
  revalidateMarketplace,
  rowToListing,
  type ListingRow,
} from "@/lib/themes/marketplace-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/* A 50 MB zip is downloaded, read and parsed here once. */
export const maxDuration = 60

const NO_STORE = { "Cache-Control": "no-store" }

/**
 * ===========================================================================
 *  A THEME'S ZIP, IN TWO STEPS
 * ===========================================================================
 *  PUT  { listingId, size }   a signed upload address in the private bucket,
 *                             at a path this route chose. The file goes there
 *                             from the browser, never through a function's
 *                             4.5 MB body limit.
 *  POST { listingId, path }   read it back from storage, check it
 *                             (lib/themes/marketplace-server.ts checkThemeZip:
 *                             names, links, kinds, count, the central archive
 *                             check, then the import pipeline's parse), keep
 *                             the preview it draws, and point the listing at
 *                             it. A zip that fails is deleted and the listing
 *                             keeps the one it had.
 *
 * Nothing in a zip is run. The admin cookie is checked first in both.
 */
export async function PUT(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = (await req.json().catch(() => null)) as { listingId?: unknown; size?: unknown } | null
  const listingId = typeof body?.listingId === "string" && UUID_RE.test(body.listingId) ? body.listingId : null
  if (!listingId) return NextResponse.json({ error: "Save the theme first, then add its zip." }, { status: 400, headers: NO_STORE })
  const problem = checkThemeZipSize(Number(body?.size))
  if (problem) return NextResponse.json({ error: problem }, { status: 413, headers: NO_STORE })

  const admin = createAdminClient()
  const { data: listing } = await admin.from(LISTINGS_TABLE).select("id").eq("id", listingId).maybeSingle()
  if (!listing) return NextResponse.json({ error: "No theme has this id." }, { status: 404, headers: NO_STORE })

  const path = packagePathFor(listingId)
  const { data, error } = await admin.storage.from(PACKAGE_BUCKET).createSignedUploadUrl(path)
  if (error || !data?.signedUrl) return adminFailure("theme zip upload url", error ?? "no url", "Could not start the upload. Try again.")
  return NextResponse.json({ url: data.signedUrl, path }, { headers: NO_STORE })
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = (await req.json().catch(() => null)) as { listingId?: unknown; path?: unknown } | null
  const listingId = typeof body?.listingId === "string" && UUID_RE.test(body.listingId) ? body.listingId : null
  const path = typeof body?.path === "string" ? body.path : ""
  /* Only a path this route handed out, under this listing's own folder. */
  if (!listingId || !PACKAGE_PATH_RE.test(path) || !path.startsWith(`theme-marketplace/${listingId}/`)) {
    return NextResponse.json({ error: "That upload is not one this page started." }, { status: 400, headers: NO_STORE })
  }

  const admin = createAdminClient()
  const bucket = admin.storage.from(PACKAGE_BUCKET)
  const drop = () => bucket.remove([path]).then(() => undefined, () => undefined)

  const { data: current } = await admin.from(LISTINGS_TABLE).select("id, name, slug, package_path").eq("id", listingId).maybeSingle()
  if (!current) {
    await drop()
    return NextResponse.json({ error: "No theme has this id." }, { status: 404, headers: NO_STORE })
  }

  /* The size from storage's own record before a byte is downloaded, then the bytes. */
  const slash = path.lastIndexOf("/")
  const { data: listed } = await bucket.list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 1 })
  const recorded = Number((listed?.[0]?.metadata as { size?: unknown } | undefined)?.size)
  const sizeProblem = Number.isFinite(recorded) ? checkThemeZipSize(recorded) : null
  if (sizeProblem) {
    await drop()
    return NextResponse.json({ error: sizeProblem }, { status: 413, headers: NO_STORE })
  }
  const { data: blob, error: downloadErr } = await bucket.download(path)
  if (downloadErr || !blob) return NextResponse.json({ error: "The upload did not arrive. Try again." }, { status: 400, headers: NO_STORE })
  const buf = Buffer.from(await blob.arrayBuffer())

  const verdict = await checkThemeZip(buf)
  if (verdict.ok === false) {
    await drop()
    const failed = verdict as { error: string; errors?: string[] }
    return NextResponse.json({ error: failed.error, errors: failed.errors ?? [] }, { status: 422, headers: NO_STORE })
  }
  const ok = verdict as Extract<typeof verdict, { ok: true }>

  /* What the preview frame draws, kept beside the zip. A Shopify theme has none. */
  const previewPath = previewPathFor(listingId)
  if (ok.preview) {
    const { error: previewErr } = await bucket.upload(previewPath, Buffer.from(JSON.stringify(ok.preview)), { contentType: "application/json", upsert: true })
    if (previewErr) console.error("[admin] theme preview not stored:", previewErr.message)
  } else {
    await bucket.remove([previewPath]).catch(() => undefined)
  }

  const write = (columns: string) =>
    admin.from(LISTINGS_TABLE).update({ package_path: path, package_kind: ok.kind, updated_at: new Date().toISOString() }).eq("id", listingId).select(columns).maybeSingle()
  let { data: saved, error } = await write(LISTING_COLUMNS_FULL)
  if (isMissingColumn(error)) ({ data: saved, error } = await write(LISTING_COLUMNS))
  if (error || !saved) {
    await drop()
    return adminFailure("theme zip save", error ?? "no row", "The zip was checked but not saved. Try again.")
  }
  /* The zip it replaces: every website already made from it is a copy. */
  const old = (current as { package_path: string | null }).package_path
  if (old && old !== path) await bucket.remove([old]).catch(() => undefined)

  const row = saved as unknown as ListingRow
  await recordAdminAction(admin, { action: "theme_listing_package", targetType: "platform", targetId: listingId, targetLabel: row.name, detail: { kind: ok.kind, files: ok.files, bytes: buf.byteLength } })
  revalidateMarketplace([row.slug])
  return NextResponse.json({ ok: true, kind: ok.kind, files: ok.files, themeName: ok.name, listing: rowToListing(row) }, { headers: NO_STORE })
}

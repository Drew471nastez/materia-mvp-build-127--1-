import { createHash } from "node:crypto"
import { NextResponse } from "next/server"

import { websiteCaller } from "@/lib/team/website"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit } from "@/lib/api/rate-limit"
import { copyCover, coverForNewWebsite, renderOrigin } from "@/lib/website-builder/cover-take"
import { inspectHead } from "@/lib/security/uploads/inspect"
import { MAX_BYTES, MEDIA_TYPES, extensionOf } from "@/lib/storelib-theme/media"
import { conversionSummary, type ThemeBinary } from "@/lib/storelib-theme/shopify/convert"
import { convertFiles, readReleaseRows, releasedFiles, rowToRelease, shippedFor } from "@/lib/themes/releases-server"
import { UP_TO_DATE, runThemeUpdate, type NextThemeResult } from "@/lib/themes/theme-update"

export const runtime = "nodejs"
/* The theme is read from storage, converted and stored again as a copy, then photographed. */
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MEDIA_BUCKET = "store-builder-images"

type Params = { params: Promise<{ installId: string }> }

/**
 * ===========================================================================
 *  POST /api/website-builder/themes/[installId]/update
 * ===========================================================================
 * Update on a website whose theme has a newer release. Answers the updated
 * copy, a new draft in the library with the new theme's code and the
 * website's own content (lib/themes/theme-update.ts), and the files kept as
 * the creator's because they edited them. The website it was made from is
 * not written: it stays live, or stays the draft it was, and is the way
 * back. A full library is refused with the library's own sentence and code,
 * which the page answers with its full library sheet.
 *
 * The owner, or a team member with Website in the store, as Duplicate.
 */
export async function POST(req: Request, { params }: Params) {
  const { installId } = await params
  if (!UUID.test(installId)) return NextResponse.json({ error: "Theme not found" }, { status: 404 })
  const site = await websiteCaller()
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })

  const limited = await rateLimit({
    bucket: "theme-update",
    subjects: [`user:${site.userId}`],
    windows: [{ limit: 4, seconds: 60 }, { limit: 20, seconds: 3600 }],
    message: "That is a lot of updates in a short time. Wait a minute and try again.",
  })
  if (limited) return limited

  const { rows, missing, failed } = await readReleaseRows({ withFiles: true })
  if (failed) return NextResponse.json({ error: "Could not read the theme's versions. Try again." }, { status: 503 })
  if (missing) return NextResponse.json({ error: UP_TO_DATE, code: "up_to_date" }, { status: 409 })

  const admin = createAdminClient()
  let binaries: ThemeBinary[] = []

  const nextTheme = async (slug: string): Promise<NextThemeResult> => {
    try {
      const released = await releasedFiles(slug, rows)
      if (!released) return { ok: false, error: UP_TO_DATE }
      const converted = await convertFiles(released.files)
      if (converted.ok === false) return { ok: false, error: "The new version could not be read. Storelib has been told." }
      const { theme, report } = converted as Extract<typeof converted, { ok: true }>
      binaries = theme.binaries
      const files = { ...theme.files, "shopify/import-report.json": JSON.stringify({ summary: conversionSummary(report), ...report }, null, 2) }
      return { ok: true, theme: { files, pages: theme.pages, settings: theme.settings as unknown as { compat: Record<string, unknown>; shopify: Record<string, unknown> } }, version: released.version, shipped: shippedFor(slug, rows) }
    } catch (e) {
      console.error("[themes/update] the new version could not be composed:", e instanceof Error ? e.message : e)
      return { ok: false, error: "The new version could not be read. Try again." }
    }
  }

  /* The new version's pictures, under the store owner's account at their content's address, as the import stores them. */
  const storeAssets = async (): Promise<Record<string, string>> => {
    const urls: Record<string, string> = {}
    for (const asset of binaries) {
      try {
        const ext = extensionOf(asset.name)
        const type = MEDIA_TYPES[ext]
        if (!type || asset.bytes.byteLength > MAX_BYTES[type.kind]) continue
        const context = type.kind === "image" ? "public_image" : type.kind === "video" ? "video" : "link_page_file"
        if (!inspectHead({ fileName: asset.name, size: asset.bytes.byteLength || 1, head: asset.bytes.subarray(0, 8192), context }).ok) continue
        const path = `${site.ownerUserId}/imported/${createHash("sha256").update(asset.bytes).digest("hex").slice(0, 32)}.${ext}`
        const { error } = await admin.storage.from(MEDIA_BUCKET).upload(path, Buffer.from(asset.bytes), { contentType: type.mime, upsert: true, cacheControl: "31536000" })
        if (!error) urls[asset.name] = admin.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl
      } catch {
        /* That picture keeps the address the website had for it. */
      }
    }
    return urls
  }

  const outcome = await runThemeUpdate({ db: admin, creatorId: site.creatorId, installId, releases: rows.map(rowToRelease), nextTheme, storeAssets })
  if (outcome.ok === false) {
    const failed = outcome as Extract<typeof outcome, { ok: false }>
    return NextResponse.json({ error: failed.error, ...(failed.code ? { code: failed.code } : {}) }, { status: failed.status })
  }

  const owner = { installId: outcome.installId, userId: site.ownerUserId, creatorId: site.creatorId }
  const first = await coverForNewWebsite(owner, renderOrigin(req.url), "update", await copyCover(site.ownerUserId, installId, owner))
  return NextResponse.json({
    ok: true,
    install: { id: outcome.installId },
    install_id: outcome.installId,
    name: outcome.name,
    version: outcome.version,
    kept: outcome.kept,
    updated: outcome.updated.length,
    added: outcome.added.length,
    new_pages: outcome.newPages,
    ...first,
  })
}

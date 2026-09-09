import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isThemeId } from "@/lib/website-builder/theme-registry"
import {
  SNAPSHOT_BUCKET as BUCKET,
  MAX_BYTES,
  SNAPSHOT_TYPES as ALLOWED,
  looksLikeImage,
  previousSnapshotPath,
} from "@/lib/website-builder/snapshot"

/**
 * POST /api/website-builder/themes/[installId]/snapshot
 *
 * The editor sends a picture of the home page after a successful save. The
 * website-builder page shows that picture as the website's cover instead of
 * mounting the live storefront in a card.
 *
 * Body: the image itself (`image/webp`, `image/png` or `image/jpeg`), at most
 * `MAX_BYTES`. Response: `{ url, updated_at }`.
 *
 * Scope: the signed-in user's creator must own the install — the same rule
 * every other install route applies — and the storage path is built from the
 * user's id and the validated install id only. Nothing in the request names a
 * path.
 *
 * Durability: the snapshot is a convenience, never a dependency. If the
 * columns are missing (RUN_THEME_SNAPSHOTS.sql not run yet) the upload still
 * happens and the response says `stored: false`; if anything fails the editor
 * swallows it. A failed snapshot must never look like a failed save.
 */

type Params = { params: Promise<{ installId: string }> }

export async function POST(req: Request, { params }: Params) {
  const { installId } = await params
  if (!isThemeId(installId)) {
    return NextResponse.json({ error: "Invalid install id" }, { status: 400 })
  }

  const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase()
  const ext = ALLOWED[contentType]
  if (!ext) {
    return NextResponse.json({ error: "Unsupported image type" }, { status: 415 })
  }

  const declared = Number(req.headers.get("content-length") ?? 0)
  if (declared > MAX_BYTES) {
    return NextResponse.json({ error: "Snapshot too large" }, { status: 413 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: creator } = await supabase
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle()
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  const { data: install } = await supabase
    .from("store_theme_installs")
    .select("*")
    .eq("id", installId)
    .eq("creator_id", creator.id)
    .maybeSingle()
  if (!install) return NextResponse.json({ error: "Theme not found" }, { status: 404 })

  const bytes = new Uint8Array(await req.arrayBuffer())
  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: "Empty snapshot" }, { status: 400 })
  }
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Snapshot too large" }, { status: 413 })
  }
  if (!looksLikeImage(bytes, contentType)) {
    return NextResponse.json({ error: "Body is not the image it claims to be" }, { status: 415 })
  }

  const admin = createAdminClient()
  // A fresh object per save. The public bucket is served through a CDN with
  // a year of cache on it; overwriting one path would leave the old picture
  // on the card until the cache expired.
  const stamp = Date.now().toString(36)
  const path = `${user.id}/theme-snapshots/${installId}/${stamp}.${ext}`

  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: false,
    cacheControl: "31536000",
  })
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }
  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)
  const url = pub.publicUrl
  const updatedAt = new Date().toISOString()

  const { error: rowErr } = await admin
    .from("store_theme_installs")
    .update({ snapshot_url: url, snapshot_updated_at: updatedAt })
    .eq("id", installId)
    .eq("creator_id", creator.id)

  if (rowErr) {
    if (/snapshot_url|snapshot_updated_at/.test(rowErr.message)) {
      // Columns not there yet. The picture is uploaded and harmless; the page
      // will draw its cover from the theme's colours until the SQL has run.
      return NextResponse.json({ url, updated_at: updatedAt, stored: false })
    }
    return NextResponse.json({ error: rowErr.message }, { status: 500 })
  }

  // Best effort: the previous picture is no longer referenced. Failing to
  // remove it costs storage, not correctness, so the response does not wait
  // on the result.
  const previous = previousSnapshotPath(install, user.id, installId)
  if (previous && previous !== path) {
    void admin.storage.from(BUCKET).remove([previous]).catch(() => {})
  }

  return NextResponse.json({ url, updated_at: updatedAt, stored: true })
}

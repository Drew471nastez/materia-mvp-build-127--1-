import { NextResponse, after } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isThemeId } from "@/lib/website-builder/theme-registry"
import {
  SNAPSHOT_BUCKET as BUCKET,
  MAX_BYTES,
  SNAPSHOT_TYPES as ALLOWED,
  looksLikeImage,
  snapshotFolder,
  snapshotName,
  staleSnapshots,
  SNAPSHOT_VERSION,
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

  /*
    THE CAPTURE SAYS WHICH VERSION IT IS. Every picture before version 2 was
    the header over a blank page (see snapshot.ts), and an editor tab left
    open across a deploy goes on running that capture. Its uploads are
    refused here rather than stored: a 409 the editor swallows, and a cover
    that stays as it was instead of turning blank.
  */
  if (req.headers.get("x-snapshot-version") !== String(SNAPSHOT_VERSION)) {
    return NextResponse.json({ error: "This editor is out of date. Reload it to update covers." }, { status: 409 })
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
  const folder = snapshotFolder(user.id, installId)
  const path = `${folder}/${snapshotName(stamp, ext)}`

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

  const columnMissing = !!rowErr && /snapshot_url|snapshot_updated_at/.test(rowErr.message)
  if (rowErr && !columnMissing) {
    return NextResponse.json({ error: rowErr.message }, { status: 500 })
  }

  /*
    PRUNE THE FOLDER, WHICHEVER WAY THE WRITE WENT.

    This used to delete one file: whichever the column pointed at. With the
    column missing it deleted nothing, so every save left another picture
    behind — seventeen for one site in a week, none of them reachable. The
    folder is the record now (see snapshot.ts), so it is the folder that is
    kept tidy: the newest SNAPSHOTS_KEPT current pictures stay and the rest go.

    Scoped to this user's own folder for an install their creator owns, and
    only names this route writes are ever considered. Best effort: a stale
    picture costs storage, not correctness.

    In `after()`, not a bare `void` promise. A serverless function can be
    frozen the moment its response is sent, and work left dangling behind it
    may simply never run — which is one more way this folder could have gone
    on filling up with nobody the wiser.
  */
  after(async () => {
    try {
      const { data: files } = await admin.storage.from(BUCKET).list(folder, { limit: 100 })
      /* Including every picture from before versioning, none of which is
         ever shown and all of which are blank below the header. */
      const stale = staleSnapshots((files ?? []).map((f) => f.name)).map((name) => `${folder}/${name}`)
      if (stale.length) await admin.storage.from(BUCKET).remove(stale)
    } catch {}
  })

  if (columnMissing) {
    /*
      SAID OUT LOUD, because it was silent for a week. The picture is saved
      and the website page finds it by reading the folder, so the cover is
      right either way — but the page is making an extra storage request per
      site on every load that the column would save, and the only place that
      is visible is here.
    */
    console.warn(
      "[snapshot] store_theme_installs has no snapshot_url column; the cover is read from storage instead. " +
        "Run supabase/sql/RUN_THEME_MARKETPLACE.sql to record it.",
    )
    return NextResponse.json({ url, updated_at: updatedAt, stored: false })
  }

  return NextResponse.json({ url, updated_at: updatedAt, stored: true })
}

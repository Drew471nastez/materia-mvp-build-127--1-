import { randomUUID } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { UUID_RE } from "@/lib/admin/platform-metrics"
import { inspectHead } from "@/lib/security/uploads/inspect"
import { LISTING_IMAGE_EXTENSIONS, LISTING_IMAGE_KINDS, LISTING_IMAGE_MAX_BYTES, type ListingImageKind } from "@/lib/themes/marketplace-admin"
import { LISTINGS_TABLE, LISTING_COLUMNS, LISTING_COLUMNS_FULL, MEDIA_BUCKET, isMissingColumn, revalidateMarketplace, rowToListing, type ListingRow } from "@/lib/themes/marketplace-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

/**
 * POST /api/admin/themes/image   multipart: listingId, kind (cover | phone | screenshot | avatar), file
 *
 * A listing's cover, its cover at a phone's width (RUN_THEME_RELEASES.sql),
 * one more screenshot, or its author's photo. The bytes
 * must be a picture (the central check, context public_image), up to 4 MB,
 * as JPEG, PNG, WebP, AVIF or GIF; the name it is stored under is chosen
 * here. Stored in the public bucket website pictures use, under the
 * listing's own folder, and written to the listing at once.
 */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  if (Number(req.headers.get("content-length") ?? 0) > LISTING_IMAGE_MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "Pictures can be up to 4 MB." }, { status: 413, headers: NO_STORE })
  }
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "No picture arrived." }, { status: 400, headers: NO_STORE })
  }
  const listingId = String(form.get("listingId") ?? "")
  const kind = String(form.get("kind") ?? "") as ListingImageKind
  const file = form.get("file")
  if (!UUID_RE.test(listingId)) return NextResponse.json({ error: "Save the theme first, then add pictures." }, { status: 400, headers: NO_STORE })
  if (!LISTING_IMAGE_KINDS.includes(kind)) return NextResponse.json({ error: "Unknown picture." }, { status: 400, headers: NO_STORE })
  if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ error: "No picture arrived." }, { status: 400, headers: NO_STORE })
  if (file.size > LISTING_IMAGE_MAX_BYTES) return NextResponse.json({ error: "Pictures can be up to 4 MB." }, { status: 413, headers: NO_STORE })

  const name = (file as File).name || "picture"
  const ext = (name.split(".").pop() ?? "").toLowerCase()
  const mime = LISTING_IMAGE_EXTENSIONS[ext]
  if (!mime) return NextResponse.json({ error: "Use a JPEG, PNG, WebP, AVIF or GIF." }, { status: 400, headers: NO_STORE })
  const bytes = new Uint8Array(await file.arrayBuffer())
  const verdict = inspectHead({ fileName: name, size: bytes.byteLength, head: bytes.subarray(0, 8192), context: "public_image" })
  if (!verdict.ok) return NextResponse.json({ error: "That file is not a picture." }, { status: 400, headers: NO_STORE })

  const admin = createAdminClient()
  const { data: current } = await admin.from(LISTINGS_TABLE).select("id, screenshots").eq("id", listingId).maybeSingle()
  if (!current) return NextResponse.json({ error: "No theme has this id." }, { status: 404, headers: NO_STORE })

  /* A phone cover's name ends in -phone, which the library's preview reads as the phone picture. */
  const path = kind === "phone" ? `theme-marketplace/${listingId}/${randomUUID()}-phone.${ext}` : `theme-marketplace/${listingId}/${kind}-${randomUUID()}.${ext}`
  const { error: upErr } = await admin.storage.from(MEDIA_BUCKET).upload(path, Buffer.from(bytes), { contentType: mime, cacheControl: "31536000", upsert: false })
  if (upErr) return adminFailure("theme picture upload", upErr, "The picture did not upload. Try again.")
  const url = admin.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl

  const shots = ((current as { screenshots: string[] | null }).screenshots ?? []).slice(0, 11)
  const patch: Record<string, unknown> =
    kind === "cover" ? { cover_url: url } : kind === "phone" ? { phone_cover_url: url } : kind === "avatar" ? { author_avatar_url: url } : { screenshots: [...shots, url] }
  patch.updated_at = new Date().toISOString()
  const write = (columns: string) => admin.from(LISTINGS_TABLE).update(patch).eq("id", listingId).select(columns).maybeSingle()
  let { data: saved, error } = await write(LISTING_COLUMNS_FULL)
  if (isMissingColumn(error)) {
    if (kind === "phone") {
      await admin.storage.from(MEDIA_BUCKET).remove([path]).catch(() => undefined)
      return NextResponse.json({ error: "A phone cover needs RUN_THEME_RELEASES.sql to run first." }, { status: 503, headers: NO_STORE })
    }
    ;({ data: saved, error } = await write(LISTING_COLUMNS))
  }
  if (error || !saved) return adminFailure("theme picture save", error ?? "no row", "The picture uploaded but was not saved. Try again.")
  const row = saved as unknown as ListingRow
  revalidateMarketplace([row.slug])
  return NextResponse.json({ ok: true, url, listing: rowToListing(row) }, { headers: NO_STORE })
}

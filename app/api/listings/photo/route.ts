import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * POST /api/listings/photo — upload one listing photo and get its variants back.
 *
 * Takes the file directly rather than handing the client a signed URL: the
 * existing signed-url route requires a creator row to already exist, which a
 * first-time seller doesn't have, and a listing photo is small enough that one
 * hop is simpler than three.
 *
 * ---------------------------------------------------------------------------
 * Two files now, not one
 * ---------------------------------------------------------------------------
 * The browser resizes each photo once before uploading (lib/images/pipeline.ts)
 * and sends both results:
 *
 *   file    the large variant — the photo's OWN aspect ratio, ≤1280×1600
 *   thumb   the 4:5 card crop — ≤800×1000
 *
 * Both land under `<userId>/<imageId>-large.<ext>` and `-thumb.<ext>`, so the
 * two halves of one photo sort together in the bucket and a stray thumbnail can
 * never be mistaken for a listing image.
 *
 * `thumb` is OPTIONAL and its absence is not an error. An old client, a browser
 * that could not decode the file, a canvas that ran out of memory — all of them
 * send only the original, and the response simply has no `thumb`. Cards fall
 * back to the large image (see lib/images/variants.ts) and the backfill fills
 * it in later. Nobody should be unable to list something because their phone
 * could not re-encode a photo.
 *
 * Auth, bucket and storage policies are unchanged.
 */

/** Raised from 12 MB: the client now sends a RE-ENCODED file, so anything near
 *  this limit is an original that failed to process and is being passed
 *  through — exactly the case that must not be rejected. */
const MAX_BYTES = 20 * 1024 * 1024
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"])
export const runtime = "nodejs"

function extFor(file: File): string {
  if (file.type === "image/webp") return "webp"
  if (file.type === "image/png") return "png"
  if (file.type === "image/jpeg") return "jpg"
  const fromName = (file.name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "")
  return fromName && fromName.length <= 5 ? fromName : "jpg"
}

function intOrNull(v: FormDataEntryValue | null): number | null {
  const n = typeof v === "string" ? Number.parseInt(v, 10) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

function focalOrNull(v: FormDataEntryValue | null): { x: number; y: number } | null {
  if (typeof v !== "string") return null
  try {
    const p = JSON.parse(v)
    const c = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5)
    return { x: c(p?.x), y: c(p?.y) }
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: auth } = await supabase.auth.getUser()
    const userId = auth?.user?.id
    if (!userId) return NextResponse.json({ error: "auth_required" }, { status: 401 })

    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 400 })
    if (file.type && !ALLOWED.has(file.type)) return NextResponse.json({ error: "bad_type" }, { status: 400 })

    const thumb = form.get("thumb")
    const hasThumb = thumb instanceof File && thumb.size > 0 && thumb.size <= MAX_BYTES

    const admin = createAdminClient()
    // One id, two files.
    const imageId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const largePath = `${userId}/${imageId}-large.${extFor(file)}`

    const { error: largeErr } = await admin.storage
      .from("listings")
      .upload(largePath, file, { contentType: file.type || "image/jpeg", upsert: false })
    if (largeErr) throw largeErr

    const largeUrl = admin.storage.from("listings").getPublicUrl(largePath).data.publicUrl

    let thumbUrl: string | null = null
    if (hasThumb) {
      const t = thumb as File
      const thumbPath = `${userId}/${imageId}-thumb.${extFor(t)}`
      const { error: thumbErr } = await admin.storage
        .from("listings")
        .upload(thumbPath, t, { contentType: t.type || "image/webp", upsert: false })
      if (thumbErr) {
        // The large file is already stored and usable. A failed thumbnail costs
        // a slightly heavier card, not a failed upload — logged and stepped
        // over rather than thrown.
        console.error("[listings/photo] thumb upload failed:", thumbErr.message)
      } else {
        thumbUrl = admin.storage.from("listings").getPublicUrl(thumbPath).data.publicUrl
      }
    }

    // `url` keeps its old meaning — the image to show — so a client that only
    // knows the previous shape of this response still works unchanged.
    return NextResponse.json({
      url: largeUrl,
      variant: {
        large: largeUrl,
        thumb: thumbUrl,
        width: intOrNull(form.get("width")),
        height: intOrNull(form.get("height")),
        thumbWidth: intOrNull(form.get("thumbWidth")),
        thumbHeight: intOrNull(form.get("thumbHeight")),
        focal: focalOrNull(form.get("focal")),
      },
    })
  } catch (e: any) {
    console.error("[listings/photo] upload failed:", e?.message || e)
    return NextResponse.json({ error: "failed", message: e?.message || String(e) }, { status: 500 })
  }
}

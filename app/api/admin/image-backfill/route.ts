import { createHash, timingSafeEqual } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { MAX_SOURCE_BYTES, reprocessImage } from "@/lib/images/reprocess"
import { clampFocal, CENTER } from "@/lib/images/geometry"

/**
 * ===========================================================================
 *  REPROCESS STORED LISTING PHOTOGRAPHS
 * ===========================================================================
 *   POST /api/admin/image-backfill
 *   header x-storelib-admin-key: <STORELIB_ADMIN_KEY>
 *
 *   { "mode": "count" }                          ← default. Writes NOTHING.
 *   { "mode": "run", "limit": 20 }               ← one batch, from the start
 *   { "mode": "run", "after": "<uuid>" }         ← the next batch
 *   { "mode": "run", "productId": "<uuid>" }     ← one listing, for checking
 *
 * Every response carries `nextAfter`. Feed it back as `after` until it comes
 * back null and the walk is finished.
 *
 * ---------------------------------------------------------------------------
 * What it is fixing
 * ---------------------------------------------------------------------------
 * Two things, and the second is why this became urgent.
 *
 * Listings uploaded before lib/images/pipeline.ts have no variants, so every
 * card downloads a full-resolution phone photograph and throws most of it away.
 *
 * And listings whose stored file has BARS PAINTED INTO IT render those bars
 * forever. One measured example: a 1280×720 file with 120 rows of uniform grey
 * above the artwork and 120 below. Drawn `object-cover` in the app's 3:4 frame
 * that is 268px of grey, 1071px of artwork, 268px of grey — which is exactly
 * what the screenshot showed. `object-fit` was correct the whole time; the grey
 * is in the picture. Nothing at render time can undo it, and the upload-time
 * trim only ever sees new files. This is the only way to reach the old ones.
 *
 * ---------------------------------------------------------------------------
 * Why it is shaped like this
 * ---------------------------------------------------------------------------
 * NOTHING IS DELETED AND NOTHING IS OVERWRITTEN. New objects are written under
 * a `-v2` suffix and only `products.image_variants` is updated;
 * `thumbnail_url` and `gallery_urls` keep pointing at the untouched originals.
 * So a half-finished run leaves every listing rendering — either from its new
 * variants or from the originals it always used — and re-running is free.
 *
 * RESUMABLE BY CURSOR, NOT BY A FLAG COLUMN. Ordering by id and passing the
 * last one back means no migration, no lock, and no state that can disagree
 * with reality if a run is killed. The alternative — a `backfilled_at` column —
 * has to be written in the same transaction as the storage upload to be
 * truthful, and storage is not in the transaction.
 *
 * ONE LISTING IS ALL-OR-NOTHING. A row is updated only after every one of its
 * photographs has been written, so a card and a detail page can never disagree
 * about which pair they are reading.
 *
 * A batch is small and the route is capped well under the platform's limit,
 * because decoding photographs is the slowest thing this project does and a
 * timeout mid-listing must not be able to leave a row half-written.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const BUCKET = "product-images"
/** Listings per call. Each may hold up to a dozen photographs. */
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 40
/** Photographs decoded at once. sharp releases the thread, but memory is the
 *  real limit in a serverless function and each one holds a raw buffer. */
const CONCURRENCY = 3

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Digests, so neither the key's contents nor its length leaks through timing. */
function keyMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest()
  const b = createHash("sha256").update(expected).digest()
  return timingSafeEqual(a, b)
}

type Row = {
  id: string
  thumbnail_url: string | null
  gallery_urls: string[] | null
  image_variants: unknown
}

/**
 * The storage object path inside BUCKET for a public URL, or null when the URL
 * points somewhere this cannot read.
 *
 * Listings predate several upload paths and some carry absolute URLs to other
 * hosts entirely (seeded demo data, an old CDN). Those are skipped rather than
 * guessed at — a backfill that invents object paths writes files nothing reads.
 */
export function objectPathFor(url: string | null | undefined, bucket = BUCKET): string | null {
  if (!url) return null
  const marker = `/storage/v1/object/public/${bucket}/`
  const at = url.indexOf(marker)
  if (at === -1) return null
  const path = url.slice(at + marker.length).split("?")[0]
  if (!path) return null
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

/** `a/b/photo.jpg` → `a/b/photo-large-v2.webp`. Beside the original, never over it. */
export function variantPathFor(objectPath: string, kind: "large" | "thumb"): string {
  const withoutExt = objectPath.replace(/\.[^./]+$/, "")
  return `${withoutExt}-${kind}-v2.webp`
}

/** Everything already on the row, so a re-run does not lose a focal point the
 *  seller chose in the sell form. */
function focalAt(variants: unknown, i: number) {
  if (!Array.isArray(variants)) return CENTER
  const v = variants[i] as { focal?: unknown } | undefined
  return clampFocal((v?.focal ?? null) as never)
}

export async function POST(req: NextRequest) {
  const expected = process.env.STORELIB_ADMIN_KEY
  // An endpoint that does not exist is better than one advertising itself as
  // merely locked. Same rule as /api/admin/push-test.
  if (!expected) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const provided = req.headers.get("x-storelib-admin-key") ?? ""
  if (!provided || !keyMatches(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    /* an empty body is the count mode */
  }

  const mode = typeof body.mode === "string" ? body.mode : "count"
  const after = typeof body.after === "string" && UUID_RE.test(body.after) ? body.after : null
  const productId = typeof body.productId === "string" && UUID_RE.test(body.productId) ? body.productId : null
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(body.limit) || DEFAULT_LIMIT))

  let supabase
  try {
    supabase = createAdminClient()
  } catch (e: unknown) {
    return NextResponse.json(
      { error: "Storage/database credentials unavailable", detail: (e as Error)?.message },
      { status: 503 },
    )
  }

  // ── count: how much work is there, without doing any of it ────────────────
  if (mode === "count") {
    const { count, error } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const { count: pending } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("image_variants", "[]")
    return NextResponse.json({
      ok: true,
      mode,
      listings: count ?? 0,
      withoutVariants: pending ?? 0,
      note: "Nothing was written. POST {\"mode\":\"run\"} to begin, then feed nextAfter back as after.",
    })
  }

  if (mode !== "run") return NextResponse.json({ error: "Unknown mode" }, { status: 400 })

  // ── run: one batch ────────────────────────────────────────────────────────
  let query = supabase
    .from("products")
    .select("id, thumbnail_url, gallery_urls, image_variants")
    .order("id", { ascending: true })
    .limit(limit)
  if (productId) query = query.eq("id", productId)
  else if (after) query = query.gt("id", after)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as Row[]
  const results: Array<Record<string, unknown>> = []
  let updated = 0
  let trimmedCount = 0

  for (const row of rows) {
    const urls = [row.thumbnail_url, ...(Array.isArray(row.gallery_urls) ? row.gallery_urls : [])].filter(
      (u): u is string => typeof u === "string" && u.length > 0,
    )
    if (urls.length === 0) {
      results.push({ id: row.id, skipped: "no images" })
      continue
    }

    const variants: Array<Record<string, unknown>> = new Array(urls.length)
    let failed: string | null = null
    let rowTrimmed = 0

    // Bounded concurrency by hand rather than a dependency: a pool of three
    // workers pulling from one index is the whole of what is needed here.
    let next = 0
    const worker = async () => {
      while (next < urls.length && !failed) {
        const i = next++
        const url = urls[i]
        try {
          const path = objectPathFor(url)
          if (!path) {
            // Not ours to rewrite. The listing keeps rendering from the URL it
            // always used; recorded so a run is not silently partial.
            variants[i] = { large: url, thumb: null, foreign: true }
            continue
          }
          const dl = await supabase.storage.from(BUCKET).download(path)
          if (dl.error || !dl.data) throw new Error(dl.error?.message || "download failed")
          const buf = Buffer.from(await dl.data.arrayBuffer())
          if (buf.byteLength > MAX_SOURCE_BYTES) throw new Error("source too large")

          const out = await reprocessImage(buf, focalAt(row.image_variants, i))
          if (out.trimmed) rowTrimmed++

          const largePath = variantPathFor(path, "large")
          const thumbPath = variantPathFor(path, "thumb")
          for (const [p, b] of [
            [largePath, out.large.body],
            [thumbPath, out.thumb.body],
          ] as const) {
            const up = await supabase.storage
              .from(BUCKET)
              .upload(p, b, { contentType: out.contentType, upsert: true, cacheControl: "31536000" })
            if (up.error) throw new Error(up.error.message)
          }

          variants[i] = {
            large: supabase.storage.from(BUCKET).getPublicUrl(largePath).data.publicUrl,
            thumb: supabase.storage.from(BUCKET).getPublicUrl(thumbPath).data.publicUrl,
            width: out.large.width,
            height: out.large.height,
            thumbWidth: out.thumb.width,
            thumbHeight: out.thumb.height,
            focal: out.focal,
          }
        } catch (e: unknown) {
          failed = (e as Error)?.message || "unknown error"
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker))

    if (failed) {
      // ALL OR NOTHING. A row updated with a partial array would leave the card
      // and the detail page reading different pairs, and the files already
      // written are harmless — they are new objects nothing points at yet, and
      // the next run overwrites them.
      results.push({ id: row.id, error: failed, wrote: "nothing" })
      continue
    }

    const { error: upErr } = await supabase
      .from("products")
      .update({ image_variants: variants })
      .eq("id", row.id)
    if (upErr) {
      results.push({ id: row.id, error: upErr.message, wrote: "storage only" })
      continue
    }

    updated++
    trimmedCount += rowTrimmed
    results.push({ id: row.id, images: urls.length, trimmed: rowTrimmed })
  }

  const nextAfter = productId ? null : rows.length === limit ? rows[rows.length - 1]?.id ?? null : null

  return NextResponse.json({
    ok: true,
    mode,
    scanned: rows.length,
    updated,
    imagesTrimmed: trimmedCount,
    nextAfter,
    done: nextAfter === null,
    results,
  })
}

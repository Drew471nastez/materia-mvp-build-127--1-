import { type NextRequest, NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { CENTER } from "@/lib/images/geometry"
import { MAX_SOURCE_BYTES, reprocessImage } from "@/lib/images/reprocess"
import { MAX_PHOTOS } from "@/lib/marketplace/listing-taxonomy"
import { mapItem } from "@/lib/import/mapping"
import { VintedError, loadItemDetail, loadWardrobe, openSession } from "@/lib/import/vinted"

/**
 * POST /api/import/run — create Storelib listings from a scanned profile.
 *
 * ---------------------------------------------------------------------------
 * THE PHOTOGRAPHS GO THROUGH THE SAME PIPELINE AS A REAL UPLOAD
 * ---------------------------------------------------------------------------
 * Not hotlinked. Three reasons, in order of how much they cost:
 *
 *   A hotlinked image is a listing that breaks when the source deletes it —
 *   which is exactly what a seller who has moved here does to their old shop.
 *   The listing would still be for sale with a dead photograph.
 *
 *   Every card view would send a referrer to their CDN, so our traffic shows
 *   up in their logs, and they get to decide whether our marketplace renders.
 *
 *   And their originals are phone-sized, uncropped and unoptimised — an
 *   imported shop would be the slowest part of the feed.
 *
 * So each photo is downloaded once and run through `reprocessImage`, which is
 * the SAME module the backfill uses and shares its geometry with the browser
 * pipeline. An imported listing is byte-for-byte the shape of a typed one:
 * large + 3:4 thumb, letterboxing trimmed, focal point centred, WebP.
 *
 * ---------------------------------------------------------------------------
 * RE-RUNNING IS SAFE, AND THAT IS A DATABASE FACT
 * ---------------------------------------------------------------------------
 * Every row carries `source_platform` + `source_item_id`, unique together
 * (RUN_IMPORT_SOURCE.sql). An item that is already here is UPDATED in place —
 * price, title, size — and its photographs are left alone, because re-encoding
 * eight images to produce identical files is a minute of work and a pile of
 * dead objects in the bucket for no change.
 *
 * The dedupe is a `select` against that unique key on every run. It is not a
 * Set, a module-level cache or anything else that lives in one instance's
 * memory: two concurrent imports of the same profile land on different Vercel
 * instances that share nothing, so an in-memory guard would let both through
 * and the unique index would be the only thing standing between the operator
 * and a doubled shop. Here the index is the backstop, not the plan.
 */

export const runtime = "nodejs"
/** Downloading and re-encoding up to eight photographs for each of several
 *  items. This is the long one. */
export const maxDuration = 300

/** Per request, so one call cannot run for an unbounded time. The page sends
 *  the selection in batches and shows progress between them. */
const MAX_PER_RUN = 12

interface RunResult {
  sourceId: string
  status: "created" | "updated" | "skipped" | "failed"
  listingId?: string
  slug?: string
  reason?: string
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

/**
 * One source photograph, stored the way the app stores photographs.
 *
 * Returns null rather than throwing on anything recoverable: a single photo
 * that 404s should cost that photo, not the listing it belongs to, and
 * certainly not the twelve listings after it in the batch.
 */
async function importPhoto(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  sourceUrl: string,
): Promise<{ large: string; thumb: string; width: number; height: number; thumbWidth: number; thumbHeight: number } | null> {
  try {
    const res = await fetch(sourceUrl, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "image/avif,image/webp,image/*,*/*" },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return null

    const len = Number(res.headers.get("content-length") || 0)
    if (len && len > MAX_SOURCE_BYTES) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length || buf.length > MAX_SOURCE_BYTES) return null

    // CENTER because the source gives us no focal point — there is no crop UI
    // behind an import. The letterbox trim inside reprocessImage is what
    // actually matters here: resale photos are frequently screenshots with
    // bars, and those bars would otherwise be baked into every card.
    const out = await reprocessImage(buf, CENTER)

    const imageId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const largePath = `${userId}/${imageId}-large.webp`
    const thumbPath = `${userId}/${imageId}-thumb.webp`

    const up1 = await admin.storage
      .from("listings")
      .upload(largePath, out.large.body, { contentType: "image/webp", upsert: false })
    if (up1.error) return null

    const up2 = await admin.storage
      .from("listings")
      .upload(thumbPath, out.thumb.body, { contentType: "image/webp", upsert: false })

    const largeUrl = admin.storage.from("listings").getPublicUrl(largePath).data.publicUrl
    const thumbUrl = up2.error ? largeUrl : admin.storage.from("listings").getPublicUrl(thumbPath).data.publicUrl

    return {
      large: largeUrl,
      thumb: thumbUrl,
      width: out.large.width,
      height: out.large.height,
      thumbWidth: out.thumb.width,
      thumbHeight: out.thumb.height,
    }
  } catch (e: any) {
    console.error("[import/run] photo failed:", e?.message || e)
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: auth } = await supabase.auth.getUser()
    const userId = auth?.user?.id
    if (!userId) return NextResponse.json({ error: "auth_required" }, { status: 401 })

    const body = await request.json().catch(() => null)
    const url = typeof body?.url === "string" ? body.url : ""
    const department = typeof body?.department === "string" ? body.department : null
    const wanted: string[] = Array.isArray(body?.sourceIds)
      ? body.sourceIds.filter((s: any) => typeof s === "string").slice(0, MAX_PER_RUN)
      : []
    if (!wanted.length) return NextResponse.json({ error: "nothing_selected" }, { status: 400 })

    const { profile, items } = await loadWardrobe(url)
    const ukNumbering = profile.host.endsWith(".co.uk") || profile.host.endsWith(".ie")

    // Only what was asked for, and in the ORDER THE SOURCE HAD THEM rather
    // than the order the client happened to send — the shop reads the same way
    // on both sites, which is the point of preserving order at all.
    const want = new Set(wanted)
    const chosen = items.filter((it) => want.has(it.id))
    if (!chosen.length) return NextResponse.json({ error: "not_found_on_profile" }, { status: 400 })

    const admin = createAdminClient()

    // The seller's creator row, made on first use — same rule as the sell
    // form, so importing does not require "becoming a seller" first.
    let creatorId: string
    const { data: creator } = await admin.from("creators").select("id").eq("user_id", userId).maybeSingle()
    if (creator?.id) {
      creatorId = creator.id
    } else {
      const { data: made, error: makeErr } = await admin.from("creators").insert({ user_id: userId }).select("id").single()
      if (makeErr) throw makeErr
      creatorId = made.id
    }

    // ONE session for every detail request in this run. Opening one per item
    // is a homepage fetch per listing, which is both slow and the surest way
    // to be rate-limited halfway through.
    let cookie: string | null = null
    try {
      cookie = await openSession(profile.host)
    } catch {
      cookie = null // descriptions will be missing; the import still runs
    }

    const results: RunResult[] = []

    for (const item of chosen) {
      try {
        // Descriptions and catalog data are not on the wardrobe listing — see
        // loadItemDetail. Best effort: a listing without a description is
        // still a listing.
        if (cookie) {
          const detail = await loadItemDetail(profile.host, item.id, cookie)
          if (detail?.description) item.description = detail.description
          if (detail?.catalogId != null) item.catalogId = detail.catalogId
        }

        const mapped = mapItem(item, { ukNumbering, department })

        const { data: existing } = await admin
          .from("products")
          .select("id, slug")
          .eq("source_platform", "vinted")
          .eq("source_item_id", item.id)
          .maybeSingle()

        const common: Record<string, any> = {
          title: mapped.title || null,
          description: mapped.description,
          price_cents: mapped.priceCents,
          category: mapped.category,
          subcategory: mapped.subcategory,
          brand: mapped.brand,
          condition: mapped.condition,
          size: mapped.size,
          source_platform: "vinted",
          source_item_id: item.id,
          source_url: item.url,
          source_imported_at: new Date().toISOString(),
          source_price_amount: mapped.sourcePriceAmount,
          source_price_currency: mapped.sourcePriceCurrency,
        }

        if (existing?.id) {
          // Photographs are NOT re-fetched. They cannot have changed in a way
          // that matters and re-encoding them would orphan the old objects.
          const { error } = await admin.from("products").update(common).eq("id", existing.id)
          if (error) throw error
          results.push({ sourceId: item.id, status: "updated", listingId: existing.id, slug: existing.slug })
          continue
        }

        // Photos first, because a listing with no usable photograph should not
        // be created at all — MIN_PHOTOS exists for a reason and a card with a
        // blank cover is worse than an item that reports why it was skipped.
        const stored: NonNullable<Awaited<ReturnType<typeof importPhoto>>>[] = []
        for (const src of mapped.photos.slice(0, MAX_PHOTOS)) {
          const one = await importPhoto(admin, userId, src)
          if (one) stored.push(one)
        }
        if (!stored.length) {
          results.push({ sourceId: item.id, status: "failed", reason: "no_photos" })
          continue
        }

        const base = slugify(mapped.title) || "articol"
        const row: Record<string, any> = {
          ...common,
          creator_id: creatorId,
          slug: `${base}-${Math.random().toString(36).slice(2, 8)}`,
          thumbnail_url: stored[0].large,
          gallery_urls: stored.slice(1).map((s) => s.large),
          // Positionally aligned with [thumbnail_url, ...gallery_urls] — index
          // 0 is the cover in both, which is the contract the column is under.
          image_variants: stored.map((s) => ({
            large: s.large,
            thumb: s.thumb,
            width: s.width,
            height: s.height,
            thumbWidth: s.thumbWidth,
            thumbHeight: s.thumbHeight,
            focal: { x: 0.5, y: 0.5 },
          })),
          status: "published",
          type: "physical",
        }

        const { data: created, error } = await admin.from("products").insert(row).select("id, slug").single()
        if (error) throw error
        results.push({ sourceId: item.id, status: "created", listingId: created.id, slug: created.slug })
      } catch (e: any) {
        // One bad item does not end the batch. The operator gets a row saying
        // which one and why, and can re-run — which is safe, because the ones
        // that succeeded are now deduped by their source id.
        console.error("[import/run] item failed:", item.id, e?.message || e)
        results.push({ sourceId: item.id, status: "failed", reason: e?.message ? String(e.message).slice(0, 120) : "error" })
      }
    }

    return NextResponse.json({
      results,
      created: results.filter((r) => r.status === "created").length,
      updated: results.filter((r) => r.status === "updated").length,
      failed: results.filter((r) => r.status === "failed").length,
    })
  } catch (e: any) {
    if (e instanceof VintedError) {
      return NextResponse.json({ error: e.code, message: e.message }, { status: 400 })
    }
    console.error("[import/run] failed:", e?.message || e)
    return NextResponse.json({ error: "failed", message: "Importul a eșuat." }, { status: 500 })
  }
}

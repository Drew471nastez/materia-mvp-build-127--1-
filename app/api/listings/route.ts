import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { MIN_PHOTOS, MAX_PHOTOS } from "@/lib/marketplace/listing-taxonomy"

/**
 * POST /api/listings — create a listing, published or draft.
 *
 * Validation lives here, not only in the form: a client can be bypassed, and the
 * rules are what keep the feed from filling with half-listings. Drafts skip the
 * completeness rules on purpose — the whole point of a draft is that it isn't
 * finished — but still can't be blank.
 */

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
 * Whatever the client sent as `image_variants`, made safe to store.
 *
 * It arrives as JSON from a browser, so every field is untrusted and the array
 * may be any length. Trimmed to the number of photos and padded with nulls, so
 * the positional alignment with [thumbnail_url, ...gallery_urls] holds no
 * matter what turned up — that alignment is the whole contract of the column.
 *
 * Only the fields lib/images/variants.ts reads are copied through. An entry
 * with no usable `large` becomes null rather than a half-record that would
 * render a broken image.
 */
function cleanVariants(raw: unknown, count: number): Array<Record<string, any> | null> {
  const list = Array.isArray(raw) ? raw : []
  const out: Array<Record<string, any> | null> = []
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null)
  const unit = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5)
  const url = (v: unknown) => (typeof v === "string" && v.startsWith("http") ? v : null)

  for (let i = 0; i < count; i++) {
    const v: any = list[i]
    const large = url(v?.large)
    if (!v || typeof v !== "object" || !large) {
      out.push(null)
      continue
    }
    out.push({
      large,
      thumb: url(v.thumb),
      width: num(v.width),
      height: num(v.height),
      thumbWidth: num(v.thumbWidth),
      thumbHeight: num(v.thumbHeight),
      focal: v.focal ? { x: unit(v.focal.x), y: unit(v.focal.y) } : null,
    })
  }
  return out
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: auth } = await supabase.auth.getUser()
    const userId = auth?.user?.id
    if (!userId) return NextResponse.json({ error: "auth_required" }, { status: 401 })

    const body = await request.json()
    const draft = body?.draft === true

    const photos: string[] = Array.isArray(body?.photos) ? body.photos.filter((u: any) => typeof u === "string" && u) : []
    const title = typeof body?.title === "string" ? body.title.trim() : ""
    const description = typeof body?.description === "string" ? body.description.trim() : ""
    const priceCents = Number.isFinite(body?.price_cents) ? Math.round(body.price_cents) : NaN
    const compareCents = Number.isFinite(body?.compare_at_cents) ? Math.round(body.compare_at_cents) : null

    // A draft only has to be something. A published listing has to be complete.
    const problems: string[] = []
    if (photos.length < 1) problems.push("photos")
    if (!title) problems.push("title")

    if (!draft) {
      if (photos.length < MIN_PHOTOS) problems.push("photos_min")
      if (description.length < 10) problems.push("description")
      if (!Number.isFinite(priceCents) || priceCents < 0) problems.push("price")
      if (!body?.category) problems.push("category")
      if (!body?.subcategory) problems.push("subcategory")
      if (!body?.brand) problems.push("brand")
      if (!body?.condition) problems.push("condition")
      if (!body?.colour) problems.push("colour")
      if (!body?.size) problems.push("size")
      // compare_at is optional, but if given it has to actually be a higher
      // "was" price or the discount badge is a lie.
      if (compareCents !== null && Number.isFinite(priceCents) && compareCents <= priceCents) {
        problems.push("compare_at_too_low")
      }
    }
    if (problems.length) return NextResponse.json({ error: "invalid", fields: problems }, { status: 400 })

    const admin = createAdminClient()

    // Listings hang off a creator row; make one on first listing so a seller
    // never has to "become a seller" as a separate step before selling.
    let creatorId: string | null = null
    const { data: creator } = await admin.from("creators").select("id").eq("user_id", userId).maybeSingle()
    if (creator?.id) {
      creatorId = creator.id
    } else {
      const { data: made, error: makeErr } = await admin
        .from("creators")
        .insert({ user_id: userId })
        .select("id")
        .single()
      if (makeErr) throw makeErr
      creatorId = made.id
    }

    const base = slugify(title) || "articol"
    const slug = `${base}-${Math.random().toString(36).slice(2, 8)}`

    const row: Record<string, any> = {
      creator_id: creatorId,
      title,
      slug,
      description,
      price_cents: Number.isFinite(priceCents) ? priceCents : 0,
      compare_at_cents: compareCents,
      thumbnail_url: photos[0] ?? null,
      gallery_urls: photos.slice(1, MAX_PHOTOS),
      // The optimised pair per photo, POSITIONALLY ALIGNED with
      // [thumbnail_url, ...gallery_urls] — index 0 is the cover in both. Nulls
      // are preserved rather than filtered, because dropping one would shift
      // every variant after it onto the wrong photo, which is worse than the
      // missing thumbnail it was trying to tidy away.
      //
      // Additive: thumbnail_url keeps its exact meaning and stays the fallback,
      // so a listing renders identically with or without this column.
      image_variants: cleanVariants(body?.image_variants, photos.length),
      status: draft ? "draft" : "published",
      type: "physical",
      category: body?.category ?? null,
      subcategory: body?.subcategory ?? null,
      brand: body?.brand ?? null,
      condition: body?.condition ?? null,
      colour: body?.colour ?? null,
      size: body?.size ?? null,
      era: body?.era ?? null,
      source_tags: Array.isArray(body?.source_tags) ? body.source_tags.slice(0, 2) : [],
      style_tags: Array.isArray(body?.style_tags) ? body.style_tags.slice(0, 3) : [],
      draft_saved_at: draft ? new Date().toISOString() : null,
    }

    // The resale attribute columns only exist after
    // 20260801_listing_attributes.sql. Without that migration this insert fails
    // outright on an unknown column, and every publish came back "could not be
    // published" — a schema error surfacing as a validation-shaped message. Retry
    // with just the columns that have always existed, so a listing can still be
    // created; the extra attributes fill in once the migration is applied.
    const OPTIONAL = ["subcategory", "colour", "era", "source_tags", "style_tags", "draft_saved_at", "image_variants"]

    let created: any = null
    const first = await admin.from("products").insert(row).select("id, slug").single()
    if (first.error) {
      console.error("[listings] full insert failed, retrying without new columns:", first.error.message)
      const base: Record<string, any> = { ...row }
      for (const k of OPTIONAL) delete base[k]
      const retry = await admin.from("products").insert(base).select("id, slug").single()
      if (retry.error) throw retry.error
      created = retry.data
    } else {
      created = first.data
    }

    return NextResponse.json({ id: created.id, slug: created.slug, draft })
  } catch (e: any) {
    console.error("[listings] create failed:", e?.message || e)
    return NextResponse.json({ error: "failed", message: e?.message || String(e) }, { status: 500 })
  }
}

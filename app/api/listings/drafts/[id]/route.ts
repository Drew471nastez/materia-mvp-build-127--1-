import { type NextRequest, NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { MAX_PHOTOS } from "@/lib/marketplace/listing-taxonomy"
import { publishProblems } from "@/lib/marketplace/listing-completeness"

/**
 * ===========================================================================
 *  ONE DRAFT: OPEN IT, FINISH IT, THROW IT AWAY
 * ===========================================================================
 *
 * Saving a draft already worked and the list already existed — but every row on
 * it was inert. You could see that a half-written listing was there and do
 * nothing whatsoever with it: not open it, not finish it, not delete it. A
 * draft you can only look at is worse than no draft, because it is a promise
 * the interface does not keep.
 *
 *   GET     the whole row, so the form can be filled in exactly as it was left
 *   PATCH   save it again, or publish it — the SAME row, never a second one
 *   DELETE  throw it away
 *
 * ---------------------------------------------------------------------------
 * EVERY ONE OF THESE IS OWNERSHIP-CHECKED, AND NOT BY THE CALLER
 * ---------------------------------------------------------------------------
 * The id in the URL is a uuid somebody could guess at, or lift from a shared
 * screenshot. So the row is fetched by id AND by the caller's own creator id in
 * the same query — not fetched and then compared, which is the version that
 * leaks the row's existence through timing and through error messages. A draft
 * that is not yours is indistinguishable from one that does not exist.
 *
 * ---------------------------------------------------------------------------
 * PUBLISHING FROM HERE UPDATES, IT DOES NOT CREATE
 * ---------------------------------------------------------------------------
 * The obvious implementation — POST /api/listings again and delete the draft —
 * is two writes that can half-happen, and it mints a new slug for a listing
 * somebody may already have linked to. This changes `status` on the row that
 * was already there, so finishing a draft cannot leave a duplicate behind and
 * cannot fail halfway.
 */

/** Everything the sell form needs to render itself exactly as it was left. */
const FULL_SELECT =
  "id, title, slug, description, price_cents, compare_at_cents, thumbnail_url, gallery_urls, " +
  "image_variants, category, subcategory, brand, condition, colour, size, era, source_tags, " +
  "style_tags, status, created_at"

/** The caller's creator row, or null. Every handler below starts here. */
async function callerCreatorId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth?.user?.id
  if (!userId) return null
  const admin = createAdminClient()
  const { data } = await admin.from("creators").select("id").eq("user_id", userId).maybeSingle()
  return data?.id ?? null
}

const NOT_FOUND = NextResponse.json({ error: "not_found" }, { status: 404 })

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const creatorId = await callerCreatorId()
  if (!creatorId) return NOT_FOUND

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("products")
    .select(FULL_SELECT)
    .eq("id", id)
    .eq("creator_id", creatorId)
    .eq("status", "draft")
    .maybeSingle()

  if (error || !data) return NOT_FOUND
  return NextResponse.json({ draft: data })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const creatorId = await callerCreatorId()
  if (!creatorId) return NOT_FOUND

  const admin = createAdminClient()
  // Scoped to draft as well as to owner: this endpoint must never be a way to
  // delete something that is live and may already have been bought.
  const { data, error } = await admin
    .from("products")
    .delete()
    .eq("id", id)
    .eq("creator_id", creatorId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle()

  if (error || !data) return NOT_FOUND
  return NextResponse.json({ ok: true })
}

/**
 * Save it again, or publish it.
 *
 * `publish: true` applies the same completeness rules POST does — a draft is
 * allowed to be half-written, a listing on the feed is not, and the rules have
 * to live on the server because a client can be bypassed.
 */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const creatorId = await callerCreatorId()
  if (!creatorId) return NOT_FOUND

  let body: Record<string, any>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 })
  }

  const publish = body?.publish === true
  const photos: string[] = Array.isArray(body?.photos) ? body.photos.filter(Boolean).slice(0, MAX_PHOTOS) : []
  const title = String(body?.title ?? "").trim()
  const description = String(body?.description ?? "").trim()
  const priceCents = Number(body?.price_cents)

  if (publish) {
    // The SAME checklist POST applies — this route's own copy was shorter, so
    // publishing through a draft reached the feed without a brand, a size, a
    // colour or a description, which POST refuses to create. It also rejected a
    // price of 0, which POST allows, and reported it as a Romanian label the
    // client could not print a message for.
    const problems = publishProblems({
      photos,
      title,
      description,
      priceCents,
      category: body?.category,
      subcategory: body?.subcategory,
      brand: body?.brand,
      condition: body?.condition,
      colour: body?.colour,
      size: body?.size,
    })
    if (problems.length) {
      return NextResponse.json({ error: "incomplete", fields: problems }, { status: 400 })
    }
  }

  // Only the columns the sell form owns. `slug` is deliberately absent: it was
  // minted when the draft was created and somebody may already have the link,
  // and re-slugging on every save would break it every time the title changed.
  const patch: Record<string, any> = {
    title: title || null,
    description: description || null,
    price_cents: Number.isFinite(priceCents) && priceCents > 0 ? Math.round(priceCents) : 0,
    compare_at_cents:
      Number.isFinite(Number(body?.compare_at_cents)) && Number(body.compare_at_cents) > 0
        ? Math.round(Number(body.compare_at_cents))
        : null,
    thumbnail_url: photos[0] ?? null,
    gallery_urls: photos.slice(1),
    category: body?.category ?? null,
    subcategory: body?.subcategory ?? null,
    brand: body?.brand ?? null,
    condition: body?.condition ?? null,
    colour: body?.colour ?? null,
    size: body?.size ?? null,
    era: body?.era ?? null,
    source_tags: Array.isArray(body?.source_tags) ? body.source_tags.slice(0, 2) : [],
    style_tags: Array.isArray(body?.style_tags) ? body.style_tags.slice(0, 3) : [],
    status: publish ? "published" : "draft",
  }
  if (Array.isArray(body?.image_variants)) patch.image_variants = body.image_variants.slice(0, MAX_PHOTOS)

  const admin = createAdminClient()
  // Owner AND still-a-draft, in the same statement. Publishing something that
  // is already live would be a way to un-sell a sold item.
  const { data, error } = await admin
    .from("products")
    .update(patch)
    .eq("id", id)
    .eq("creator_id", creatorId)
    .eq("status", "draft")
    .select("id, slug")
    .maybeSingle()

  if (error) {
    // The resale attribute columns only exist after
    // 20260801_listing_attributes.sql, the same way POST handles it. Retry with
    // the columns that have always existed rather than failing the save.
    console.error("[listings/drafts PATCH] full update failed, retrying:", error.message)
    const OPTIONAL = ["subcategory", "colour", "era", "source_tags", "style_tags", "image_variants"]
    const base = { ...patch }
    for (const k of OPTIONAL) delete base[k]
    const retry = await admin
      .from("products")
      .update(base)
      .eq("id", id)
      .eq("creator_id", creatorId)
      .eq("status", "draft")
      .select("id, slug")
      .maybeSingle()
    if (retry.error || !retry.data) return NOT_FOUND
    return NextResponse.json({ id: retry.data.id, slug: retry.data.slug, published: publish })
  }

  if (!data) return NOT_FOUND
  return NextResponse.json({ id: data.id, slug: data.slug, published: publish })
}

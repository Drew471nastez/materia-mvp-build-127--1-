import { type NextRequest, NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { MAX_PHOTOS, MIN_PHOTOS } from "@/lib/marketplace/listing-taxonomy"

/**
 * ===========================================================================
 *  A LISTING YOU ALREADY PUBLISHED: EDIT IT, PUT IT AWAY, THROW IT AWAY
 * ===========================================================================
 *
 * There was no way to do any of the three. Once something was live the only
 * controls on it were Buy and Make an offer — on your OWN listing, which is the
 * one page where neither means anything — and a typo in a title was permanent.
 *
 *   GET     the whole row, so the sell form can fill itself in from it
 *   PATCH   save changes, or archive it, or put an archived one back
 *   DELETE  remove it, when nobody has bought it
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT app/api/listings/drafts/[id]
 * ---------------------------------------------------------------------------
 * That route is scoped `.eq("status", "draft")` in every handler, deliberately:
 * it must never be a way to delete something live that somebody has already
 * paid for, or to re-publish something that has been sold. Widening it would
 * remove exactly the guard it exists for. This is the other half, with its own
 * rules for the states that one refuses to touch.
 *
 * ---------------------------------------------------------------------------
 * OWNERSHIP IS PART OF THE QUERY
 * ---------------------------------------------------------------------------
 * The id in the URL is a uuid anybody can read off a listing page. So the row
 * is fetched by id AND by the caller's own creator id in the same statement —
 * not fetched and then compared, which is the version that leaks a row's
 * existence through timing and through which error comes back. Somebody else's
 * listing is indistinguishable from one that does not exist.
 *
 * ---------------------------------------------------------------------------
 * ARCHIVE IS NOT DELETE, AND SOLD IS NEITHER
 * ---------------------------------------------------------------------------
 * A listing somebody has bought is a row in their order history and a link in
 * their receipt. Deleting it breaks both, so DELETE refuses when an order
 * exists and says why — archiving is offered instead, which takes it off the
 * feed and leaves every reference to it intact.
 *
 * `sold` is a terminal state and is never written or cleared here. Republishing
 * a sold item would put one physical object back on the market twice.
 */

/** Everything the sell form needs to render itself exactly as it was left. */
const FULL_SELECT =
  "id, title, slug, description, price_cents, compare_at_cents, thumbnail_url, gallery_urls, " +
  "image_variants, category, subcategory, brand, condition, colour, size, era, source_tags, " +
  "style_tags, status, created_at"

/** The states this route is allowed to act on. `sold` is not one of them. */
const EDITABLE = ["published", "draft", "archived"]

async function callerCreatorId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth?.user?.id
  if (!userId) return null
  const admin = createAdminClient()
  const { data } = await admin.from("creators").select("id").eq("user_id", userId).maybeSingle()
  return data?.id ?? null
}

const NOT_FOUND = () => NextResponse.json({ error: "not_found" }, { status: 404 })

/** Has anybody actually bought this? Fails CLOSED — if the check itself errors
 *  we treat the listing as sold rather than risk deleting a paid-for row. */
async function hasOrder(admin: ReturnType<typeof createAdminClient>, productId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("orders")
    .select("id")
    .eq("product_id", productId)
    .in("status", ["completed", "paid", "succeeded"])
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error("[listings/[id]] order check failed, refusing to delete:", error.message)
    return true
  }
  return !!data
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const creatorId = await callerCreatorId()
  if (!creatorId) return NOT_FOUND()

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("products")
    .select(FULL_SELECT)
    .eq("id", id)
    .eq("creator_id", creatorId)
    .maybeSingle()

  if (error || !data) return NOT_FOUND()
  return NextResponse.json({ listing: data })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const creatorId = await callerCreatorId()
  if (!creatorId) return NOT_FOUND()

  const admin = createAdminClient()
  const { data: row } = await admin
    .from("products")
    .select("id, status")
    .eq("id", id)
    .eq("creator_id", creatorId)
    .maybeSingle()
  if (!row) return NOT_FOUND()

  if (row.status === "sold" || (await hasOrder(admin, id))) {
    // Somebody's order history points at this row. Archiving does everything
    // deleting was going to do — it comes off the feed — without breaking a
    // receipt.
    return NextResponse.json(
      { error: "sold", message: "Anunțul a fost cumpărat și nu poate fi șters. Îl poți arhiva." },
      { status: 409 },
    )
  }

  const { error } = await admin.from("products").delete().eq("id", id).eq("creator_id", creatorId)
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const creatorId = await callerCreatorId()
  if (!creatorId) return NOT_FOUND()

  let body: Record<string, any>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: row } = await admin
    .from("products")
    .select("id, slug, status")
    .eq("id", id)
    .eq("creator_id", creatorId)
    .maybeSingle()
  if (!row) return NOT_FOUND()
  if (!EDITABLE.includes(row.status)) {
    return NextResponse.json(
      { error: "sold", message: "Anunțul a fost cumpărat și nu mai poate fi modificat." },
      { status: 409 },
    )
  }

  // ---- status-only actions -------------------------------------------------
  if (body?.action === "archive" || body?.action === "publish") {
    const next = body.action === "archive" ? "archived" : "published"
    const { error } = await admin
      .from("products")
      .update({ status: next })
      .eq("id", id)
      .eq("creator_id", creatorId)
      .in("status", EDITABLE)
    if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 })
    return NextResponse.json({ ok: true, status: next })
  }

  // ---- a full edit ---------------------------------------------------------
  const photos: string[] = Array.isArray(body?.photos) ? body.photos.filter(Boolean).slice(0, MAX_PHOTOS) : []
  const title = String(body?.title ?? "").trim()
  const description = String(body?.description ?? "").trim()
  const priceCents = Number(body?.price_cents)

  // A listing that is live has to STAY complete. The rules are the same ones
  // POST /api/listings applies, and they live on the server because a client
  // can be bypassed.
  if (row.status === "published") {
    const missing: string[] = []
    if (photos.length < MIN_PHOTOS) missing.push(`cel puțin ${MIN_PHOTOS} fotografii`)
    if (title.length < 3) missing.push("titlu")
    if (!body?.category) missing.push("categorie")
    if (!body?.condition) missing.push("stare")
    if (!Number.isFinite(priceCents) || priceCents <= 0) missing.push("preț")
    if (missing.length) return NextResponse.json({ error: "incomplete", fields: missing }, { status: 400 })
  }

  // `slug` is deliberately absent: it was minted when the listing was created,
  // it is in every link anybody has shared, and re-slugging on a title edit
  // would break all of them.
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
  }
  if (Array.isArray(body?.image_variants)) patch.image_variants = body.image_variants.slice(0, MAX_PHOTOS)

  const { data, error } = await admin
    .from("products")
    .update(patch)
    .eq("id", id)
    .eq("creator_id", creatorId)
    .in("status", EDITABLE)
    .select("id, slug")
    .maybeSingle()

  if (error) {
    // The resale attribute columns only exist after 20260801_listing_attributes,
    // the same way POST and the drafts route handle it. Retry with the columns
    // that have always existed rather than failing the save.
    console.error("[listings/[id] PATCH] full update failed, retrying:", error.message)
    const OPTIONAL = ["subcategory", "colour", "era", "source_tags", "style_tags", "image_variants"]
    const base = { ...patch }
    for (const k of OPTIONAL) delete base[k]
    const retry = await admin
      .from("products")
      .update(base)
      .eq("id", id)
      .eq("creator_id", creatorId)
      .in("status", EDITABLE)
      .select("id, slug")
      .maybeSingle()
    if (retry.error || !retry.data) return NOT_FOUND()
    return NextResponse.json({ id: retry.data.id, slug: retry.data.slug })
  }

  if (!data) return NOT_FOUND()
  return NextResponse.json({ id: data.id, slug: data.slug })
}

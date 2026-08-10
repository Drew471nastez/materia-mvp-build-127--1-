import { type NextRequest, NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { MAX_PHOTOS } from "@/lib/marketplace/listing-taxonomy"
import { publishProblems } from "@/lib/marketplace/listing-completeness"
import { EDITABLE_STATUSES } from "@/lib/marketplace/listing-status"

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

/** The states this route is allowed to act on. `sold` is not one of them —
 *  see lib/marketplace/listing-status.ts. */
const EDITABLE = EDITABLE_STATUSES as string[]

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

/**
 * Has money ever moved for this listing?
 *
 * The list is of statuses that are SAFE TO ERASE, not of statuses worth
 * keeping — because orders.product_id is `ON DELETE CASCADE` (see
 * scripts/004_create_orders_entitlements.sql), so deleting the listing deletes
 * the order row with it. A refunded or disputed order is precisely the kind
 * nobody can afford to lose: it is the buyer's receipt, the refund record and
 * the seller's revenue history, and the old allowlist of completed/paid/
 * succeeded let all three be destroyed by one tap on Șterge.
 *
 * Fails CLOSED: if the check itself errors we treat the listing as sold rather
 * than risk deleting a paid-for row.
 */
const DELETABLE_ORDER_STATES = ["pending", "failed", "cancelled", "canceled", "abandoned"]

async function hasOrder(admin: ReturnType<typeof createAdminClient>, productId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("orders")
    .select("id")
    .eq("product_id", productId)
    .not("status", "in", `(${DELETABLE_ORDER_STATES.join(",")})`)
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
    // Somebody's order history points at this row, and orders.product_id
    // cascades — deleting the listing would take the receipt with it.
    //
    // The two branches get DIFFERENT copy, because only one of them can act on
    // the advice. A listing that is still published with an order against it
    // can be archived. One whose status is already `sold` cannot: `sold` is
    // outside EDITABLE, so telling its owner to archive it was pointing at a
    // control the server refuses.
    return NextResponse.json(
      {
        error: "sold",
        message:
          row.status === "sold"
            ? "Anunțul a fost vândut. Rămâne în istoricul tău și nu poate fi șters."
            : "Anunțul a fost cumpărat și nu poate fi șters. Îl poți arhiva.",
      },
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

  /**
   * ---- status-only actions -------------------------------------------------
   *
   * Four moves between the states an owner controls, and one rule underneath
   * all of them: a listing that has actually been BOUGHT does not move again.
   * `sold` is reachable by hand — plenty of things are sold face to face, and a
   * marketplace that cannot be told so fills up with listings nobody can buy —
   * but coming back FROM sold is only allowed while no order exists, because
   * otherwise it re-lists something a buyer has already paid for.
   *
   * A draft is deliberately excluded from all of them: it has never been on the
   * feed, so there is nothing to reserve, archive or sell. Its only moves are
   * "finish it" and "throw it away".
   */
  const ACTION_TO_STATUS: Record<string, string> = {
    archive: "archived",
    publish: "published",
    reserve: "reserved",
    unreserve: "published",
    sold: "sold",
  }
  // hasOwnProperty, not a bare index: "__proto__", "toString" and "constructor"
  // all return a truthy INHERITED value from an object literal, so a request
  // naming one of them was handled as a status change and would have written a
  // function into products.status.
  const action = typeof body?.action === "string" ? body.action : null
  const known = action !== null && Object.prototype.hasOwnProperty.call(ACTION_TO_STATUS, action)
  if (action !== null && !known) {
    return NextResponse.json({ error: "bad_request", message: "Acțiune necunoscută." }, { status: 400 })
  }
  const next = known ? ACTION_TO_STATUS[action] : undefined
  if (next) {
    if (row.status === "draft") {
      return NextResponse.json(
        { error: "draft", message: "Ciorna nu este publicată încă." },
        { status: 409 },
      )
    }
    if (next === "published") {
      if (await hasOrder(admin, id)) {
        return NextResponse.json(
          { error: "sold", message: "Anunțul a fost cumpărat și nu poate fi repus la vânzare." },
          { status: 409 },
        )
      }
      /**
       * The row itself is checked, not the request.
       *
       * `publish` and `unreserve` carry no fields, so nothing in the body could
       * be validated even in principle — and they are the two ways onto the
       * feed that do not go through an edit. Without this, a listing that was
       * archived while incomplete (or archived long before a field became
       * required) goes live unchecked.
       */
      const { data: full } = await admin
        .from("products")
        .select(FULL_SELECT)
        .eq("id", id)
        .eq("creator_id", creatorId)
        .maybeSingle()
      const stored: any = full
      if (stored) {
        const storedPhotos = [stored.thumbnail_url, ...(Array.isArray(stored.gallery_urls) ? stored.gallery_urls : [])]
          .filter((u: unknown): u is string => typeof u === "string" && !!u)
        const problems = publishProblems({
          photos: storedPhotos,
          title: String(stored.title ?? ""),
          description: String(stored.description ?? ""),
          priceCents: Number(stored.price_cents),
          compareCents: stored.compare_at_cents ?? null,
          category: stored.category,
          subcategory: stored.subcategory,
          brand: stored.brand,
          condition: stored.condition,
          colour: stored.colour,
          size: stored.size,
        })
        if (problems.length) {
          return NextResponse.json({ error: "incomplete", fields: problems }, { status: 400 })
        }
      }
    }
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

  /**
   * A listing that is live has to STAY complete — and so does one that is about
   * to be.
   *
   * This ran for `published` and `reserved` only, which left `archived` as a
   * hole straight through the validation: an archived row could be blanked by
   * an unvalidated edit and then pushed onto the feed by the `publish` action,
   * which performs no checks of its own. Anything that is not a draft is held
   * to the same standard, because anything that is not a draft can be on the
   * feed one request later.
   */
  if (row.status !== "draft") {
    const problems = publishProblems({
      photos,
      title,
      description,
      priceCents,
      compareCents:
        Number.isFinite(Number(body?.compare_at_cents)) && Number(body.compare_at_cents) > 0
          ? Math.round(Number(body.compare_at_cents))
          : null,
      category: body?.category,
      subcategory: body?.subcategory,
      brand: body?.brand,
      condition: body?.condition,
      colour: body?.colour,
      size: body?.size,
    })
    if (problems.length) return NextResponse.json({ error: "incomplete", fields: problems }, { status: 400 })
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
    .select("id, slug, status")
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
      .select("id, slug, status")
      .maybeSingle()
    if (retry.error || !retry.data) return NOT_FOUND()
    return NextResponse.json({ id: retry.data.id, slug: retry.data.slug, status: retry.data.status })
  }

  if (!data) return NOT_FOUND()
  // The status travels with the answer: an archived listing stays archived
  // after an edit, and /products/<slug> refuses to render one — so the client
  // needs to know before it decides where to send you.
  return NextResponse.json({ id: data.id, slug: data.slug, status: data.status })
}

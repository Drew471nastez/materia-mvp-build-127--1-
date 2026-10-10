import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { productMatchesQuery } from "@/lib/website-builder/shop-page"
import { toCard } from "@/lib/website-builder/shop-products"
import { offChannel } from "@/lib/store/channel-filter"

export const runtime = "nodejs"

/**
 * ===========================================================================
 *  SEARCH AS YOU TYPE, ON A CREATOR'S SITE
 * ===========================================================================
 * The header's field shows what matches while the visitor is still typing,
 * the way the themes people are used to do, and this is what it asks.
 *
 * SAME HOST, NO SESSION. A built site runs on its own subdomain or domain,
 * and `/api/…` there is served on that host rather than rewritten to a page
 * of the site, so the field can ask without leaving and without any
 * cross-origin permission. Nothing here needs to know who is asking.
 *
 * THE SAME QUESTION THE SEARCH PAGE ANSWERS. `productMatchesQuery` is what
 * /search filters with, so a word that finds something here finds the same
 * thing there, and "View all" never shows fewer than the dropdown did.
 *
 * PUBLIC BY DESIGN, and therefore bounded: the creator is named by id and
 * must exist, the query is capped, only published products are read, only
 * the fields a card draws are returned, and a shop's catalogue is at most a
 * few dozen rows. A pattern that refuses input rather than escaping it is
 * not needed because nothing here goes into a query as text.
 */

const MAX_QUERY = 80
const MAX_RESULTS = 6
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  let creatorId = (req.nextUrl.searchParams.get("creator") ?? "").trim()
  const installId = (req.nextUrl.searchParams.get("install") ?? "").trim()
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, MAX_QUERY).trim()

  const admin = createAdminClient()

  /*
    THE EDITOR ASKS BY INSTALL. A published site knows its creator; the
    builder's canvas knows which theme install it is drawing, and that is
    enough: the install names its creator. Resolved here so the canvas never
    has to be told a creator id, and so the answer inside the editor is the
    same shop the published site searches.
  */
  if (!UUID.test(creatorId) && UUID.test(installId)) {
    const { data: install } = await admin
      .from("store_theme_installs")
      .select("creator_id")
      .eq("id", installId)
      .maybeSingle()
    creatorId = typeof install?.creator_id === "string" ? install.creator_id : ""
  }

  if (!UUID.test(creatorId)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
  if (!q) {
    return NextResponse.json({ items: [], total: 0 }, { headers: { "Cache-Control": "public, max-age=30" } })
  }

  const { data, error } = await admin
    .from("products")
    .select("id, title, slug, price_cents, compare_at_cents, thumbnail_url, status, description, category")
    .eq("creator_id", creatorId)
    .eq("status", "published")
    .limit(200)

  if (error) {
    console.error("[site search] read failed:", error.message)
    return NextResponse.json({ error: "Could not search" }, { status: 500 })
  }

  /* Settings › Sales channels: a product taken off the Online store is not found by its search. */
  const offStore = await offChannel(admin, creatorId, "storefront")
  const matches = (data ?? []).filter((p) => !offStore.has(String(p.id)) && productMatchesQuery(p, q))
  const items = matches.slice(0, MAX_RESULTS).map((row) => {
    const card = toCard(row)
    return {
      id: card.id,
      title: card.settings.title,
      price: card.settings.price,
      image: card.settings.image,
      url: card.settings.url,
    }
  })

  return NextResponse.json(
    { items, total: matches.length },
    { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } },
  )
}

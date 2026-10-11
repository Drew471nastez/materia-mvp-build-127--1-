import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getMainDomain, getProductShareUrl } from "@/lib/url-helpers"
import { storeOriginFor } from "@/lib/physical/order-link-server"

export const runtime = "nodejs"

/**
 * GET /api/app/products/:id/live
 *
 * "View on your store" from the product editor. A product that ships opens
 * on the store's published website (its own domain first, then its
 * storelib.com address), at /products/<slug>, where it is bought: the
 * creator page cannot sell it. Every other product, and a store with no
 * published website yet, opens on the creator page as before.
 *
 * A redirect rather than an answer to read, so the editor opens the tab at
 * once (no popup blocker) and the native app can hand it to the browser.
 * It names nothing that is not public: only a published product's address
 * is given, and an id that is not one goes to the platform's home.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const home = `https://${getMainDomain()}/`
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.redirect(home, 302)
  const db = createAdminClient()
  const { data } = await db.from("products").select("slug, type, status, creator_id").eq("id", id).maybeSingle()
  const product = data as { slug: string | null; type: string | null; status: string | null; creator_id: string } | null
  if (!product?.slug || product.status !== "published") return NextResponse.redirect(home, 302)

  if (product.type === "physical") {
    const origin = await storeOriginFor(db, product.creator_id)
    if (origin !== home.replace(/\/$/, "")) return NextResponse.redirect(`${origin}/products/${encodeURIComponent(product.slug)}`, 302)
  }

  const { data: creator } = await db.from("creators").select("slug, user_id").eq("id", product.creator_id).maybeSingle()
  const row = creator as { slug: string | null; user_id: string | null } | null
  let handle = row?.slug ?? ""
  if (row?.user_id) {
    const { data: profile } = await db.from("profiles").select("username").eq("id", row.user_id).maybeSingle()
    handle = (profile as { username: string | null } | null)?.username || handle
  }
  return NextResponse.redirect(handle ? getProductShareUrl(handle, product.slug) : home, 302)
}

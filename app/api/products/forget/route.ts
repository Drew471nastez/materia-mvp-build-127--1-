import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { forgetDeletedProduct, purgeProductCaches, refreshPublishedSite } from "@/lib/products/forget-product"
import { queueProductFanout } from "@/lib/notifications/fanout"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** A slug as it can sit in a path: nothing that could reshape the address it is put into. */
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,199}$/

/**
 * "I just deleted, archived or unpublished this product."
 *
 * Products are written from the browser straight to the database, so there
 * is no server route on the way through to drop what is cached of them. This
 * is that route. It decides for itself which of the two happened, by asking
 * the database whether the product is still there:
 *
 *   still there   a status change. The caches that hold it are purged, and
 *                 the blocks that name it are left alone, so publishing it
 *                 again brings it straight back.
 *   gone          a delete. The caches are purged and the OnePage blocks
 *                 that named it are taken off the creator's page.
 *
 * The creator comes from the session and only their own product is touched,
 * so a stranger's id or slug reaches nothing. lib/products/forget-product.ts.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { productId?: unknown; productSlug?: unknown } | null
  const productId = typeof body?.productId === "string" && UUID.test(body.productId) ? body.productId : null
  const askedSlug = typeof body?.productSlug === "string" && SLUG.test(body.productSlug) ? body.productSlug : null
  if (!productId && !askedSlug) return NextResponse.json({ error: "Nothing to forget" }, { status: 400 })

  const admin = createAdminClient()
  const { data: creator } = await admin.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  const creatorId = (creator as { id?: string } | null)?.id
  if (!creatorId) return NextResponse.json({ ok: true })

  /* The address the product had on storelib.com is under the creator's handle. */
  const { data: profile } = await admin.from("profiles").select("username").eq("id", user.id).maybeSingle()
  const handle = (profile as { username?: string | null } | null)?.username?.trim().toLowerCase() || null

  /*
    IS IT STILL THERE. Looked up by the caller's own creator id as well, so a
    product that belongs to somebody else reads the same as one that is gone
    and still purges nothing of theirs: every purge below names this
    creator's own tags and paths.
  */
  const lookup = admin.from("products").select("id, slug").eq("creator_id", creatorId)
  const { data: still } = await (productId ? lookup.eq("id", productId) : lookup.eq("slug", askedSlug!)).maybeSingle()
  const row = still as { id?: string; slug?: string | null } | null
  const slug = row?.slug ?? askedSlug

  if (row?.id) {
    purgeProductCaches({ creatorId, productId: row.id, slug, handle })
    await refreshPublishedSite(creatorId)
    /* Published from the list or the editor's toggle: followers and past buyers hear once (lib/notifications/fanout.ts). Never fails this. */
    try {
      await queueProductFanout(admin, { productId: row.id, creatorId })
    } catch (e) {
      console.error("[products/forget] followers not queued:", e instanceof Error ? e.message : e)
    }
    return NextResponse.json({ ok: true, deleted: false }, { status: 202 })
  }

  const { pagesChanged } = await forgetDeletedProduct(admin, {
    creatorId,
    productId: productId ?? "",
    slug,
    handle,
    ownerId: user.id,
  })
  return NextResponse.json({ ok: true, deleted: true, pagesChanged }, { status: 202 })
}

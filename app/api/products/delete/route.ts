import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { NO_ACCESS, requireTeamPermission } from "@/lib/team/server"
import { deleteOwnProduct, previewDelete } from "@/lib/products/delete-product"
import { forgetDeletedProduct, purgeProductCaches, refreshPublishedSite } from "@/lib/products/forget-product"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * "Delete this product." The one place a creator's product is deleted from
 * (the Products list, the product editor, the course editor).
 *
 * The creator is the session's, never an id the browser sent; the product is
 * read and deleted by that creator's id, and the answer is what the database
 * did: deleted; archived, because somebody bought, claimed or was given it
 * and a delete would take it out of their library (lib/products/
 * delete-product.ts); or a failure with nothing changed.
 *
 * GET asks the same question first, so the screen can say which of the two
 * a press will do before it is pressed.
 *
 * Then what #361 did from the browser, here, once the outcome is known: a
 * deleted product's caches are dropped and its OnePage blocks taken out; an
 * archived one has its caches dropped and its blocks left for a restore.
 */
async function caller() {
  /* Round 41: the owner's own store, or the store a team member with Products works in. A product with sales is archived, never deleted, for the owner and the member alike (lib/products/delete-product). */
  const gate = await requireTeamPermission("products")
  if (gate instanceof NextResponse) {
    if (gate.status === 401) return null
    const body = (await gate.clone().json().catch(() => ({}))) as { error?: string }
    /* No store of their own: as before, an empty id finds nothing. A member without Products: refused. */
    if (body.error !== NO_ACCESS) return { admin: createAdminClient(), creatorId: "", ownerId: "" }
    return gate
  }
  return { admin: createAdminClient(), creatorId: gate.creatorId, ownerId: gate.ownerUserId ?? "" }
}

const SIGNED_OUT = { ok: false, error: "Sign in again to delete this product" }

export async function GET(request: Request) {
  const who = await caller()
  if (!who) return NextResponse.json(SIGNED_OUT, { status: 401 })
  if (who instanceof NextResponse) return NextResponse.json({ ok: false, error: NO_ACCESS }, { status: 403 })
  const productId = new URL(request.url).searchParams.get("productId") ?? ""
  const preview = await previewDelete(who.admin, { creatorId: who.creatorId, productId })
  if (preview.kind === "failed") return NextResponse.json({ ok: false, error: preview.error }, { status: preview.status })
  return NextResponse.json({ ok: true, hasSales: preview.hasSales }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
  const who = await caller()
  if (!who) return NextResponse.json(SIGNED_OUT, { status: 401 })
  if (who instanceof NextResponse) return NextResponse.json({ ok: false, error: NO_ACCESS }, { status: 403 })
  const { admin, creatorId, ownerId } = who

  const body = (await request.json().catch(() => null)) as { productId?: unknown } | null
  const productId = typeof body?.productId === "string" ? body.productId : ""

  const result = await deleteOwnProduct(admin, { creatorId, productId })
  if (result.kind === "failed") return NextResponse.json({ ok: false, error: result.error }, { status: result.status })

  /* The address the product had on storelib.com is under the creator's handle. */
  const { data: profile } = await admin.from("profiles").select("username").eq("id", ownerId).maybeSingle()
  const handle = (profile as { username?: string | null } | null)?.username?.trim().toLowerCase() || null

  if (result.kind === "deleted") {
    await forgetDeletedProduct(admin, { creatorId, productId, slug: result.product.slug, handle, ownerId })
    return NextResponse.json({ ok: true, outcome: "deleted", status: result.product.status, slug: result.product.slug })
  }

  purgeProductCaches({ creatorId, productId, slug: result.product.slug, handle })
  await refreshPublishedSite(creatorId)
  return NextResponse.json({
    ok: true,
    outcome: "archived",
    reason: result.reason,
    message: result.message,
    status: result.product.status,
    archived: result.product.archived,
    slug: result.product.slug,
  })
}

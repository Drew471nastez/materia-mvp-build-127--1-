import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
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
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data: creator } = await admin.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  return { user, admin, creatorId: (creator as { id?: string } | null)?.id ?? "" }
}

const SIGNED_OUT = { ok: false, error: "Sign in again to delete this product" }

export async function GET(request: Request) {
  const who = await caller()
  if (!who) return NextResponse.json(SIGNED_OUT, { status: 401 })
  const productId = new URL(request.url).searchParams.get("productId") ?? ""
  const preview = await previewDelete(who.admin, { creatorId: who.creatorId, productId })
  if (preview.kind === "failed") return NextResponse.json({ ok: false, error: preview.error }, { status: preview.status })
  return NextResponse.json({ ok: true, hasSales: preview.hasSales }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
  const who = await caller()
  if (!who) return NextResponse.json(SIGNED_OUT, { status: 401 })
  const { user, admin, creatorId } = who

  const body = (await request.json().catch(() => null)) as { productId?: unknown } | null
  const productId = typeof body?.productId === "string" ? body.productId : ""

  const result = await deleteOwnProduct(admin, { creatorId, productId })
  if (result.kind === "failed") return NextResponse.json({ ok: false, error: result.error }, { status: result.status })

  /* The address the product had on storelib.com is under the creator's handle. */
  const { data: profile } = await admin.from("profiles").select("username").eq("id", user.id).maybeSingle()
  const handle = (profile as { username?: string | null } | null)?.username?.trim().toLowerCase() || null

  if (result.kind === "deleted") {
    await forgetDeletedProduct(admin, { creatorId, productId, slug: result.product.slug, handle, ownerId: user.id })
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

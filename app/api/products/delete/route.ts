import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { deleteOwnProduct } from "@/lib/products/delete-product"
import { forgetDeletedProduct, purgeProductCaches } from "@/lib/products/forget-product"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * "Delete this product." The one place a creator's product is deleted from
 * (the Products list, the product editor, the course editor).
 *
 * The creator is the session's, never an id the browser sent; the product is
 * read and deleted by that creator's id, and the answer is what the database
 * did: deleted, archived because it has sales the database would not keep
 * (lib/products/delete-product.ts), or a failure with nothing changed.
 *
 * Then what #361 did from the browser, here, once the outcome is known: a
 * deleted product's caches are dropped and its OnePage blocks taken out; an
 * archived one has its caches dropped and its blocks left for a restore.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "Sign in again to delete this product" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { productId?: unknown } | null
  const productId = typeof body?.productId === "string" ? body.productId : ""

  const admin = createAdminClient()
  const { data: creator } = await admin.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  const creatorId = (creator as { id?: string } | null)?.id ?? ""

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

import { NextResponse, after, type NextRequest } from "next/server"

import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { recordAdminAction } from "@/lib/admin/audit"
import { UUID_RE } from "@/lib/admin/platform-metrics"
import { plainReason } from "@/lib/admin/plain-reason"
import { createAdminClient } from "@/lib/supabase/admin"
import { purgeProductCaches, refreshPublishedSite } from "@/lib/products/forget-product"
import { announce, productAddresses } from "@/lib/seo/announce"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  POST /api/admin/products/moderate   take one product down, or put it back
 * ===========================================================================
 * "unpublish" sets the product to `unpublished`: off the marketplace, off
 * the creator's page, not buyable. It is not `draft`, because a draft is the
 * creator's own unfinished work and putting it back would be guessing whose
 * decision it was. "republish" returns an unpublished product to published,
 * and only an unpublished one: a draft stays the creator's to publish.
 *
 * Nothing is deleted. Buyers who already own it keep it.
 *
 * The request carries `confirm` equal to the product's id, which the
 * console sends only from its confirmation dialog.
 */

export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  let body: { productId?: unknown; action?: unknown; reason?: unknown; confirm?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400 })
  }

  const productId = typeof body.productId === "string" ? body.productId : ""
  const action = body.action
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : ""
  if (!UUID_RE.test(productId)) return NextResponse.json({ error: "That is not a product id." }, { status: 400 })
  if (action !== "unpublish" && action !== "republish") return NextResponse.json({ error: 'action is "unpublish" or "republish".' }, { status: 400 })
  if (body.confirm !== productId) return NextResponse.json({ error: "Confirm this from the dialog." }, { status: 400 })

  const admin = createAdminClient()
  const { data: product, error: readError } = await admin.from("products").select("id, title, slug, status, creator_id").eq("id", productId).maybeSingle()
  if (readError) return adminFailure("product read", readError, "The product could not be read. Nothing was changed.")
  if (!product) return NextResponse.json({ error: "No product has that id." }, { status: 404 })

  const from = action === "unpublish" ? "published" : "unpublished"
  const to = action === "unpublish" ? "unpublished" : "published"
  if (product.status !== from) {
    return NextResponse.json({ error: `This product is ${product.status || "draft"}, so there is nothing to ${action}.` }, { status: 409 })
  }

  /* Only from the state it was read in, so a double click or a second tab changes it once. */
  const { data: changed, error } = await admin.from("products").update({ status: to }).eq("id", productId).eq("status", from).select("id")
  if (error) {
    console.error("[admin] product moderate:", error.code, error.message)
    return NextResponse.json({ error: plainReason(error, "products") }, { status: error.code === "23514" ? 409 : 500 })
  }
  if (!changed || changed.length === 0) return NextResponse.json({ error: "It changed while this was open. Nothing was done." }, { status: 409 })

  /* Off every page now, or back on them: what was cached of it goes, as it does for the creator's own archive (lib/products/forget-product). */
  if (product.creator_id) {
    purgeProductCaches({ creatorId: product.creator_id, productId, slug: product.slug ?? null })
    await refreshPublishedSite(product.creator_id)
    /* And search engines told, after the answer, the way a creator's own delete does (lib/seo/announce.ts): taken down, they find it gone; put back, they find it again. */
    const creatorId = product.creator_id
    after(() => announce(() => productAddresses(productId, creatorId)))
  }

  const recorded = await recordAdminAction(admin, {
    action: action === "unpublish" ? "unpublish_product" : "republish_product",
    targetType: "product",
    targetId: productId,
    targetLabel: product.title ?? null,
    reason: reason || null,
    detail: { creator_id: product.creator_id },
  })

  return NextResponse.json({
    ok: true,
    status: to,
    notes: recorded ? [] : ["Not written to the audit log: its table is missing. Run supabase/sql/RUN_ADMIN_CONSOLE.sql."],
  })
}

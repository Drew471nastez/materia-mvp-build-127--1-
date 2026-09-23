/**
 * ===========================================================================
 *  THE BROWSER HOLDS THE RECEIPT. THE SERVER DECIDES WHAT IT IS WORTH.
 * ===========================================================================
 * Somebody can buy here without making an account, and when they come back
 * the button has to say Download. That works today off localStorage — and
 * localStorage is the ONLY thing consulted, which is the problem this
 * endpoint exists to fix.
 *
 * Nothing here was insecure: `/api/download/[assetId]` has always verified
 * the receipt token before signing a URL, so a forged localStorage entry
 * could never actually produce a file. What it could do is make the PAGE
 * lie. Anyone can open devtools and add a product id; the button then says
 * Download, and the download 403s. The page promised something it could not
 * deliver, which is the worst version of this to debug.
 *
 * It goes wrong honestly too. Refund an order, delete a product, buy variant
 * A and hand-edit the stored variant list to include B — in every case the
 * stored copy and the truth drift apart, and the stored copy is what the
 * button reads.
 *
 * ---------------------------------------------------------------------------
 *  HOW EVERY OTHER MARKETPLACE DOES IT
 * ---------------------------------------------------------------------------
 * The browser keeps a bearer token — Gumroad calls it a licence, the
 * principle is identical — and the server is asked what that token is worth.
 * The client's copy is a HINT, never an answer. That is the whole change:
 *
 *      before   localStorage says bought  ->  button says Download
 *      after    localStorage says bought  ->  ask here  ->  button says
 *                                             whatever the database says
 *
 * ---------------------------------------------------------------------------
 *  WHAT THIS WILL NOT DO
 * ---------------------------------------------------------------------------
 * Return anything about a token whose order is not for the product being
 * asked about. A token is proof of ONE purchase, so it answers one question
 * and cannot be used to sweep the catalogue for what else its owner owns.
 *
 * It returns no email, no name, no order id, no buyer id. A stale token gets
 * named back so the browser can drop it, and nothing else.
 */
import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { canDeliver } from "@/lib/receipts/rules"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * A browser has one receipt per product it bought, so a page asking about one
 * product sends one or two. A hundred is somebody probing, and receipt tokens
 * are nanoid(32) — about 190 bits — so probing cannot succeed anyway. The cap
 * is here to keep a pointless request from costing a hundred queries.
 */
const MAX_TOKENS = 10

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const productId: unknown = body?.productId
    const rawTokens: unknown = body?.receiptTokens

    if (typeof productId !== "string" || !productId) {
      return NextResponse.json({ error: "Missing productId" }, { status: 400 })
    }

    const receiptTokens = Array.isArray(rawTokens)
      ? rawTokens.filter((t): t is string => typeof t === "string" && t.length > 0 && t.length <= 128).slice(0, MAX_TOKENS)
      : []

    const admin = createAdminClient()

    /* ------------------------------------------------------------------
       WHO IS ASKING, IF ANYBODY. A signed-in buyer's entitlements are the
       strongest proof there is and do not depend on this browser at all.
       ------------------------------------------------------------------ */
    let isLoggedIn = false
    const variantIds = new Set<string>()
    let hasPurchased = false

    try {
      const supabase = await createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        isLoggedIn = true

        const { data: entitlements } = await admin
          .from("entitlements")
          .select("variant_id")
          .eq("buyer_id", user.id)
          .eq("product_id", productId)

        if (entitlements && entitlements.length > 0) {
          hasPurchased = true
          for (const e of entitlements) if (e.variant_id) variantIds.add(e.variant_id)
        }

        /*
          Orders as well as entitlements, because the two can disagree: a
          guest checkout that was later attached to this account updates the
          order and may not have written an entitlement. The download route
          checks both for the same reason.
        */
        const { data: orders } = await admin
          .from("orders")
          .select("variant_id")
          .eq("buyer_id", user.id)
          .eq("product_id", productId)
          .eq("status", "completed")

        if (orders && orders.length > 0) {
          hasPurchased = true
          for (const o of orders) if (o.variant_id) variantIds.add(o.variant_id)
        }
      }
    } catch {
      /* No session is not an error here — a guest is the case this is for. */
    }

    /* ------------------------------------------------------------------
       AND THE RECEIPTS THIS BROWSER IS HOLDING.
       ------------------------------------------------------------------ */
    const validTokens: string[] = []
    const staleTokens: string[] = []

    if (receiptTokens.length > 0) {
      const { data: orders } = await admin
        .from("orders")
        .select("receipt_token, product_id, variant_id, status")
        .in("receipt_token", receiptTokens)

      const byToken = new Map((orders ?? []).map((o) => [o.receipt_token as string, o]))

      for (const token of receiptTokens) {
        const order = byToken.get(token)
        /*
          THE TOKEN HAS TO BE FOR THIS PRODUCT. Without this check a receipt
          for anything would answer a question about everything, which turns
          one purchase into a key for the catalogue.
        */
        if (!order || order.product_id !== productId) {
          staleTokens.push(token)
          continue
        }
        /*
          A refunded, failed or disputed order no longer counts as bought.
          The download route refuses it either way (lib/receipts/rules
          decideAccess); saying so here keeps the page from offering a
          Download button that can only answer no. Not stale: the receipt
          still exists and still opens, it just has nothing to hand over.
        */
        if (!canDeliver(order.status)) continue
        validTokens.push(token)
        hasPurchased = true
        if (order.variant_id) variantIds.add(order.variant_id)
      }
    }

    if (!hasPurchased) {
      return NextResponse.json({
        hasPurchased: false,
        isLoggedIn,
        variantIds: [],
        assets: [],
        validTokens: [],
        staleTokens,
      })
    }

    /* ------------------------------------------------------------------
       WHAT THEY CAN ACTUALLY DOWNLOAD.
       ------------------------------------------------------------------ */
    const { data: allAssets } = await admin
      .from("digital_assets")
      .select("id, file_name")
      .eq("product_id", productId)
      .order("created_at", { ascending: true })

    let assets = allAssets ?? []

    /*
      A product with variants only hands over the files of the variants that
      were bought. `/api/download/[assetId]` enforces this again before it
      signs anything — this is the same rule applied early so the page offers
      the right list rather than offering files that 403.
    */
    if (variantIds.size > 0 && assets.length > 0) {
      const { data: variantFiles } = await admin
        .from("product_variant_files")
        .select("digital_asset_id")
        .in("variant_id", [...variantIds])

      const allowed = new Set((variantFiles ?? []).map((f) => f.digital_asset_id as string))
      /*
        An empty mapping means this product's variants do not restrict files
        — not that nothing is allowed. Returning nothing there would take
        downloads away from buyers whose products never used the table.
      */
      if (allowed.size > 0) assets = assets.filter((a) => allowed.has(a.id))
    }

    return NextResponse.json({
      hasPurchased: true,
      isLoggedIn,
      variantIds: [...variantIds],
      assets,
      validTokens,
      staleTokens,
    })
  } catch (error) {
    console.error("[purchases/verify] failed:", error)
    return NextResponse.json({ error: "Verification failed" }, { status: 500 })
  }
}

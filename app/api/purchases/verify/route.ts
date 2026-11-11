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
import { assetAllowedForVariants, canDeliver } from "@/lib/receipts/rules"
import { guestAccessFromCookieHeader } from "@/lib/receipts/guest-access"
import { heldGrants } from "@/lib/receipts/guest-access-server"
import { membershipForProductPage } from "@/lib/memberships/product-page"
import { routeUser } from "@/lib/auth/route-user"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * A browser has one receipt per product it bought, so a page asking about one
 * product sends one or two. A hundred is somebody probing, and receipt tokens
 * are nanoid(32) — about 190 bits — so probing cannot succeed anyway. The cap
 * is here to keep a pointless request from costing a hundred queries.
 */
const MAX_TOKENS = 10
/* This browser's own answer: never held by anybody's cache. */
const PRIVATE = { "Cache-Control": "private, no-store" }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const productId: unknown = body?.productId
    const rawTokens: unknown = body?.receiptTokens
    /* Round 49: the product page asks here for a membership's own link too (it is one HTML for everybody, so the server no longer draws it). */
    const askMembership = body?.membership === true

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
    let signedInUser: { id: string; email?: string | null; email_confirmed_at?: string | null } | null = null
    const variantIds = new Set<string>()
    /* What each purchase covers, for the file list: a variant, or null for
       "the whole product". The same list decideAccess judges a download by. */
    const covers: Array<string | null> = []
    let hasPurchased = false

    try {
      const supabase = await createClient()
      const who = await routeUser()
      const user = who.kind === "user" ? who.user : null

      if (user) {
        isLoggedIn = true
        signedInUser = user

        /*
          JUDGED THE WAY THE DOWNLOAD ROUTE JUDGES (lib/receipts/rules
          decideAccess): by this person's ORDERS when they have any, because
          a refund changes the order and leaves the entitlement row behind;
          by entitlements only when there is no order at all (free claims,
          gifts). Whole rows, so a partial refund reads as the sale it is.
        */
        const { data: orders } = await admin.from("orders").select("*").eq("buyer_id", user.id).eq("product_id", productId)

        if (orders && orders.length > 0) {
          for (const o of orders) {
            if (!canDeliver(o)) continue
            hasPurchased = true
            covers.push(o.variant_id ?? null)
            if (o.variant_id) variantIds.add(o.variant_id)
          }
        } else {
          const { data: entitlements } = await admin
            .from("entitlements")
            .select("*")
            .eq("buyer_id", user.id)
            .eq("product_id", productId)
          for (const e of entitlements ?? []) {
            hasPurchased = true
            covers.push(e.variant_id ?? null)
            if (e.variant_id) variantIds.add(e.variant_id)
          }
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
      /*
        Only what the answer needs: the token, what it is for, and whether it
        still delivers. The refund amount decides a partial refund (lib/
        receipts/rules canDeliver); its column is not in every database, so
        a read naming it that fails is retried without it, which reads any
        refund as a full one: the safe way round.
      */
      const COLUMNS = "receipt_token, product_id, variant_id, status, amount_cents"
      const full = await admin.from("orders").select(`${COLUMNS}, refund_amount_cents`).in("receipt_token", receiptTokens)
      const orders = (full.error
        ? (await admin.from("orders").select(COLUMNS).in("receipt_token", receiptTokens)).data
        : full.data) as Array<Record<string, any>> | null

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
        if (!canDeliver(order)) continue
        validTokens.push(token)
        hasPurchased = true
        covers.push(order.variant_id ?? null)
        if (order.variant_id) variantIds.add(order.variant_id)
      }
    }

    /* ------------------------------------------------------------------
       AND WHAT THIS BROWSER BOUGHT AS A GUEST, from its signed httpOnly
       cookie (lib/receipts/guest-access.ts): each grant checked against its
       own order, the order against the delivery rule.
       ------------------------------------------------------------------ */
    const guest = await heldGrants(admin, guestAccessFromCookieHeader(request.headers.get("cookie")), { productId })
    for (const order of guest.open) {
      hasPurchased = true
      covers.push(order.variant_id ?? null)
      if (order.variant_id) variantIds.add(order.variant_id)
    }
    /* A member's own membership, in place of Join (lib/memberships/product-page), only for somebody signed in. */
    const memberHref = askMembership && signedInUser ? ((await membershipForProductPage(productId, signedInUser).catch(() => null))?.memberHref ?? null) : null

    if (!hasPurchased) {
      return NextResponse.json({
        hasPurchased: false,
        isLoggedIn,
        variantIds: [],
        assets: [],
        validTokens: [],
        staleTokens,
        memberHref,
      }, { headers: PRIVATE })
    }

    /* ------------------------------------------------------------------
       WHAT THEY CAN ACTUALLY DOWNLOAD.
       ------------------------------------------------------------------ */
    const { data: allAssets } = await admin
      .from("digital_assets")
      .select("*")
      .eq("product_id", productId)
      .order("created_at", { ascending: true })

    /* Only what is there to download, and only the two fields the page uses. */
    let assets = ((allAssets ?? []) as Array<Record<string, any>>)
      .filter((a) => typeof a.upload_status !== "string" || a.upload_status === "completed")
      .map((a) => ({ id: a.id as string, file_name: a.file_name as string }))

    /*
      A product with variants only hands over the files of the variants that
      were bought. `/api/download/[assetId]` enforces this again before it
      signs anything — this is the same rule applied early so the page offers
      the right list rather than offering files that 403.
    */
    if (variantIds.size > 0 && assets.length > 0) {
      const { data: variantFiles, error: mapError } = await admin
        .from("product_variant_files")
        .select("variant_id, digital_asset_id")
        .in("variant_id", [...variantIds])
      /* The download route fails closed on this read; so does the list. */
      if (mapError && (mapError as { code?: string }).code !== "42P01") {
        assets = covers.includes(null) ? assets : []
      } else {
        const map = new Map<string, string[]>()
        for (const f of (variantFiles ?? []) as Array<{ variant_id: string; digital_asset_id: string }>) {
          map.set(f.variant_id, [...(map.get(f.variant_id) ?? []), f.digital_asset_id])
        }
        /* Per file, across everything bought: a variant with no files mapped,
           or a purchase with no variant, covers every file. */
        assets = assets.filter((a) => assetAllowedForVariants(a.id, covers, map))
      }
    }

    return NextResponse.json({
      hasPurchased: true,
      isLoggedIn,
      variantIds: [...variantIds],
      assets,
      validTokens,
      staleTokens,
      memberHref,
    }, { headers: PRIVATE })
  } catch (error) {
    console.error("[purchases/verify] failed:", error)
    return NextResponse.json({ error: "Verification failed" }, { status: 500 })
  }
}

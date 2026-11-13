import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, addressSubject } from "@/lib/api/rate-limit"
import { liveAppBlockData, pageCreatorId, publishedBlocksOf } from "@/lib/onepage/page-block"
import { readLivePage } from "@/lib/onepage/tips-server"
import { lockedContent } from "@/lib/onepage/paid-access"
import { openLockedData } from "@/lib/onepage/locked-seal"
import { ownsProduct } from "@/lib/courses/server"
import { guestOwns } from "@/lib/receipts/guest-access-server"
import { guestAccessFromCookieHeader } from "@/lib/receipts/guest-access"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "private, no-store" }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/onepage/access { onepage_id, block_id }
 *   -> { text, url, label }  for somebody who owns the block's product
 *   -> 403 { locked: true }  for anybody else
 *
 * PAID ACCESS, CHECKED HERE AND ONLY HERE (lib/onepage/paid-access). The block
 * is read from the PUBLISHED page (on, in its schedule), and its product
 * from the block, never from the request. Access is what every Storelib
 * purchase gives: a signed in buyer's entitlement or completed order
 * (lib/courses/server ownsProduct), or, for a guest, this browser's own
 * receipt cookie for an order of that product from this creator
 * (lib/receipts/guest-access-server). The page's own creator is shown it
 * too. Limited per address, so a guesser learns nothing quickly.
 */
export async function POST(request: Request) {
  const limited = await rateLimit({ bucket: "onepage-paid", subjects: [addressSubject(request)], windows: [{ limit: 30, seconds: 60 }, { limit: 300, seconds: 3600 }] })
  if (limited) return limited
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400, headers: noStore })
  }
  const db = createAdminClient()
  const page = await readLivePage(db, body.onepage_id)
  if (!page) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const data = liveAppBlockData<{ paid_product_id?: unknown; locked_text?: unknown; locked_url?: unknown; locked_label?: unknown }>(publishedBlocksOf(page), body.block_id, "paid")
  const productId = typeof data?.paid_product_id === "string" && UUID.test(data.paid_product_id) ? data.paid_product_id : null
  const creatorId = pageCreatorId(page)
  if (!data || !productId || !creatorId) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })

  /* The product is the page's creator's own: a block naming somebody else's product opens for nobody. */
  const { data: product } = await db.from("products").select("id").eq("id", productId).eq("creator_id", creatorId).maybeSingle()
  if (!product) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })

  let allowed = false
  const who = await routeUser({ fresh: true })
  if (who.kind === "unavailable") return authUnavailableResponse()
  const user = who.kind === "user" ? who.user : null
  if (user) allowed = user.id === page.owner_id || (await ownsProduct(db, user.id, productId).catch(() => false))
  if (!allowed) {
    const held = await guestOwns(db, guestAccessFromCookieHeader(request.headers.get("cookie")), { creatorId }, [productId]).catch(() => ({}) as Record<string, { whole: boolean }>)
    allowed = !!(held as Record<string, { whole: boolean; options: string[] }>)[productId]
  }
  if (!allowed) return NextResponse.json({ locked: true, signed_in: !!user }, { status: 403, headers: noStore })
  /* Sealed where it is stored (lib/onepage/locked-seal): opened here, and only here, for somebody with access. */
  return NextResponse.json(lockedContent(openLockedData(data)), { headers: noStore })
}

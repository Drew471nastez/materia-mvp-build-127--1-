import { NextResponse } from "next/server"
import { createHash } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, addressSubject, LIMITS } from "@/lib/api/rate-limit"
import { confirmTip, startTipCheckout } from "@/lib/onepage/tips-server"
import { tipReturnPath } from "@/lib/onepage/tips"
import { billingPlatformOrigin, trustedReturnUrl } from "@/lib/billing/return-url"
import { getOnePageDomain } from "@/lib/onepage/address"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "private, no-store" }

/**
 * Where Stripe sends the visitor back: the page they were on, on Storelib or
 * on the OnePage host (storelib.me). Any other host gets the page's own
 * address on Storelib (`/l/<slug>`, filled in by the checkout).
 */
function returnTo(request: Request, rawPath: unknown): { origin: string; returnPath: string | null } {
  try {
    const origin = new URL(request.url).origin
    const host = new URL(request.url).hostname.toLowerCase()
    if (host === getOnePageDomain() || trustedReturnUrl(`${origin}/`)) return { origin, returnPath: tipReturnPath(rawPath) }
  } catch {
    /* Below. */
  }
  return { origin: billingPlatformOrigin(), returnPath: null }
}

/**
 * POST /api/onepage/tip
 *   { onepage_id, block_id, amount_cents, name?, message?, return_path }
 *     -> { url }: the Stripe Checkout page to send the visitor to
 *   { confirm: true, onepage_id, session_id }
 *     -> { amount_cents, currency }: the paid tip, read back from Stripe
 *
 * A tip on a OnePage tips block, paid through Storelib checkout to the
 * creator's own connected account (lib/onepage/tips-server.ts). The amount,
 * the block and the account are checked on the server; nothing the page
 * says about them is believed. Limited like every payment on Storelib.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Something was missing. Refresh the page and try again." }, { status: 400, headers: noStore })
  }
  const address = addressSubject(request)
  const limited = await rateLimit({
    bucket: "payment",
    subjects: [address],
    windows: LIMITS.payment,
    message: "Too many payment attempts just now. Wait a few minutes and try again.",
  })
  if (limited) return limited

  const [{ stripe }] = await Promise.all([import("@/lib/stripe")])
  const db = createAdminClient()

  if (body.confirm === true) {
    const done = await confirmTip(db, stripe, { sessionId: body.session_id, onepageId: body.onepage_id })
    if (done.ok === false) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
    return NextResponse.json({ amount_cents: done.amountCents, currency: done.currency }, { headers: noStore })
  }

  const [{ checkoutReadyForCreator }, { calculatePlatformFeeForCheckout }, { readStoreCurrency }, { minimumChargeMinor }] = await Promise.all([
    import("@/lib/payments/service"),
    import("@/lib/billing/platform-fee-server"),
    import("@/lib/store/selling-currency-read"),
    import("@/lib/store/selling-currency"),
  ])
  const started = await startTipCheckout(
    db,
    {
      stripe,
      ready: (creatorId) => checkoutReadyForCreator(creatorId),
      fee: (cents, creatorId, currency) => calculatePlatformFeeForCheckout(cents, creatorId, db, currency),
      currency: async (creatorId) => (await readStoreCurrency(db, creatorId)).currency,
      minimum: (currency) => minimumChargeMinor(currency),
    },
    {
      onepageId: body.onepage_id,
      blockId: body.block_id,
      amountCents: body.amount_cents,
      name: body.name,
      message: body.message,
      ...returnTo(request, body.return_path),
      visitor: createHash("sha256").update(address || "unknown").digest("hex").slice(0, 24),
    },
  )
  if (started.ok === false) return NextResponse.json({ error: started.error, code: started.code }, { status: started.status, headers: noStore })
  return NextResponse.json({ url: started.url }, { headers: noStore })
}

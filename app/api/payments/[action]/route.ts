/**
 * ===========================================================================
 *  /api/payments/*: THE PAYMENTS HUB'S SERVER
 * ===========================================================================
 * For a creator on Storelib Payments' Airwallex rollout only. Each action
 * acts for the SIGNED IN creator, found from the session, never from the
 * body; a creator on Stripe gets 404 from all of it.
 *
 *   GET  overview        what the hub draws (lib/payments/service overview)
 *   POST start           { kind, country, businessName?, agree: true }
 *                        creates their Airwallex account, once
 *   POST verify          the hosted verification page's address, to go to
 *   POST component       { purpose: "onboarding" | "payout_form" | "rfi" }
 *                        a one-time code for an embedded Airwallex form
 *   POST form-status     { status } what the embedded form said, for wording
 *   POST payout-account  { payload } the embedded payout form's submit()
 *   POST payout          { amountMinor, currency } a payout to their bank
 *   POST refresh         asks Airwallex again, now
 *
 * Errors are one sentence for the creator. Airwallex's own codes and
 * messages stay in the server log.
 */
import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIMITS, callerAddress, rateLimit } from "@/lib/api/rate-limit"
import {
  addPayoutAccount,
  componentAuth,
  describe,
  hostedFlowUrl,
  noteFormStatus,
  overview,
  PaymentsProblem,
  providerFor,
  refreshPayoutAccount,
  requestPayout,
  startOnboarding,
  syncAccount,
  type CreatorRef,
} from "@/lib/payments/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "cache-control": "no-store" }

async function signedInCreator(): Promise<CreatorRef | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await createAdminClient().from("creators").select("id, user_id").eq("user_id", user.id).maybeSingle()
  const row = data as { id: string; user_id: string } | null
  if (!row) return null
  return { id: row.id, userId: row.user_id, email: user.email ?? null }
}

/** The creator, when they are on Airwallex; otherwise the answer to send. */
async function airwallexCreator(): Promise<CreatorRef | NextResponse> {
  const creator = await signedInCreator()
  if (!creator) return NextResponse.json({ error: "Sign in to use this." }, { status: 401, headers: NO_STORE })
  if ((await providerFor(creator.id)) !== "airwallex") return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE })
  return creator
}

function problem(e: unknown): NextResponse {
  if (e instanceof PaymentsProblem) return NextResponse.json({ error: e.userMessage }, { status: e.status, headers: NO_STORE })
  console.error("[payments api]", describe(e))
  return NextResponse.json({ error: "Something went wrong. Nothing was changed. Try again in a moment." }, { status: 500, headers: NO_STORE })
}

export async function GET(_request: NextRequest, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params
  if (action !== "overview") return NextResponse.json({ error: "Not found." }, { status: 404 })
  const creator = await airwallexCreator()
  if (creator instanceof NextResponse) return creator
  try {
    return NextResponse.json(await overview(creator), { headers: NO_STORE })
  } catch (e) {
    return problem(e)
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params
  const creator = await airwallexCreator()
  if (creator instanceof NextResponse) return creator
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>

  const moves = action === "payout"
  const limited = await rateLimit({
    bucket: moves ? "payout" : "payments-setup",
    subjects: [creator.id],
    windows: moves ? LIMITS.payout : LIMITS.paymentsSetup,
    message: "That is a lot of requests in a short time. Wait a few minutes and try again.",
  })
  if (limited) return limited

  try {
    switch (action) {
      case "start": {
        if (body.agree !== true) return NextResponse.json({ error: "Agree to continue." }, { status: 400, headers: NO_STORE })
        const kind = body.kind === "business" ? "business" : body.kind === "individual" ? "individual" : null
        if (!kind) return NextResponse.json({ error: "Choose individual or business." }, { status: 400, headers: NO_STORE })
        await startOnboarding(creator, {
          kind,
          country: typeof body.country === "string" ? body.country : "",
          businessName: typeof body.businessName === "string" ? body.businessName.slice(0, 120) : undefined,
          consent: { ip: callerAddress(request), userAgent: request.headers.get("user-agent") },
        })
        return NextResponse.json(await overview(creator), { headers: NO_STORE })
      }
      case "verify": {
        const url = await hostedFlowUrl(creator, originOf(request))
        return NextResponse.json({ url }, { headers: NO_STORE })
      }
      case "component": {
        const purpose = body.purpose === "onboarding" || body.purpose === "payout_form" || body.purpose === "rfi" ? body.purpose : null
        if (!purpose) return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE })
        return NextResponse.json(await componentAuth(creator, purpose), { headers: NO_STORE })
      }
      case "form-status": {
        await noteFormStatus(creator, body.status)
        return NextResponse.json({ ok: true }, { headers: NO_STORE })
      }
      case "payout-account": {
        const destination = await addPayoutAccount(creator, body.payload)
        return NextResponse.json({ destination }, { headers: NO_STORE })
      }
      case "payout": {
        const amount = typeof body.amountMinor === "number" ? body.amountMinor : Number.NaN
        const currency = typeof body.currency === "string" ? body.currency : ""
        return NextResponse.json(await requestPayout(creator, amount, currency), { headers: NO_STORE })
      }
      case "refresh": {
        await syncAccount(creator.id, "creator")
        await refreshPayoutAccount(creator).catch((e) => console.error("[payments api] payout account refresh", describe(e)))
        return NextResponse.json(await overview(creator), { headers: NO_STORE })
      }
      default:
        return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE })
    }
  } catch (e) {
    return problem(e)
  }
}

/**
 * Where the hosted page sends them back to: the address they are on. Not the
 * configured site URL, which on a preview deployment testing the sandbox is
 * still storelib.com and would drop them on production.
 */
function originOf(request: NextRequest): string {
  return request.nextUrl.origin.replace(/\/+$/, "")
}

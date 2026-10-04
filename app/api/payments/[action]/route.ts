/**
 * ===========================================================================
 *  /api/payments/*: THE PAYMENTS HUB'S SERVER
 * ===========================================================================
 * Storelib Payments hub API (Stripe Connect or Airwallex). Each action acts
 * for the signed-in creator only; connected account ids never come from the body.
 *
 *   GET  overview        what the hub draws (lib/payments/service overview)
 *   POST start           { kind, country, businessName?, agree: true }
 *                        creates their Airwallex account, once
 *   POST verify          the hosted verification page's address, to go to
 *   POST component       { purpose }  a fresh, single-use session for an embedded form:
 *                        Airwallex "onboarding" | "payout_form" | "rfi", or Stripe
 *                        "stripe_onboarding" | "stripe_management" | "stripe_payouts"
 *   POST form-status     { status } what the embedded form said, for wording
 *   POST payout-account  { payload } the embedded payout form's submit()
 *   POST payout          { amountMinor, currency } a payout to their bank
 *   POST refresh         asks Airwallex again, now
 *   POST begin           { kind, country, firstName, lastName, businessName?, agree }
 *                        the Account step: creates or reuses their Stripe account
 *   POST prepare         makes sure the account is one Storelib runs, before Verify
 *   POST details-form    what Storelib's own form must still ask (no personal values back)
 *   POST details         { dob, address, phone, idNumber, ssnLast4, politicalExposure, acceptTos }
 *                        written straight to the creator's Stripe account, never kept
 *   POST document        multipart { which, side, file }: an ID photo or proof of
 *                        address, uploaded to Stripe and attached in one call
 *   POST bank            { holderName, iban } or { holderName, accountNumber, routingNumber }
 *   POST identity        starts (or carries on) Stripe's own live ID check and
 *                        returns its modal secret and hosted page, or why there is none
 *   POST identity-status where that check has got to
 *
 * Errors are one sentence for the creator. Airwallex's own codes and
 * messages stay in the server log.
 */
import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIMITS, callerAddress, rateLimit } from "@/lib/api/rate-limit"
import { addBank, detailsForm, submitDetails, uploadDocument } from "@/lib/payments/stripe/own-form"
import { signIdHandoff } from "@/lib/payments/stripe/id-handoff"
import { identityStatus, startIdentity } from "@/lib/payments/stripe/identity"
import {
  addPayoutAccount,
  componentAuth,
  describe,
  hostedFlowUrl,
  noteFormStatus,
  beginOnboarding,
  disconnectPayoutAccount,
  overview,
  PaymentsProblem,
  prepareVerification,
  providerFor,
  refreshPayoutAccount,
  refreshProviderAccount,
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

async function paymentsCreator(): Promise<CreatorRef | NextResponse> {
  const creator = await signedInCreator()
  if (!creator) return NextResponse.json({ error: "Sign in to use this." }, { status: 401, headers: NO_STORE })
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
  const creator = await paymentsCreator()
  if (creator instanceof NextResponse) return creator
  try {
    /* Opening Payouts: the webhook keeps the account current, so Stripe is only asked when the copy is old. */
    return NextResponse.json(await overview(creator, { sync: "stale" }), { headers: NO_STORE })
  } catch (e) {
    return problem(e)
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params
  const creator = await paymentsCreator()
  if (creator instanceof NextResponse) return creator
  /* A document arrives as a file; everything else is JSON. */
  const form = action === "document" ? await request.formData().catch(() => null) : null
  const body = action === "document" ? {} : (((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>)
  const provider = await providerFor(creator.id)

  const moves = action === "payout"
  /* Reads the flow makes on its own (polling for Stripe's answer) must not spend the budget for writes. */
  const reads = action === "details-form" || action === "identity-status" || action === "refresh" || action === "component"
  const limited = await rateLimit({
    bucket: moves ? "payout" : reads ? "payments-read" : "payments-setup",
    subjects: [creator.id],
    windows: moves ? LIMITS.payout : reads ? LIMITS.paymentsRead : LIMITS.paymentsSetup,
    message: "That is a lot of requests in a short time. Wait a few minutes and try again.",
  })
  if (limited) return limited

  try {
    switch (action) {
      case "start": {
        if (body.agree !== true) return NextResponse.json({ error: "Agree to continue." }, { status: 400, headers: NO_STORE })
        const kind = body.kind === "business" ? "business" : body.kind === "individual" ? "individual" : null
        if (!kind) return NextResponse.json({ error: "Choose individual or business." }, { status: 400, headers: NO_STORE })
        const started = await startOnboarding(creator, {
          kind,
          country: typeof body.country === "string" ? body.country : "",
          businessName: typeof body.businessName === "string" ? body.businessName.slice(0, 120) : undefined,
          consent: { ip: callerAddress(request), userAgent: request.headers.get("user-agent") },
        })
        if (provider === "stripe") return NextResponse.json(started, { headers: NO_STORE })
        return NextResponse.json(await overview(creator), { headers: NO_STORE })
      }
      case "verify": {
        if (provider !== "airwallex") return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE })
        const url = await hostedFlowUrl(creator, originOf(request))
        return NextResponse.json({ url }, { headers: NO_STORE })
      }
      case "component": {
        const purpose =
          body.purpose === "onboarding" ||
          body.purpose === "payout_form" ||
          body.purpose === "rfi" ||
          body.purpose === "stripe_payouts" ||
          body.purpose === "stripe_onboarding" ||
          body.purpose === "stripe_management"
            ? body.purpose
            : null
        if (!purpose) return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE })
        return NextResponse.json(await componentAuth(creator, purpose), { headers: NO_STORE })
      }
      case "form-status": {
        await noteFormStatus(creator, body.status)
        return NextResponse.json({ ok: true }, { headers: NO_STORE })
      }
      case "payout-account": {
        if (provider !== "airwallex") return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE })
        const destination = await addPayoutAccount(creator, body.payload)
        return NextResponse.json({ destination }, { headers: NO_STORE })
      }
      case "payout": {
        if (provider !== "airwallex") return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE })
        const amount = typeof body.amountMinor === "number" ? body.amountMinor : Number.NaN
        const currency = typeof body.currency === "string" ? body.currency : ""
        return NextResponse.json(await requestPayout(creator, amount, currency), { headers: NO_STORE })
      }
      case "begin": {
        if (body.agree !== true) return NextResponse.json({ error: "Agree to continue." }, { status: 400, headers: NO_STORE })
        const kind = body.kind === "business" ? "business" : body.kind === "individual" ? "individual" : null
        if (!kind) return NextResponse.json({ error: "Choose individual or business." }, { status: 400, headers: NO_STORE })
        const text = (key: string, max: number) => {
          const value = body[key]
          return typeof value === "string" ? value.slice(0, max) : ""
        }
        return NextResponse.json(
          await beginOnboarding(creator, {
            kind,
            country: text("country", 64),
            firstName: text("firstName", 80),
            lastName: text("lastName", 80),
            businessName: text("businessName", 120),
          }),
          { headers: NO_STORE },
        )
      }
      case "details-form": {
        if (provider !== "stripe") return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE })
        /* Only an account Stripe still runs needs swapping, and that is rare: asking first cost every creator two calls to Stripe on every open. */
        try {
          return NextResponse.json(await detailsForm(creator), { headers: NO_STORE })
        } catch (e) {
          if (!(e instanceof PaymentsProblem) || e.status !== 409) throw e
          await prepareVerification(creator)
          return NextResponse.json(await detailsForm(creator), { headers: NO_STORE })
        }
      }
      case "details": {
        if (provider !== "stripe") return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE })
        const form = await submitDetails(creator, body, { ip: callerAddress(request), userAgent: request.headers.get("user-agent") })
        return NextResponse.json({ form, overview: await overview(creator) }, { headers: NO_STORE })
      }
      case "document": {
        if (provider !== "stripe") return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE })
        const file = form?.get("file")
        const result = await uploadDocument(creator, { which: String(form?.get("which") ?? ""), side: String(form?.get("side") ?? ""), file: file instanceof File ? file : null })
        return NextResponse.json({ form: result }, { headers: NO_STORE })
      }
      case "handoff": {
        /* Verify ID on a phone: a link that lets this creator, and only them, add their ID photos for thirty minutes. */
        if (provider !== "stripe") return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE })
        const token = signIdHandoff(creator.id)
        if (!token) return NextResponse.json({ error: "This is not available just now." }, { status: 503, headers: NO_STORE })
        /* The address this page was opened on, so a preview opens on the preview and the token's key matches. */
        return NextResponse.json({ url: `${request.nextUrl.origin}/verify-id/${token}` }, { headers: NO_STORE })
      }
      case "bank": {
        if (provider !== "stripe") return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE })
        const form = await addBank(creator, body)
        return NextResponse.json({ form, overview: await overview(creator) }, { headers: NO_STORE })
      }
      case "identity": {
        if (provider !== "stripe") return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE })
        await prepareVerification(creator)
        const started = await startIdentity(creator, `${originOf(request)}/app/payouts/identity-done`)
        return NextResponse.json(started, { headers: NO_STORE })
      }
      case "identity-status": {
        if (provider !== "stripe") return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE })
        const view = await identityStatus(creator)
        return NextResponse.json({ ...view, form: await detailsForm(creator) }, { headers: NO_STORE })
      }
      case "prepare": {
        return NextResponse.json(await prepareVerification(creator), { headers: NO_STORE })
      }
      case "disconnect": {
        /* Only a literal true counts as the creator's yes: an account that was ever started is never let go on anything less. */
        return NextResponse.json(await disconnectPayoutAccount(creator, { confirmed: body.confirm === true }), { headers: NO_STORE })
      }
      case "refresh": {
        await refreshProviderAccount(creator.id, "creator")
        if (provider === "airwallex") {
          await refreshPayoutAccount(creator).catch((e) => console.error("[payments api] payout account refresh", describe(e)))
        }
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

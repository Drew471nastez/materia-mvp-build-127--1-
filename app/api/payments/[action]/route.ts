/**
 * ===========================================================================
 *  /api/payments/*: THE PAYMENTS HUB'S SERVER
 * ===========================================================================
 * Storelib Payments hub API, on Stripe Connect. Each action acts for the
 * signed-in creator only; connected account ids never come from the body.
 *
 *   GET  overview        what the hub draws (lib/payments/service overview)
 *   POST start           { kind, country, agree: true, session? } creates their Stripe account in
 *                        that country (or replaces an untouched one in another, or marks it as
 *                        chosen); with session, Stripe's form session comes back with the overview
 *   POST component       { purpose }  a fresh, single-use session for an embedded form:
 *                        "stripe_onboarding" | "stripe_management" | "stripe_payouts"
 *   POST refresh         asks Stripe again, now
 *   POST begin           { kind, country, firstName, lastName, businessName?, agree }
 *                        the Account step: creates or reuses their Stripe account
 *   POST prepare         makes sure the account is one Storelib runs, before Verify
 *   POST details-form    what Storelib's own form must still ask (no personal values back)
 *   POST details         { dob, address, phone, idNumber, ssnLast4, politicalExposure, acceptTos }
 *                        written straight to the creator's Stripe account, never kept
 *   POST document        multipart { which, side, file }: an ID photo or proof of
 *                        address, uploaded to Stripe and attached in one call
 *   POST bank            { holderName, iban } or { holderName, accountNumber, routingNumber }
 *   POST identity        opens Stripe's own ID check for this account: Connect's
 *                        hosted verification, or Stripe Identity where it is there
 *                        (lib/payments/stripe/hosted-verification)
 *   POST identity-status where that check has got to
 *   POST app-sheet       { form: "setup" | "bank" } the address of Stripe's form in the
 *                        apps' browser sheet, with a signed link for this creator
 *   POST hosted-setup    { inApp } Stripe's own setup page for this account, for the
 *                        phone app when the embedded form would ask for a Stripe sign in
 *   POST disconnect      { confirm } lets the Stripe account go
 *   POST notify-country  { country } a seller whose country is not open yet asks to be told
 *                        when it is: kept in integration_requests, read in /admin Integrations
 *
 * Errors are one sentence for the creator. Stripe's own codes and messages
 * stay in the server log.
 */
import { NextResponse, type NextRequest } from "next/server"
import { moneyCaller, paymentsActionLevel, type MoneyCaller } from "@/lib/team/money"
import { recordTeamAction } from "@/lib/team/areas"
import { LIMITS, callerAddress, rateLimit } from "@/lib/api/rate-limit"
import { addBank, detailsForm, submitDetails, uploadDocument } from "@/lib/payments/stripe/own-form"
import { signSheetLink } from "@/lib/payments/stripe/app-sheet-link"
import { startHostedSetup, startVerification, verificationStatus } from "@/lib/payments/stripe/hosted-verification"
import { trustedRequestOrigin } from "@/lib/billing/return-url"
import { askForCountry } from "@/lib/payments/stripe/country-requests"
import {
  componentAuth,
  describe,
  beginOnboarding,
  disconnectPayoutAccount,
  overview,
  PaymentsProblem,
  prepareVerification,
  refreshProviderAccount,
  startOnboarding,
  type CreatorRef,
} from "@/lib/payments/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/* An ID photo crosses a phone connection and then Stripe: room for both, never the ten second default. */
export const maxDuration = 60

const NO_STORE = { "cache-control": "no-store" }

/* Where the request comes from (Vercel's geo header; Cloudflare's when behind it). Only a guess for the country step: never decides anything. */
function ipCountryOf(request: NextRequest): string | null {
  return request.headers.get("x-vercel-ip-country") || request.headers.get("cf-ipcountry") || null
}

/*
  Round 42: the owner, or a team member working in the store whose
  permissions cover this action (lib/team/money paymentsActionLevel): the
  store's Stripe account, named by the store's id and its owner's account,
  never the member's. Setting the account up is the owner's alone.
*/
async function paymentsCreator(action: string, body: Record<string, unknown>): Promise<{ creator: CreatorRef; who: Extract<MoneyCaller, { ok: true }> } | NextResponse> {
  const level = paymentsActionLevel(action, body)
  const who = await moneyCaller("payouts", level === "owner" ? "manage" : level)
  if (!who.ok) return who.response.status === 401 ? NextResponse.json({ error: "Sign in to use this." }, { status: 401, headers: NO_STORE }) : who.response
  if (level === "owner" && !who.isOwner) return NextResponse.json({ error: "Only the store's owner can set up or change the payment account itself." }, { status: 403, headers: NO_STORE })
  return { creator: { id: who.creatorId, userId: who.ownerUserId, email: who.ownerEmail }, who }
}

/*
 * Every answer that is not a success is one JSON line in the Vercel log:
 * which action, what the seller was told and its code. A 4xx is a warning
 * (the seller can act on it), a 5xx an error. Search the log for
 * "payments_api_problem" to see what sellers are being told.
 */
function problem(e: unknown, action: string, creatorId: string): NextResponse {
  if (e instanceof PaymentsProblem) {
    const line = JSON.stringify({ evt: "payments_api_problem", action, creator: creatorId, status: e.status, code: e.code, shown: e.userMessage.slice(0, 200) })
    if (e.status >= 500) console.error(line)
    else console.warn(line)
    return NextResponse.json({ error: e.userMessage, code: e.code }, { status: e.status, headers: NO_STORE })
  }
  console.error(JSON.stringify({ evt: "payments_api_problem", action, creator: creatorId, status: 500, code: "unexpected", msg: describe(e) }))
  return NextResponse.json({ error: "Something went wrong on our side. Nothing was changed. Try again in a minute, and if it keeps happening write to support@storelib.com.", code: "retry" }, { status: 500, headers: NO_STORE })
}

export async function GET(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params
  if (action !== "overview") return NextResponse.json({ error: "Not found." }, { status: 404 })
  const found = await paymentsCreator("overview", {})
  if (found instanceof NextResponse) return found
  const creator = found.creator
  try {
    /* Opening Payouts: the webhook keeps the account current, so Stripe is only asked when the copy is old. */
    return NextResponse.json(await overview(creator, { sync: "stale", ipCountry: ipCountryOf(request) }), { headers: NO_STORE })
  } catch (e) {
    return problem(e, "overview", creator.id)
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params
  /* A document arrives as a file; everything else is JSON. */
  const form = action === "document" ? await request.formData().catch(() => null) : null
  const body = action === "document" ? {} : (((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>)
  const found = await paymentsCreator(action, body)
  if (found instanceof NextResponse) return found
  const creator = found.creator

  /* Reads the flow makes on its own (polling for Stripe's answer) must not spend the budget for writes. */
  const reads = action === "details-form" || action === "identity-status" || action === "refresh" || action === "component" || action === "hosted-setup" || action === "app-sheet"
  const limited = await rateLimit({
    bucket: reads ? "payments-read" : "payments-setup",
    subjects: [creator.id],
    windows: reads ? LIMITS.paymentsRead : LIMITS.paymentsSetup,
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
          /* The form's Account Session made beside the overview: Stripe's first frame needs no request of its own after Continue. */
          session: body.session === true,
        })
        return NextResponse.json(started, { headers: NO_STORE })
      }
      case "component": {
        const purpose =
          body.purpose === "stripe_payouts" || body.purpose === "stripe_onboarding" || body.purpose === "stripe_management"
            ? body.purpose
            : null
        if (!purpose) return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE })
        if (purpose === "stripe_payouts") await recordTeamAction(found.who, found.who.userId, "payouts_manage", "payout_account_opened", { action: "component" })
        return NextResponse.json(await componentAuth(creator, purpose), { headers: NO_STORE })
      }
      case "app-sheet": {
        const form = body.form === "bank" ? "bank" : "setup"
        const token = signSheetLink({ c: creator.id, u: creator.userId, f: form })
        await recordTeamAction(found.who, found.who.userId, "payouts_manage", "payout_account_opened", { action: "app-sheet", form })
        if (!token) {
          console.error(JSON.stringify({ evt: "payments_api_problem", action, creator: creator.id, status: 503, code: "platform_setup", msg: "app sheet link not signed: set ORDER_LINK_SECRET (or SUPABASE_SERVICE_ROLE_KEY) in Vercel" }))
          return NextResponse.json({ error: "Setup can't open in the app right now because of a setting on our side. Open storelib.com/app/payouts in your browser to finish, or write to support@storelib.com.", code: "platform_setup" }, { status: 503, headers: NO_STORE })
        }
        return NextResponse.json({ url: `${originOf(request)}/payouts-sheet#f=${form}&t=${encodeURIComponent(token)}` }, { headers: NO_STORE })
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
        const form = await submitDetails(creator, body, { ip: callerAddress(request), userAgent: request.headers.get("user-agent") })
        return NextResponse.json({ form, overview: await overview(creator) }, { headers: NO_STORE })
      }
      case "document": {
        const file = form?.get("file")
        const result = await uploadDocument(creator, { which: String(form?.get("which") ?? ""), side: String(form?.get("side") ?? ""), file: file instanceof File ? file : null })
        return NextResponse.json({ form: result }, { headers: NO_STORE })
      }
      case "bank": {
        const form = await addBank(creator, body)
        /* A team member's change of the payout bank is on the record with their name (lib/team/areas). */
        await recordTeamAction(found.who, found.who.userId, "payouts_manage", "payout_account_opened", { action: "bank" })
        return NextResponse.json({ form, overview: await overview(creator) }, { headers: NO_STORE })
      }
      case "identity": {
        await prepareVerification(creator)
        /*
         * WHERE STRIPE SENDS THEM BACK TO. A browser goes to Payouts with
         * ?setup=1, which reopens the panel on the step that is left. The
         * phone app runs the page in its own sheet, so it comes back to the
         * small page the app closes behind it.
         */
        const origin = originOf(request)
        const started = await startVerification(creator, {
          returnUrl: body.inApp === true ? `${origin}/stripe-done` : `${origin}/app/payouts?setup=1`,
          refreshUrl: `${origin}/app/payouts?setup=1`,
        })
        return NextResponse.json(started, { headers: NO_STORE })
      }
      case "hosted-setup": {
        /*
          The app's sheet comes back to /stripe-done, outside /app: the sheet is the system browser's, without the app's
          sign in, and an /app address there was sent to the log in page. Anywhere else comes back to setup.
        */
        const origin = originOf(request)
        const started = await startHostedSetup(creator, {
          returnUrl: body.inApp === true ? `${origin}/stripe-done` : `${origin}/app/payouts?setup=1`,
          refreshUrl: body.inApp === true ? `${origin}/stripe-done?again=1` : `${origin}/app/payouts?setup=1`,
        })
        return NextResponse.json(started, { headers: NO_STORE })
      }
      case "identity-status": {
        const view = await verificationStatus(creator)
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
        return NextResponse.json(await overview(creator, { ipCountry: ipCountryOf(request) }), { headers: NO_STORE })
      }
      case "notify-country": {
        return NextResponse.json(await askForCountry(creator.id, typeof body.country === "string" ? body.country : ""), { headers: NO_STORE })
      }
      default:
        return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE })
    }
  } catch (e) {
    return problem(e, action, creator.id)
  }
}

/**
 * Where Stripe's hosted page sends them back to: the address they are on. Not the
 * configured site URL, which on a preview deployment testing the sandbox is
 * still storelib.com and would drop them on production.
 */
/* Where Connect sends them back to: the origin the request came in on only when it is Storelib's own, else the platform (lib/billing/return-url). */
function originOf(request: NextRequest): string {
  return trustedRequestOrigin(request.nextUrl.toString()).replace(/\/+$/, "")
}

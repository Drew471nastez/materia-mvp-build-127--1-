import "server-only"

/**
 * ===========================================================================
 *  VERIFY ID, THE WAY EVERY CONNECTED ACCOUNT ALREADY HAS
 * ===========================================================================
 * A Connect account carries its own identity verification. Stripe opens a
 * hosted page for that one account (`accountLinks.create`), collects and
 * checks the document itself, and sends the person back to Storelib. Nothing
 * has to be switched on in the Stripe dashboard, there is no per check bill,
 * and afterwards the account's own `requirements` say whether anything is
 * still owed.
 *
 * Stripe Identity is kept as the better screen where it is really available
 * (lib/payments/stripe/identity.ts probes that and remembers the answer). It
 * is tried first and falls through quietly; a creator never learns which of
 * the two ran, and never reads a word of Stripe's own.
 *
 * COMING BACK. `return_url` is Storelib's own payouts page with ?setup=1, so
 * the panel reopens on whatever step is left (the bank, usually). The phone
 * app runs the page in the sheet over the app instead, and comes back to
 * /app/payouts/identity-done, which the app closes. `refresh_url` is the same
 * page: a link that has expired, or a page reloaded hours later, lands on
 * Storelib rather than on a Stripe error.
 */
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { readCreatorStripe, syncStripeAccount, type PaymentsCreatorRef } from "./connect"
import { documentDue, identityOnForPlatform, identityStatus, startIdentity, type IdentityStatus } from "./identity"
import { stripeErrorMessage } from "./setup-errors"
import { idOutstanding } from "./status"
import { verifyWay, type VerifyReason, type VerifyWay } from "../verify-id"

/** Stripe's words with every run of digits taken out, for a log line that can carry no ID. */
function quiet(error: unknown): string {
  return stripeErrorMessage(error).replace(/\d{2,}/g, "#").replace(/\s+/g, " ").slice(0, 160)
}

export interface VerifyStart {
  ok: true
  way: VerifyWay
  /** Stripe's hosted page: the Connect account link, or Identity's own page. */
  url: string | null
  /** Identity's modal secret, on the web, when Identity is the way. */
  clientSecret: string | null
  publishableKey: string
}

export interface VerifyStop {
  ok: false
  /** One word for us. The creator reads `verifyLine(reason)` (lib/payments/verify-id.ts). */
  reason: VerifyReason
}

/** Where the person lands when Stripe is done with them. */
export interface VerifyReturn {
  returnUrl: string
  refreshUrl: string
}

/** Anything Stripe is still waiting for, the payout bank aside: the bank is its own step. */
function verificationOwed(account: Stripe.Account): boolean {
  const req = account.requirements
  const pending = new Set(req?.pending_verification ?? [])
  const due = [...new Set([...(req?.past_due ?? []), ...(req?.currently_due ?? [])])].filter((k) => k !== "external_account" && !pending.has(k))
  return due.length > 0 || documentDue(account) || idOutstanding(account)
}

async function accountOf(creator: PaymentsCreatorRef): Promise<Stripe.Account | VerifyStop> {
  const row = await readCreatorStripe(creator.id)
  if (!row?.stripe_account_id) return { ok: false, reason: "no_account" }
  try {
    return await stripe.accounts.retrieve(row.stripe_account_id, { timeout: 20_000, maxNetworkRetries: 1 })
  } catch (error) {
    console.error("[verify id] account read", quiet(error))
    return { ok: false, reason: "offline" }
  }
}

/**
 * Stripe's own hosted verification for this one account. `account_update`
 * once Stripe has the account's details, `account_onboarding` before that:
 * the first opens on what is still owed, the second walks the whole of it.
 * Only `currently_due` is collected, so nobody is asked for something Stripe
 * has not asked us for.
 */
async function connectLink(account: Stripe.Account, where: VerifyReturn): Promise<string | null> {
  try {
    const link = await stripe.accountLinks.create(
      {
        account: account.id,
        type: account.details_submitted ? "account_update" : "account_onboarding",
        collection_options: { fields: "currently_due", future_requirements: "omit" },
        return_url: where.returnUrl,
        refresh_url: where.refreshUrl,
      },
      { timeout: 20_000, maxNetworkRetries: 1 },
    )
    return link.url || null
  } catch (error) {
    /*
     * ONE SETTING CAN STOP ALL OF THIS, so it is named in the log rather than
     * left as another refusal. Stripe will not build a hosted page for a
     * connected account until the platform's Connect branding (an icon and a
     * colour) is saved in the Stripe dashboard, under Settings, Connect,
     * Branding. It is set once and it is the only hint we would get.
     */
    const why = stripeErrorMessage(error)
    if (/branding|icon|logo|platform profile|business profile/i.test(why)) {
      console.error("[verify id] Stripe will not make the verification page until the platform's Connect branding is saved in the Stripe dashboard (Settings, Connect, Branding)", quiet(error))
    } else {
      console.error("[verify id] account link", quiet(error))
    }
    return null
  }
}

/**
 * OPEN VERIFY ID. Identity where it is there, Connect's hosted page
 * otherwise, and one word back when neither can run.
 */
export async function startVerification(creator: PaymentsCreatorRef, where: VerifyReturn): Promise<VerifyStart | VerifyStop> {
  if (verifyWay({ identityOn: await identityOnForPlatform() }) === "identity") {
    const identity = await startIdentity(creator, where.returnUrl)
    if (identity.ok) {
      return { ok: true, way: "identity", url: identity.url, clientSecret: identity.clientSecret, publishableKey: identity.publishableKey }
    }
    /* Stripe has what it needs already: that is an answer, not a fall through. */
    if (identity.reason === "nothing_to_verify") return { ok: false, reason: "nothing_to_verify" }
    console.warn(`[verify id] identity stood down (${identity.reason}); going through Connect`)
  }

  const account = await accountOf(creator)
  if ("ok" in account) return account
  if (!verificationOwed(account)) return { ok: false, reason: "nothing_to_verify" }

  const url = await connectLink(account, where)
  /* Stripe would not make the page. Whatever the cause, the creator's move is the same one. */
  if (!url) return { ok: false, reason: "link_failed" }
  return { ok: true, way: "connect", url, clientSecret: null, publishableKey: "" }
}

/**
 * THE WHOLE SETUP ON STRIPE'S PAGE, FOR THE PHONE APP ONLY WHEN IT HAS TO BE.
 * An account Stripe collects for (requirement_collection "stripe") makes
 * the embedded form ask the creator to sign in to Stripe in a window of its
 * own. That window is opened from inside Stripe's frame, and an app built
 * before it could hold such windows sends it to Safari. There the setup is
 * this page instead, in the sheet that slides over the app, and the sheet
 * comes back to /app/payouts/identity-done. `account_onboarding` until the
 * details are in, `account_update` after; the same fields the embedded form
 * asks for (payments-setup-flow.tsx SETUP_COLLECTION, eventually due).
 */
export async function startHostedSetup(creator: PaymentsCreatorRef, where: VerifyReturn): Promise<{ ok: true; url: string } | VerifyStop> {
  const account = await accountOf(creator)
  if ("ok" in account) return account
  try {
    const link = await stripe.accountLinks.create(
      {
        account: account.id,
        type: account.details_submitted ? "account_update" : "account_onboarding",
        collection_options: { fields: "eventually_due", future_requirements: "omit" },
        return_url: where.returnUrl,
        refresh_url: where.refreshUrl,
      },
      { timeout: 20_000, maxNetworkRetries: 1 },
    )
    return link.url ? { ok: true, url: link.url } : { ok: false, reason: "link_failed" }
  } catch (error) {
    console.error("[hosted setup] account link", quiet(error))
    return { ok: false, reason: "link_failed" }
  }
}

export interface VerifyView {
  status: IdentityStatus
  /** Why Stripe could not finish, in words a creator can act on. Never Stripe's own. */
  problem: string | null
}

/**
 * HOW FAR THE CHECK HAS GOT. On the Identity path that is the session. On the
 * Connect path Stripe tells us by clearing the requirement, so the account is
 * read again: a document on file or sitting in pending_verification is the
 * step done, and anything else is simply not back yet.
 */
export async function verificationStatus(creator: PaymentsCreatorRef): Promise<VerifyView> {
  if (verifyWay({ identityOn: await identityOnForPlatform() }) === "identity") return identityStatus(creator)
  await syncStripeAccount(creator.id, "creator").catch(() => undefined)
  const account = await accountOf(creator)
  if ("ok" in account) return { status: "none", problem: null }
  const pending = new Set(account.requirements?.pending_verification ?? [])
  if (pending.has("individual.verification.document")) return { status: "processing", problem: null }
  if (!documentDue(account)) return { status: "verified", problem: null }
  return { status: "none", problem: null }
}

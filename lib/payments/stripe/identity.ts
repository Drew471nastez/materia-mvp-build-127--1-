import "server-only"

/**
 * ===========================================================================
 *  STRIPE IDENTITY: THE LIVE ID CHECK
 * ===========================================================================
 * Storelib's own form collects the plain details (lib/payments/stripe/own-form),
 * but proving that the person holding the ID is the person on it is not
 * something a form can do. That is Stripe Identity: Stripe's own screen scans
 * the document live (no uploading an old photo), takes a selfie, and matches
 * the face to the document.
 *
 *   `related_person` ties the session to this creator's connected account and
 *   its individual, so when Stripe verifies it, Stripe itself clears the
 *   account's `individual.verification.document` requirement. Storelib never
 *   handles the document, the selfie or the biometric comparison, and never
 *   sees any of it: it only ever learns whether Stripe is satisfied.
 *
 * TWO WAYS IN, BOTH STRIPE'S OWN:
 *   client_secret   the modal, on the web (stripe.verifyIdentity)
 *   url             Stripe's hosted page, which the phone app opens in its
 *                   in-app browser sheet. The app's web view blocks Stripe's
 *                   frames on purpose (proxy.ts), and a camera inside a
 *                   cross-origin frame in a web view is the sort of thing
 *                   that broke setup here before, so the app takes the page.
 *
 * IT IS NEVER THE ONLY WAY. Identity has to be switched on for the platform
 * and does not cover every country. When a session cannot be made, this says
 * why in one word and the form falls back to Storelib's own camera, which is
 * the path Stripe accepts as an uploaded document.
 */
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { PaymentsProblem } from "../errors"
import { publishableKeyForSession, readCreatorStripe, runsInStorelib, syncStripeAccount, type PaymentsCreatorRef } from "./connect"
import { stripeErrorMessage } from "./setup-errors"
import { idOutstanding } from "./status"

/** Why there is no Stripe Identity for this creator; the form falls back to its own camera. */
export type IdentityUnavailable = "not_enabled" | "no_account" | "not_ours" | "no_person" | "nothing_to_verify" | "failed"

/** Stripe's own sentence, with every id, token and secret taken out, short enough to read on a step. */
function safeDetail(error: unknown): string | undefined {
  const raw = stripeErrorMessage(error)
  if (!raw) return undefined
  const clean = raw
    .replace(/\b(acct|vs|req|cs|pi|file|person|ba|sk|pk|rk)_[A-Za-z0-9_]+/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
  return clean.length > 2 ? clean.slice(0, 180) : undefined
}

export interface IdentityStart {
  ok: true
  /** Stripe's modal, on the web. */
  clientSecret: string | null
  /** Stripe's hosted page, for the phone app's in-app browser. */
  url: string | null
  publishableKey: string
  status: IdentityStatus
}

export type IdentityStatus = "none" | "requires_input" | "processing" | "verified" | "canceled"

export interface IdentityView {
  status: IdentityStatus
  /** Why Stripe could not finish, in words a creator can act on. */
  problem: string | null
}

/** Stripe's own words are for developers; these are for the person holding the ID. */
const ERRORS: Record<string, string> = {
  document_expired: "That document has expired. Use one that is still valid.",
  document_unverified_other: "Stripe could not verify that document. Try again, or use a different one.",
  document_type_not_supported: "That kind of document is not accepted here. Use a passport, ID card or driving licence.",
  selfie_document_missing_photo: "That document has no photo to match your face to. Use a passport, ID card or driving licence.",
  selfie_face_mismatch: "The selfie did not match the photo on the document. Try again in good light.",
  selfie_unverified_other: "Stripe could not check the selfie. Try again in good, even light.",
  selfie_manipulated: "Stripe could not accept that selfie. Take a new one, looking straight at the camera.",
  under_supported_age: "You need to be 18 or older to be paid out.",
  country_not_supported: "Stripe cannot check an ID from that country this way. You can add a photo of it instead.",
  consent_declined: "You did not agree to the check, so nothing was verified.",
  device_not_supported: "This device cannot run the check. Try another, or add a photo of your ID instead.",
  abandoned: "The check was not finished.",
}

function words(code: string | null | undefined): string | null {
  if (!code) return null
  return ERRORS[code] ?? "Stripe could not finish the check. Try again, or add a photo of your ID instead."
}

function quiet(error: unknown): string {
  return stripeErrorMessage(error).replace(/\d{2,}/g, "#").replace(/\s+/g, " ").slice(0, 160)
}

/**
 * IS IT REALLY "IDENTITY IS NOT SWITCHED ON"?
 *
 * This used to answer yes to any error with the word "identity" in it, which
 * is nearly every error the Identity API can return, including a parameter
 * Stripe did not like. So a wrong parameter was reported to the creator as
 * "Stripe's ID check is not switched on for Storelib", and the real cause
 * never reached anybody. It now wants Stripe to actually say the account is
 * not activated or not permitted, and everything else keeps its own words.
 */
function notEnabled(error: unknown): boolean {
  const message = stripeErrorMessage(error).toLowerCase()
  if (/unknown parameter|invalid|not a valid|must be|cannot be used|no longer supported/.test(message)) return false
  return /not activated|not enabled|activate .*identity|identity .*(is not|isn't) (activated|enabled)|enable .*identity|permission|not allowed to use/.test(message)
}

async function accountAndPerson(creator: PaymentsCreatorRef): Promise<{ account: Stripe.Account; personId: string } | IdentityUnavailable> {
  const row = await readCreatorStripe(creator.id)
  if (!row?.stripe_account_id) return "no_account"
  let account: Stripe.Account
  try {
    account = await stripe.accounts.retrieve(row.stripe_account_id)
  } catch (error) {
    console.error("[identity] account read", quiet(error))
    return "failed"
  }
  /* Only an account whose requirements Storelib runs: Stripe collects its own elsewhere. */
  if (!runsInStorelib(account)) return "not_ours"
  const personId = account.individual?.id
  if (!personId) return "no_person"
  return { account, personId }
}

/**
 * Whether Stripe needs the document NOW: due today, or Stripe's own
 * alternative to something due today (the national ID number, or the ID).
 * Not eventually_due: a check, and its cost, only when Stripe asks for it.
 */
function documentDue(account: Stripe.Account): boolean {
  const req = account.requirements
  /* The ID check is the last step of setup, so it may start as soon as Stripe lists the document, even under eventually_due (lib/payments/stripe/own-form.ts viewOf). */
  const due = new Set([...(req?.past_due ?? []), ...(req?.currently_due ?? []), ...(req?.eventually_due ?? [])])
  const pending = new Set(req?.pending_verification ?? [])
  /* Stripe Identity fills individual.verification.document and proof_of_liveness, and nothing else: an additional_document or a company document it cannot (docs.stripe.com/connect/handling-api-verification). */
  const isDoc = (k: string) => /^individual\.verification\.(document|proof_of_liveness)$/.test(k) && !pending.has(k)
  if ([...due].some(isDoc)) return true
  /* Verify ID is always step two of setup, until Stripe holds an ID (lib/payments/stripe/status.ts idOutstanding). */
  if (idOutstanding(account)) return true
  return (req?.alternatives ?? []).some((alt) => alt.alternative_fields_due.some(isDoc) && alt.original_fields_due.some((k) => due.has(k) && !pending.has(k)))
}

/**
 * A session for this creator, reused while one is still open. A session costs
 * money each time it is made, and one that was started and left is the one to
 * carry on with; after twelve hours its secret and its link are near enough
 * expiry that a fresh one is kinder than a dead link.
 */
async function openSession(creatorId: string): Promise<Stripe.Identity.VerificationSession | null> {
  try {
    const list = await stripe.identity.verificationSessions.list({ client_reference_id: creatorId, status: "requires_input", limit: 3 })
    const fresh = list.data.find((s) => s.created * 1000 > Date.now() - 12 * 3600 * 1000 && (s.client_secret || s.url))
    return fresh ?? null
  } catch {
    return null
  }
}

/**
 * Start (or carry on) the live check. `returnUrl` is where Stripe's hosted
 * page sends the person when they are done, for the phone app's sheet.
 */
export async function startIdentity(creator: PaymentsCreatorRef, returnUrl: string): Promise<IdentityStart | { ok: false; reason: IdentityUnavailable; detail?: string }> {
  const found = await accountAndPerson(creator)
  if (typeof found === "string") return { ok: false, reason: found }
  const { account, personId } = found
  if (!documentDue(account)) return { ok: false, reason: "nothing_to_verify" }

  const existing = await openSession(creator.id)
  if (existing) {
    return { ok: true, clientSecret: existing.client_secret ?? null, url: existing.url ?? null, publishableKey: publishableKeyForSession(), status: "requires_input" }
  }

  try {
    /*
     * EXACTLY WHAT STRIPE DOCUMENTS, AND NOTHING MORE.
     * docs.stripe.com/connect/handling-api-verification, "Hosted document
     * collection with Stripe Identity": type, related_person, and that is
     * all. We used to send
     * options.document.require_live_capture/require_matching_selfie as well.
     * Stripe decides how to check a person it already has requirements for,
     * and those options made the create fail; the failure said "identity" in
     * it, which the check above read as Identity being switched off. A
     * selfie is only ours to ask for where the requirement is
     * proof_of_liveness, which is what Stripe's own example for that one
     * shows.
     */
    const liveness = [...(account.requirements?.past_due ?? []), ...(account.requirements?.currently_due ?? []), ...(account.requirements?.eventually_due ?? [])].some((k) =>
      /^individual\.verification\.proof_of_liveness$/.test(k),
    )
    const session = await stripe.identity.verificationSessions.create(
      {
        type: "document",
        client_reference_id: creator.id,
        related_person: { account: account.id, person: personId },
        ...(liveness ? { options: { document: { require_matching_selfie: true } } } : {}),
        return_url: returnUrl,
        metadata: { storelib_creator_id: creator.id },
      },
      { idempotencyKey: `storelib:identity:${creator.id}:${Math.floor(Date.now() / 60000)}`, timeout: 20_000, maxNetworkRetries: 1 },
    )
    return { ok: true, clientSecret: session.client_secret ?? null, url: session.url ?? null, publishableKey: publishableKeyForSession(), status: "requires_input" }
  } catch (error) {
    const reason: IdentityUnavailable = notEnabled(error) ? "not_enabled" : "failed"
    console.error(`[identity] session not made (${reason})`, quiet(error))
    /* What Stripe said, trimmed and stripped of ids, so the step can name the real cause instead of guessing. */
    return { ok: false, reason, detail: reason === "failed" ? safeDetail(error) : undefined }
  }
}

/** Where the check has got to, and why it stopped if it did. Syncs the account so the form sees the requirement clear. */
export async function identityStatus(creator: PaymentsCreatorRef): Promise<IdentityView> {
  try {
    const list = await stripe.identity.verificationSessions.list({ client_reference_id: creator.id, limit: 3 })
    const latest = list.data[0]
    if (!latest) return { status: "none", problem: null }
    if (latest.status === "verified" || latest.status === "processing") {
      await syncStripeAccount(creator.id, "creator").catch(() => undefined)
    }
    return { status: latest.status as IdentityStatus, problem: latest.status === "requires_input" ? words(latest.last_error?.code) : null }
  } catch (error) {
    console.error("[identity] status", quiet(error))
    return { status: "none", problem: null }
  }
}

/** The modal's key, for a page that will open Stripe's own screen. */
export function identityPublishableKey(): string {
  const key = publishableKeyForSession()
  if (!key) throw new PaymentsProblem("Payments are not configured.", 503)
  return key
}

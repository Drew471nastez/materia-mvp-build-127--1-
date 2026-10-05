/**
 * ===========================================================================
 *  VERIFY ID: WHICH WAY IT RUNS, AND WHAT THE CREATOR IS TOLD
 * ===========================================================================
 * Step two of Set up payouts asks Stripe to check the creator's ID. There are
 * two ways to do that and only one of them is always there.
 *
 *   CONNECT       a connected account already carries its own identity
 *                 verification. Stripe collects and checks the document on
 *                 its own hosted page, the page comes back to Storelib, and
 *                 the account's `requirements` then say whether anything is
 *                 still owed. It costs nothing per check and needs nothing
 *                 switched on. THIS IS THE PATH THAT RUNS.
 *   IDENTITY      Stripe Identity, a separate Stripe product. An account
 *                 admin has to switch it on in the Stripe dashboard and it is
 *                 billed per check. It runs only where it is genuinely
 *                 available, which the server probes for and remembers.
 *
 * Storelib never sees or keeps the document either way: both are Stripe's own
 * screen on Stripe's own origin.
 *
 * WHY THIS FILE IS PURE. The reasons and the sentences are read by the server
 * (lib/payments/stripe/hosted-verification.ts) and by the step the creator
 * looks at (components/app/settings/payments-setup-flow.tsx), so there is one
 * list of words rather than two that drift apart. Nothing here imports Stripe.
 */

/** Which of Stripe's two checks the step opens. */
export type VerifyWay = "identity" | "connect"

/** Why Verify ID could not open, in one word. Never shown; `verifyLine` says it in Storelib's words. */
export type VerifyReason =
  | "no_account"
  | "not_ours"
  | "no_person"
  | "nothing_to_verify"
  | "link_failed"
  | "offline"

/**
 * STRIPE REFUSING IDENTITY, rather than refusing this particular request.
 *
 * "Your account is not set up to use Identity. Please have an account admin
 * visit to get started" is the one the owner met: Stripe sends it as
 * `account_not_set_up`, and the product has to be switched on by hand before
 * any call works. `resource_missing` comes back the same way when the
 * Identity endpoints are not there for this platform at all. Both mean the
 * same thing for us: there is no Identity here, so take the Connect path and
 * say nothing about it to the creator.
 */
const REFUSAL_CODES = new Set(["account_not_set_up", "resource_missing", "account_invalid", "api_key_expired"])
const REFUSAL_WORDS =
  /not set up to use identity|account admin|not activated|not enabled|enable .*identity|identity .*(is not|isn't) (activated|enabled)|no such|unrecognized request url|not allowed to use|permission/i

/** Stripe has no Identity for this platform, whatever shape the refusal arrived in. */
export function identityUnavailable(error: unknown): boolean {
  if (!error) return false
  const e = error as { code?: unknown; statusCode?: unknown; message?: unknown; raw?: { code?: unknown; message?: unknown } }
  const code = typeof e.code === "string" ? e.code : typeof e.raw?.code === "string" ? e.raw.code : ""
  if (REFUSAL_CODES.has(code)) return true
  const message = `${typeof e.raw?.message === "string" ? e.raw.message : ""} ${typeof e.message === "string" ? e.message : ""}`
  if (/unknown parameter|not a valid|must be|no longer supported/i.test(message)) return false
  return REFUSAL_WORDS.test(message)
}

/**
 * The way the step takes. Identity only where the platform really has it;
 * otherwise Connect's own hosted verification, which every connected account
 * has. A probe that could not answer counts as "not there": the Connect path
 * works either way, so a creator is never held up by it.
 */
export function verifyWay(state: { identityOn: boolean }): VerifyWay {
  return state.identityOn ? "identity" : "connect"
}

/**
 * ONE CALM SENTENCE, with what to do next. Stripe's own text, its codes and
 * its account ids never appear here: a creator met "Stripe would not start
 * the check: Your account is not set up to use Identity. Please have an
 * account admin visit to get started" and had nothing they could do with it.
 */
const LINES: Record<VerifyReason, string> = {
  no_account: "Your payments account is not ready for this yet. Go back a step, then try again.",
  not_ours: "Your payments account is not ready for this yet. Go back a step, then try again.",
  no_person: "Your name and date of birth have to be in before Stripe can check your ID. Go back a step and finish those.",
  nothing_to_verify: "Stripe is not asking for your ID right now. Press Continue to carry on.",
  link_failed: "We could not open the ID check just now. Try again in a moment.",
  offline: "We could not reach Stripe just now. Try again in a moment.",
}

export function verifyLine(reason: string | undefined | null): string {
  if (reason && reason in LINES) return LINES[reason as VerifyReason]
  return LINES.link_failed
}

/** Every sentence this file can show a creator, for a suite that reads them all. */
export const VERIFY_LINES: readonly string[] = Object.values(LINES)

/**
 * ANYTHING THAT SMELLS OF STRIPE'S OWN WIRE. Account ids, keys, tokens, error
 * codes and the words only an API reads. Used to keep a message from a server
 * out of a creator's way wherever one can still arrive
 * (components/app/settings/payments-setup-flow.tsx `safe`).
 */
const WIRE =
  /\b(acct|accs|accl|btok|vs_|cs_|pi_|file_|person_|ba_|sk_|pk_|rk_|whsec)|invalid_request|resource_missing|account_not_set_up|parameter|capability|requirement|api[ _]key|account admin|StripeError|HTTP \d{3}/i

/** True when this text should never be put in front of a creator. */
export function readsLikeStripe(message: string): boolean {
  return WIRE.test(message)
}

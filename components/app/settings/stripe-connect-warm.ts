/**
 * ===========================================================================
 *  STRIPE'S FORM, STARTED BEFORE IT IS ASKED FOR
 * ===========================================================================
 * Nov 23 2026, the owner: the setup form loads too slowly. It was a line of
 * waits after the press: the Account Session request, then (only once it
 * answered) Stripe's connect.js download, then Stripe's frame. Three things
 * get it moving earlier:
 *
 *   WARM     on intent (a pointer over, a focus or a press on Set up payouts)
 *            and while the country step is on screen: a preconnect to
 *            Stripe's hosts and a preload of connect.js, so the script is in
 *            the cache by the time the form asks for it. A preload does not
 *            run the script, so Stripe opens no frame before the form does.
 *   PREFETCH the Account Session for an account that is going straight to
 *            Stripe's form, started on intent, held here for a short while
 *            and handed to the form once (a client secret is single use).
 *   PRIME    the session POST start already made beside the overview
 *            (lib/payments/stripe/overview stripeStartOnboarding), held the
 *            same way.
 *
 * The phone apps never draw Stripe's form in their own web view (the
 * browser sheet does, components/app/settings/payments-setup-flow
 * AppBrowserSetup), so nothing is warmed there.
 */
import { isNativeApp } from "@/lib/native-bridge"
import { readsLikeStripe } from "@/lib/payments/verify-id"
import { tt, msg } from "@/lib/i18n/text"

export type EmbeddedPurpose = "stripe_onboarding" | "stripe_management" | "stripe_payouts"
export interface AccountSession {
  clientSecret: string
  publishableKey: string
  stripeSignIn?: boolean
  /** Unix seconds, from Stripe. */
  expiresAt?: number | null
}

/** The script @stripe/connect-js/pure injects (node_modules/@stripe/connect-js/dist/pure.esm.js V1_URL). Same URL, no crossorigin, so the preload is reused. */
export const CONNECT_JS_URL = "https://connect-js.stripe.com/v1.0/connect.js"
/** How long a prefetched session is handed out. Stripe's own expiry is longer; this keeps a stale one from being claimed after a long pause. */
export const SESSION_FRESH_MS = 90_000

const LOAD_FAILED = msg("Try again in a moment.")

/** A refusal from the server, with its code for the page's next step (country_required, retry, platform_setup). */
export class SessionProblem extends Error {
  readonly code: string | null
  constructor(message: string, code: string | null) {
    super(message)
    this.code = code
  }
}

/*
 * The server's own sentence is shown as it is: it says what to do (lib/payments/stripe/setup-errors).
 * Only Stripe's wire (ids, keys, codes) is kept out (lib/payments/verify-id readsLikeStripe).
 */
export function shownError(message: string): string {
  if (!message || readsLikeStripe(message)) return tt(LOAD_FAILED)
  return message
}

/**
 * A fresh Account Session for the signed-in creator's own account. The
 * server resolves the account from the session cookie; nothing here names it.
 */
export async function fetchAccountSession(purpose: EmbeddedPurpose): Promise<AccountSession> {
  const res = await fetch("/api/payments/component", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ purpose }),
    cache: "no-store",
  }).catch(() => {
    throw new SessionProblem(tt("Your connection dropped. Check you are online, then try again."), "retry")
  })
  const data = (await res.json().catch(() => ({}))) as { clientSecret?: unknown; publishableKey?: unknown; stripeSignIn?: unknown; expiresAt?: unknown; error?: unknown; code?: unknown }
  const clientSecret = typeof data.clientSecret === "string" ? data.clientSecret.trim() : ""
  const publishableKey = typeof data.publishableKey === "string" ? data.publishableKey.trim() : ""
  if (!res.ok || !clientSecret.startsWith("accs_") || !publishableKey.startsWith("pk_")) {
    throw new SessionProblem(shownError(typeof data.error === "string" ? data.error : ""), typeof data.code === "string" ? data.code : null)
  }
  return { clientSecret, publishableKey, stripeSignIn: data.stripeSignIn === true, expiresAt: typeof data.expiresAt === "number" ? data.expiresAt : null }
}

let warmed = false

/** Preconnect to Stripe and preload connect.js, once per page. Safe to call on every hover. */
export function warmStripeConnect(): void {
  if (warmed || typeof document === "undefined" || isNativeApp()) return
  warmed = true
  try {
    const head = document.head
    const add = (rel: string, href: string, as?: string) => {
      if (head.querySelector(`link[rel="${rel}"][href="${href}"]`)) return
      const link = document.createElement("link")
      link.rel = rel
      link.href = href
      if (as) link.as = as
      link.setAttribute("data-stripe-warm", "")
      head.appendChild(link)
    }
    add("preconnect", "https://connect-js.stripe.com")
    add("preconnect", "https://api.stripe.com")
    if (!document.querySelector(`script[src="${CONNECT_JS_URL}"]`)) add("preload", CONNECT_JS_URL, "script")
  } catch {
    /* a page without a head: the form loads it when it opens */
  }
  /* The loader's own chunk, so the form does not wait for it either. */
  void import("@stripe/connect-js/pure").catch(() => {})
}

let held: { purpose: EmbeddedPurpose; at: number; promise: Promise<AccountSession> } | null = null

function fresh(h: typeof held, purpose: EmbeddedPurpose, now: number): h is NonNullable<typeof held> {
  return !!h && h.purpose === purpose && now - h.at < SESSION_FRESH_MS
}

/** Hold a session the server already made (POST start with `session`). */
export function primeAccountSession(purpose: EmbeddedPurpose, session: AccountSession, now = Date.now()): void {
  held = { purpose, at: now, promise: Promise.resolve(session) }
}

/** Start making a session now, for a form about to open. Does nothing when one is already held. */
export function prefetchAccountSession(purpose: EmbeddedPurpose, fetcher: (p: EmbeddedPurpose) => Promise<AccountSession> = fetchAccountSession, now = Date.now()): void {
  if (fresh(held, purpose, now)) return
  const promise = fetcher(purpose)
  held = { purpose, at: now, promise }
  /* A prefetch that failed is forgotten: the form asks again and shows that answer. */
  promise.catch(() => {
    if (held?.promise === promise) held = null
  })
}

/**
 * The held session, once: the next caller gets none. Null when nothing fresh
 * is held, or the held one failed or is close to Stripe's own expiry; the
 * caller then asks for its own.
 */
export function takeAccountSession(purpose: EmbeddedPurpose, now = Date.now()): Promise<AccountSession | null> | null {
  const h = held
  held = null
  if (!fresh(h, purpose, now)) return null
  return h.promise.then(
    (s) => (s.expiresAt && s.expiresAt * 1000 - Date.now() < 60_000 ? null : s),
    () => null,
  )
}

/** Forget whatever is held (the account changed: another country, a disconnect). */
export function dropAccountSession(): void {
  held = null
}

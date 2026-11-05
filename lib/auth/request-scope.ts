import "server-only"

import { cache } from "react"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { readCurrentUser, type CurrentUser } from "@/lib/auth/current-user"
import { verifierKind, type VerifierKind } from "@/lib/auth/verify-token"
import { sellerAccessFrom, type SellerAccess } from "@/lib/account/seller-access"
import { ServiceUnavailable, classifyServiceError, dataOrThrow, isServiceUnavailable } from "@/lib/net/service-error"
import { currentRequestId, logLine, logServiceFailure } from "@/lib/net/log"
import { lastGood } from "@/lib/net/last-good"
import { supabaseRetryBudget } from "@/lib/net/retry-budget"

/**
 * ===========================================================================
 *  THE SAME QUESTION, ASKED ONCE PER REQUEST
 * ===========================================================================
 * A layout and the page inside it both need to know who is signed in, and
 * both were asking Supabase separately. That is two auth round trips to
 * render one screen, and lib/auth/current-user.ts gives the first one a 3s
 * ceiling with a retry, so a bad moment on the auth service could be paid for
 * twice before anything was drawn.
 *
 * The same is true of the profile row: the library layout reads three columns
 * off it to decide whether to let somebody through, and the library page then
 * reads three different columns off the same row to put a name and a picture
 * at the top.
 *
 * React's `cache` is per request, not across requests. It holds nothing
 * between people and expires with the render, so this is deduplication and
 * not a cache of anybody's session.
 *
 * NOTHING HERE DECIDES ANYTHING. The answers, the classification of errors
 * and every redirect stay exactly where they were; this only stops the same
 * question being put on the wire twice.
 */
/*
  ===========================================================================
   ONCE PER REQUEST IN AN API ROUTE TOO (round 49)
  ===========================================================================
  React's `cache` dedupes inside a render (a layout, its page, their
  metadata). A route handler is not a render: there `cache` calls straight
  through, so a route that asked twice (its gate, then a helper) paid two
  Supabase Auth round trips. The answer is also kept on the request's own
  cookie store, which Next makes once per request and drops with it, so a
  route handler asks once as well. Nothing is kept between requests: the key
  is an object that lives exactly as long as the request.
*/
const perRequest = new WeakMap<object, Map<string, Promise<unknown>>>()

async function requestKey(): Promise<object | null> {
  try {
    const jar = (await cookies()) as unknown
    return jar && typeof jar === "object" ? (jar as object) : null
  } catch {
    return null
  }
}

/** `fn` once per request under `name`; outside a request (a script, a test with no cookie store) every call runs it. */
export async function oncePerRequest<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const key = await requestKey()
  if (!key) return fn()
  let held = perRequest.get(key)
  if (!held) perRequest.set(key, (held = new Map()))
  const seen = held.get(name) as Promise<T> | undefined
  if (seen) return seen
  const p = fn()
  held.set(name, p)
  /* A throw is not kept: the next ask in the request tries again. */
  p.catch(() => held!.delete(name))
  return p
}


/*
  ===========================================================================
   SUPABASE AUTH IS NOT ASKED FOR AN ORDINARY REQUEST (round 52)
  ===========================================================================
  The owner: "We could not check your sign in just now", on saves, publishes
  and settings everywhere, whenever Supabase Auth had a slow minute. Every
  request asked Auth (getUser, a round trip) who sent it, and every change
  waited for Auth itself to answer, with retries, before it did anything.

  Now the access token is checked here, by its signature, expiry, issuer,
  audience and role (lib/auth/verify-token.ts), and that is the answer:
  what Supabase recommends (getClaims) and exactly the check PostgREST makes
  on every query, so row level security sees the same person. Auth is asked
  only when the token cannot be checked here (no secret or public keys on
  this server) or does not check out, as before.

  What a signed token cannot show is a session ended within its own life.
  That window is the project's JWT expiry (Supabase: Authentication > Sessions
  "Access token expiry"; JWT Keys "JWT expiry limit"), and the routes where
  it matters still ask Auth itself: lib/auth/route-user `fresh: true`.

  fullUserForRequest is the old order (Auth first, the signature when Auth is
  slow), for the few readers that need what a token does not carry:
  email_confirmed_at and identities.
*/
export const currentUserForRequest = cache(
  (): Promise<CurrentUser> =>
    oncePerRequest("current-user", async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null
      void logVerifierOnce(url)
      const supabase = await createClient()
      const current = await readCurrentUser(supabase, { fallbackClaims: url, localFirst: true })
      return logDegraded(current)
    }),
)

/** Supabase Auth first, the token's signature when Auth is slow: for email_confirmed_at, identities and other fields a token does not carry. */
export const fullUserForRequest = cache(
  (): Promise<CurrentUser> =>
    oncePerRequest("full-user", async () => {
      const supabase = await createClient()
      /* When Supabase Auth does not answer, the token's signature is checked instead (lib/auth/current-user.ts). */
      const current = await readCurrentUser(supabase, { fallbackClaims: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null })
      return logDegraded(current)
    }),
)

/*
  WHICH CHECK THIS SERVER HAS, SAID ONCE PER INSTANCE (round 52). Without
  SUPABASE_JWT_SECRET (HS256) or published signing keys (JWKS) nothing can
  be checked here, every request asks Supabase Auth as before, and a slow
  Auth answers "We could not check your sign in just now" for everybody.
  Search the Vercel logs for "auth_verifier": mode hs256 or jwks is local,
  none is not. The line names the kind of check, never a key.
*/
let verifierLogged: Promise<VerifierKind> | null = null
export function logVerifierOnce(supabaseUrl: string | null | undefined): Promise<VerifierKind> {
  if (!verifierLogged) {
    verifierLogged = verifierKind(supabaseUrl)
      .catch((): VerifierKind => "none")
      .then((mode) => {
        const fields = { mode, local: mode !== "none", fix: mode === "none" ? "set SUPABASE_JWT_SECRET in Vercel, or move Supabase to asymmetric JWT signing keys" : null }
        if (mode === "none") console.warn(logLine("auth_verifier", fields))
        else console.info(logLine("auth_verifier", fields))
        return mode
      })
  }
  return verifierLogged
}

/** For tests: log it again on the next request. */
export function forgetVerifierLog() {
  verifierLogged = null
}

/* Logged, never decided on: a degraded answer is one JSON line (lib/net/log.ts) with the request's id. A token checked here first, with Auth never asked, carries no reason and is not degraded. */
function logDegraded(current: CurrentUser): CurrentUser {
  const degraded = current.verifiedBy === "claims" && current.reason ? "claims" : !current.user && current.state !== "anonymous" ? "indeterminate" : null
  if (degraded) {
    void Promise.all([currentRequestId(), verifierKind(process.env.NEXT_PUBLIC_SUPABASE_URL ?? null).catch(() => "none")]).then(([rid, verifier]) =>
      console.warn(logLine("auth_degraded", { outcome: degraded, reason: current.reason ?? "unknown", verifier, rid })),
    )
  }
  return current
}

export interface RequestProfile {
  display_name: string | null
  avatar_url: string | null
  username: string | null
  email_verified: boolean | null
  is_creator: boolean | null
  welcome_completed: boolean | null
}

/**
 * Every column the library shell and the library page between them need, in
 * one select. Row-level security still applies: this is the caller's own
 * client, so it can only ever return the caller's own row.
 */
/*
  READ ONCE, AND THE FAILURE KEPT (lib/net/service-error.ts). A read that
  failed used to come back as null, the same as no row, and the /app layout
  sent a seller whose profile read timed out to /signup/verify. The cached
  read keeps the failure beside the row: `profileForRequest` still answers
  null for it (an optional use, a name on a page), and
  `profileOrThrowForRequest` throws it, for the one caller that decides
  where somebody belongs from the answer.
*/
const profileRead = cache(async (userId: string): Promise<{ row: RequestProfile | null; failure: ServiceUnavailable | null; stale?: boolean }> => {
  const supabase = await createClient()
  return keptRead(`profile:${userId}`, async () => {
    const row = dataOrThrow(
      "profile",
      await supabase
        .from("profiles")
        .select("display_name, avatar_url, username, email_verified, is_creator, welcome_completed")
        .eq("id", userId)
        .maybeSingle(),
    )
    return (row as RequestProfile | null) ?? null
  })
})

/*
  ===========================================================================
   A FAILED READ OF ONE OF THE SHELL'S TWO ROWS (round 53)
  ===========================================================================
  Measured with scripts/check-app-resilience-r53.mjs: with 10% of database
  requests failing, the profile or the creator read failed on about one full
  /app load in five, and every one of those was the whole page "Storelib is
  not answering right now". The fetch underneath asks a read again only for
  a 502, a 504, a 429 or a dropped connection (lib/net/deadline.ts); a 503,
  a 500 statement timeout or a gateway's page reached the shell on the first
  try. Now:

    1  a read that failed with a blip (ServiceUnavailable.transient) is asked
       once more here, after RETRY_PAUSE_MS, paid from the instance's retry
       budget (lib/net/retry-budget). Both rows are one key lookup;
    2  still failing, the last row this instance read for the same person
       stands in (lib/net/last-good.ts), marked stale;
    3  only with neither is the failure handed on.

  A row the database gave, or "no row", is never replaced by a kept one.
*/
export const RETRY_PAUSE_MS = 250

async function keptRead<T>(key: string, read: () => Promise<T>): Promise<{ row: T | null; failure: ServiceUnavailable | null; stale?: boolean }> {
  let failure: ServiceUnavailable | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const row = await read()
      if (row !== null && row !== undefined) lastGood.remember(key, row)
      else lastGood.forget(key)
      return { row: row ?? null, failure: null }
    } catch (e) {
      if (!isServiceUnavailable(e)) throw e
      logServiceFailure(e)
      failure = e
      /* A query that will fail again is not asked again, and the retry is paid from the instance's budget (lib/net/retry-budget, round 50): in an outage the kept copy answers at once. */
      if (!e.transient || attempt > 0 || !supabaseRetryBudget.spend()) break
      await new Promise((r) => setTimeout(r, RETRY_PAUSE_MS + Math.round(Math.random() * 150)))
    }
  }
  const kept = lastGood.recall<T>(key)
  if (kept !== undefined) {
    void currentRequestId().then((rid) => console.warn(logLine("served_last_good", { where: key.split(":")[0], rid }))).catch(() => {})
    return { row: kept, failure: null, stale: true }
  }
  return { row: null, failure }
}

export const profileForRequest = cache(async (userId: string): Promise<RequestProfile | null> => (await profileRead(userId)).row)

/** The profile, or a ServiceUnavailable thrown when it could not be read (never null for a failure). */
export const profileOrThrowForRequest = cache(async (userId: string): Promise<RequestProfile | null> => {
  const { row, failure } = await profileRead(userId)
  if (failure) throw failure
  return row
})

/**
 * The columns of the creator row the /app shell reads (app/app/layout.tsx),
 * which cover what the pages that read it with their own client need too.
 */
export const SHELL_CREATOR_COLUMNS =
  "id, user_id, slug, username, display_name, avatar_url, bio, onboarding_completed, payouts_enabled, charges_enabled, store_published"

/**
 * THE SHELL'S PRIVATE COLUMNS, read apart. Run-now part 63 refuses these to a
 * visitor's client (lib/security/public-columns PRIVATE_CREATOR_COLUMNS), and
 * PostgREST answers a select naming one with an error, not a null: asked in
 * the one select above, the whole row came back empty and /app sent every
 * creator to /sell. They are read with the service role for the row the
 * caller's own client already returned, so nobody reads anyone else's.
 */
export const SHELL_PRIVATE_CREATOR_COLUMNS = "stripe_onboarding_status, stripe_account_id, subscription_plan_id, details_submitted, stripe_requirements, stripe_connected_at"

export interface RequestCreator {
  id: string
  user_id: string
  slug: string | null
  username: string | null
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  onboarding_completed: boolean | null
  payouts_enabled: boolean | null
  /** With payouts_enabled, whether Stripe can take a charge (lib/home/progress paymentsReadyFrom). */
  charges_enabled: boolean | null
  stripe_onboarding_status: string | null
  stripe_account_id: string | null
  /* What Home says about payments (lib/payments/stripe/readiness homePaymentsState). */
  details_submitted?: boolean | null
  stripe_requirements?: string[] | null
  stripe_connected_at?: string | null
  store_published: boolean | null
  /** The plan: "free", "growth" (Pro) or the earlier "pro" (lib/billing/plans). */
  subscription_plan_id: string | null
}

/**
 * The signed in person's creator row, once per request. The /app layout and
 * the pages under it that read it with the caller's own client (Products,
 * Customers, Coupons) asked for it separately on every full load. Same
 * client, same `user_id` filter, same row-level security: this only stops
 * the second copy of the question. The service role reads only the three private
 * columns of the row the caller's client returned (SHELL_PRIVATE_CREATOR_COLUMNS).
 */
/*
  A FAILED READ THROWS HERE TOO (round 51). It answered null, the same as "no store", and every page that
  asked decided from it: Home, Analytics and Orders sent a seller whose read timed out to /onboarding, then
  /sell, then /signup/verify ("Check your email"), Products and Community to /app. Measured with
  scripts/check-app-navigation-r51.mjs against a database answering 503: thrown out of the dashboard on 3 of
  4 page changes. Now the page throws a ServiceUnavailable, which app/app/error.tsx asks the server for again,
  quietly. null still means one thing: this account has no store.
*/
export const creatorForRequest = cache(async (userId: string): Promise<RequestCreator | null> => {
  const { row, failure } = await creatorRead(userId)
  if (failure) throw failure
  return row
})

/** The creator row, or a ServiceUnavailable thrown when it could not be read (never null for a failure). */
export const creatorOrThrowForRequest = cache(async (userId: string): Promise<RequestCreator | null> => {
  const { row, failure } = await creatorRead(userId)
  if (failure) throw failure
  return row
})

const creatorRead = cache(async (userId: string): Promise<{ row: RequestCreator | null; failure: ServiceUnavailable | null; stale?: boolean }> =>
  keptRead(`creator:${userId}`, () => creatorRow(userId)),
)

/**
 * The last good profile and creator rows this instance read for this person,
 * for a shell whose reads are slower than its ceiling (round 53): it draws
 * from them at once instead of waiting, or drawing from the session alone.
 * null unless both are kept. Never an answer for anybody else.
 */
export function keptShellRows(userId: string): [RequestProfile, RequestCreator] | null {
  const profile = lastGood.recall<RequestProfile>(`profile:${userId}`)
  const creator = lastGood.recall<RequestCreator>(`creator:${userId}`)
  return profile && creator ? [profile, creator] : null
}

async function creatorRow(userId: string): Promise<RequestCreator | null> {
  const supabase = await createClient()
  /*
    BOTH HALVES AT ONCE, BY THE SIGNED IN USER'S OWN ID. The private columns
    were read by the creator id the first read found, so every /app page
    waited for one read and then the other. creators.user_id is unique, so
    the same row is found by the user's id directly, on the service role
    exactly as before and filtered by nothing but the signed in user's own
    id; the public half still decides whether there is a creator at all.
  */
  const [publicHalf, privateHalf] = await Promise.all([
    supabase.from("creators").select(SHELL_CREATOR_COLUMNS).eq("user_id", userId).maybeSingle(),
    createAdminClient().from("creators").select(SHELL_PRIVATE_CREATOR_COLUMNS).eq("user_id", userId).maybeSingle(),
  ])
  /* The public half decides whether there is a creator: its failure is a failure, not "no store". */
  const data = dataOrThrow("creator", publicHalf)
  /* The private half is the plan and Stripe's state: without it the row is drawn as before, and the miss is logged. */
  if (privateHalf.error) logServiceFailure(new ServiceUnavailable("creator private columns", classifyServiceError(privateHalf.error, privateHalf.status), { status: privateHalf.status }))
  const privateCols = privateHalf.error ? null : privateHalf.data
  if (!data) return null
  return {
    stripe_onboarding_status: null,
    stripe_account_id: null,
    subscription_plan_id: null,
    ...(data as object),
    ...((privateCols as object | null) ?? {}),
  } as RequestCreator
}

/**
 * Seller access for the signed in person (lib/account/seller-access.ts), from
 * the two rows above, so a layout that has asked for them already pays
 * nothing more for the answer.
 */
export const sellerAccessForRequest = cache(async (userId: string): Promise<SellerAccess> => {
  /* Where it only decorates (a community page's seller links): a read that failed is "no seller" there, as before. */
  const [creator, profile] = await Promise.all([creatorForRequest(userId).catch(() => null), profileForRequest(userId)])
  return sellerAccessFrom({ creator, profile })
})

/**
 * The same, for a page that SENDS somebody somewhere from the answer (/sell,
 * onboarding): both rows read to the end, or a ServiceUnavailable thrown
 * (round 51). /sell sent a seller whose reads failed to /signup/verify.
 */
export const sellerAccessOrThrowForRequest = cache(async (userId: string): Promise<SellerAccess> => {
  const [creator, profile] = await Promise.all([creatorForRequest(userId), profileOrThrowForRequest(userId)])
  return sellerAccessFrom({ creator, profile })
})

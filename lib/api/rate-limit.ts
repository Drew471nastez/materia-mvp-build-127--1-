/**
 * ===========================================================================
 *  HOW OFTEN A STRANGER MAY ASK
 * ===========================================================================
 * Some routes answer people with no account, because they have to: a visitor
 * subscribing to a creator, a buyer checking a discount code, somebody who
 * has forgotten their password. Nothing limited how often any of them could
 * be called.
 *
 * What that allows is not theoretical. A discount code is a short string and
 * an unlimited guesser finds it. A subscribe form with no limit fills a
 * creator's list with a thousand addresses in a minute. A password reset
 * form with no limit is a way to mail somebody a few thousand times, from
 * your domain, which is how a domain stops being delivered.
 *
 * ---------------------------------------------------------------------------
 *  COUNTED IN POSTGRES, BECAUSE THE FUNCTIONS DO NOT SHARE MEMORY
 * ---------------------------------------------------------------------------
 * The same reasoning as lib/sites/rate-limit.ts, which counts rows it already
 * had. These routes keep no such record, so there is a table: see
 * supabase/migrations/20260923_rate_limit_hits.sql.
 *
 * The trade is the same and it is honest. The count is read before the row is
 * written, so a burst arriving inside the same few milliseconds can slip past
 * by a few. That bounds abuse at a few extra requests rather than at none,
 * which is the difference that matters, and closing it properly means a
 * transaction per request on a path that should stay cheap.
 *
 * ---------------------------------------------------------------------------
 *  AND IT FAILS OPEN, WHICH IS THE OPPOSITE OF THE OTHER GUARD
 * ---------------------------------------------------------------------------
 * lib/api/require-secret.ts refuses when it cannot do its job, because a
 * missing secret must never mean "let everybody in". This does the reverse.
 * A limiter that cannot reach its table, or whose migration has not been run
 * yet, must not take subscribing and password resets down with it. The worst
 * case of failing open here is the behaviour of last week; the worst case of
 * failing closed is an outage. So: any error at all, allow, and say so in the
 * log once per call rather than silently.
 */
import "server-only"

import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { logEvent } from "@/lib/net/log"

export interface RateWindow {
  /** How many are allowed. */
  limit: number
  /** Over how many seconds. */
  seconds: number
}

export interface RateLimitOptions {
  /** Which limit, e.g. "subscribe". One name per kind of request. */
  bucket: string
  /**
   * Who to count. Every one of them is counted and every one of them can
   * refuse, so a route can limit by address AND by the email being targeted:
   * an address rotating through a botnet still cannot mail one person a
   * thousand times.
   */
  subjects: (string | null | undefined)[]
  windows: readonly RateWindow[]
  /** What to tell them. Never "rate limited", which means nothing to anyone. */
  message?: string
  /**
   * COUNTED HERE FIRST, AND IN POSTGRES ONLY NEAR THE LIMIT. For the beacons
   * every public page sends (a page view, a link click) and the public reads
   * a page makes for every visitor (search, a cart priced again), whose worst
   * abuse is a figure in Analytics that is too high or a read repeated. See
   * memoryFirstVerdict.
   */
  memoryFirst?: boolean
}

/*
  ===========================================================================
   A SPIKE ON ONE PAGE MUST NOT BE A SPIKE ON THIS TABLE
  ===========================================================================
  Every limit is counted in rate_limit_hits, and so is every beacon: a page
  view asked it two counts and wrote one row before its own event was
  written, three round trips on the table that also guards publishing,
  saving a website and payments. A OnePage that went round on a busy evening
  was therefore a write storm on the same table, and on the same index, the
  dashboard's saves were counted in.

  So a beacon is counted in the function's own memory first, per window, the
  way lib/perf/limit.ts already counts Storelib's own speed beacons:

    under a quarter of a window's limit here    allowed, and Postgres is not
                                                asked at all: a person reading
                                                a page sends a handful a minute
    over the whole limit here                   refused, and Postgres is not
                                                asked either: one flood on one
                                                function costs it nothing
    anywhere between                            Postgres decides, exactly as
                                                for every other bucket

  The trade, said plainly: functions do not share memory, so an address that
  spreads under a quarter of the limit across several functions is not
  counted across them. For a page view that is a few extra rows in Analytics
  at worst, and collect's own one-per-visit rules still apply to each; for a
  search, a few more searches. It is never used for a limit that guards mail,
  money or a guess (tests/public-delivery.test.ts holds that list).
*/
export const MEMORY_FIRST_SHARE = 0.25
const MEMORY_KEEP = 20_000
const memoryCounts = new Map<string, { n: number; until: number }>()

/** "allow" or "refuse" without asking Postgres, or "ask" when the count here is near the limit. Counts this request when it is allowed. */
export function memoryFirstVerdict(
  bucket: string,
  subjects: readonly string[],
  windows: readonly RateWindow[],
  now = Date.now(),
  store: Map<string, { n: number; until: number }> = memoryCounts,
): "allow" | "refuse" | "ask" {
  if (store.size > MEMORY_KEEP) {
    for (const [k, v] of store) if (v.until <= now) store.delete(k)
    if (store.size > MEMORY_KEEP) store.clear()
  }
  let verdict: "allow" | "refuse" | "ask" = "allow"
  const seen: { n: number; until: number }[] = []
  for (const subject of subjects) {
    for (const window of windows) {
      const key = `${bucket}|${window.seconds}|${subject}`
      let entry = store.get(key)
      if (!entry || entry.until <= now) {
        entry = { n: 0, until: now + window.seconds * 1000 }
        store.set(key, entry)
      }
      seen.push(entry)
      if (entry.n >= window.limit) verdict = "refuse"
      else if (verdict !== "refuse" && entry.n >= Math.floor(window.limit * MEMORY_FIRST_SHARE)) verdict = "ask"
    }
  }
  /* A refused request is not counted, as in Postgres: retrying never extends the block. */
  if (verdict !== "refuse") for (const entry of seen) entry.n += 1
  return verdict
}

function refusal(options: RateLimitOptions, window: RateWindow): NextResponse {
  return NextResponse.json(
    { error: options.message ?? "Too many requests just now. Try again shortly." },
    { status: 429, headers: { "Retry-After": String(window.seconds) } },
  )
}

/** One in this many calls also clears out what nothing will read again. */
const SWEEP_ODDS = 50

/** What the sweep keeps: two days, longer than the longest window any bucket counts (a day). */
export const SWEEP_KEEP_SECONDS = 2 * 86_400

/**
 * The address the request came from, as the platform reports it.
 *
 * `x-forwarded-for` is a list, oldest first, and the one that matters is the
 * FIRST: the others were appended by proxies in between and can be forged by
 * the caller. On Vercel this header is always set.
 *
 * When it is not set at all the request is NOT counted against a shared
 * "unknown" subject, because that would put every such visitor in one bucket
 * and let one of them lock out the rest. A missing address means this
 * particular subject cannot be counted, and the others still are.
 */
export function callerAddress(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")
  const first = forwarded?.split(",")[0]?.trim()
  if (first) return first
  const real = request.headers.get("x-real-ip")?.trim()
  return real || null
}

/** Addresses and emails are not stored in the clear; only counted. */
function subjectKey(kind: string, value: string): string {
  return `${kind}:${value.trim().toLowerCase()}`
}

export function addressSubject(request: Request): string | null {
  const address = callerAddress(request)
  return address ? subjectKey("ip", address) : null
}

export function emailSubject(email: unknown): string | null {
  return typeof email === "string" && email.includes("@") ? subjectKey("email", email) : null
}

/**
 * `null` when the request is within every limit, or the 429 to return.
 *
 *     const limited = await rateLimit({
 *       bucket: "subscribe",
 *       subjects: [addressSubject(request), emailSubject(email)],
 *       windows: [{ limit: 5, seconds: 60 }, { limit: 30, seconds: 3600 }],
 *       message: "That is a lot of sign-ups from one place. Try again shortly.",
 *     })
 *     if (limited) return limited
 */
export async function rateLimit(options: RateLimitOptions): Promise<NextResponse | null> {
  const subjects = options.subjects.filter((s): s is string => typeof s === "string" && s.length > 0)
  if (subjects.length === 0) return null
  if (options.windows.length === 0) return null

  const longest = Math.max(...options.windows.map((w) => w.seconds))

  if (options.memoryFirst) {
    const verdict = memoryFirstVerdict(options.bucket, subjects, options.windows)
    if (verdict === "allow") return null
    if (verdict === "refuse") return refusal(options, options.windows[0])
  }

  try {
    const admin = createAdminClient()

    /*
      EVERY WINDOW COUNTED AT ONCE. Each count is its own question and none
      needs another's answer, so they are asked together: a limit with two
      windows (most of them) answered one round trip sooner, on every
      limited route (lib/perf/optimizations.ts). The answers are then read in
      the order they were always asked, so the first failure or the first
      window over its limit decides exactly as it did one after another.
    */
    const asks = subjects.flatMap((subject) =>
      options.windows.map((window) => {
        const since = new Date(Date.now() - window.seconds * 1000).toISOString()
        return Promise.resolve(
          admin
            .from("rate_limit_hits")
            .select("id", { count: "exact", head: true })
            .eq("bucket", options.bucket)
            .eq("subject", subject)
            .gte("created_at", since),
        ).then(
          (answer) => ({ window, count: answer.count, error: answer.error as { message: string } | null }),
          (thrown: unknown) => ({ window, count: null, error: { message: thrown instanceof Error ? thrown.message : String(thrown) } }),
        )
      }),
    )
    const answers = await Promise.all(asks)
    for (const { window, count, error } of answers) {
      /* Table missing, permissions wrong, database unreachable: allow (a warning, logEvent: failing open is the decision). */
      if (error) {
        logEvent("warn", "rate_limit_count_failed", { msg: "[rate-limit] counting failed, allowing", bucket: options.bucket, reason: error.message })
        return null
      }

      if ((count ?? 0) >= window.limit) {
        /*
          The refusal is NOT recorded. Counting a rejected request would
          extend the block every time somebody retried, so a person who hit
          the limit once could never get back under it.
        */
        return refusal(options, window)
      }
    }

    /* Within every limit, so this one counts. */
    await admin.from("rate_limit_hits").insert(subjects.map((subject) => ({ bucket: options.bucket, subject })))

    /*
      And now and then, throw away what no window can still reach. Doing it
      here rather than on a schedule means it cannot be forgotten, and one
      delete in fifty requests is cheaper than the row it removes.

      The sweep is by time alone, across EVERY bucket, so its cutoff must be
      past the longest window any bucket uses, not this call's own: a ten
      minute limit used to delete everything older than an hour, which
      quietly turned every daily limit (50 posts a day, 10 emails a day) into
      an hourly one. SWEEP_KEEP_SECONDS is above every window in the code.
    */
    if (Math.random() * SWEEP_ODDS < 1) {
      const cutoff = new Date(Date.now() - Math.max(longest, SWEEP_KEEP_SECONDS) * 1000).toISOString()
      await admin.from("rate_limit_hits").delete().lt("created_at", cutoff)
    }

    return null
  } catch (err) {
    console.error(`[rate-limit] ${options.bucket}: allowing after an error`, err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * THE LIMITS, chosen against what a person actually does.
 *
 * Every one of these is far above any real use and far below what makes the
 * abuse worth attempting, which is the only thing a limit has to achieve.
 */
export const LIMITS = {
  /** Signing up to a creator's list. Nobody subscribes twice in a minute. */
  subscribe: [{ limit: 5, seconds: 60 }, { limit: 30, seconds: 3600 }],
  /** Guessing a discount code, which is the whole reason this one exists. */
  coupon: [{ limit: 10, seconds: 60 }, { limit: 60, seconds: 3600 }],
  /** Anything that sends an email to somebody who did not ask twice. */
  email: [{ limit: 3, seconds: 300 }, { limit: 10, seconds: 86400 }],
  /**
   * Starting or confirming a card payment. A buyer whose card is declined
   * tries two or three more; a list of stolen numbers is tried by the
   * hundred, and this is the limit that makes the checkout useless for it.
   */
  payment: [{ limit: 10, seconds: 600 }, { limit: 40, seconds: 86400 }],
  /** Taking a free product, which emails the address it is given. */
  claim: [{ limit: 5, seconds: 600 }, { limit: 30, seconds: 86400 }],
  /**
   * The /app header search, per signed in person. Typing asks once a pause,
   * a few times a word; sixty a minute is well past anybody reading results
   * and well short of a script walking somebody's customer list.
   */
  search: [{ limit: 60, seconds: 60 }],
  /**
   * Adding your own AI key, per signed in person. Each add asks the provider
   * whether the key works; a person pastes one or two, a script with a list
   * of stolen keys would use this as a free checker.
   */
  aiKey: [{ limit: 6, seconds: 600 }, { limit: 20, seconds: 86400 }],
  /** Inviting someone to a store's team sends an email: a few at a time, and not dozens a day. */
  teamInvite: [{ limit: 10, seconds: 600 }, { limit: 40, seconds: 86400 }],
  /** Setting up payments: starting, sending details, a payout account. Each one writes, and nobody needs dozens. */
  paymentsSetup: [{ limit: 20, seconds: 600 }, { limit: 100, seconds: 86400 }],
  /*
   * READING WHERE SETUP HAS GOT TO. Setup asks this itself, often: the ID
   * step watches for Stripe's answer every couple of seconds while somebody
   * is holding up a document, and the last screen waits with them. Sharing
   * the write budget above, the flow spent all twenty on its own polling in
   * about fifty seconds and then quietly stopped updating, which read as
   * Stripe never answering. These only read, so they get room to.
   */
  paymentsRead: [{ limit: 240, seconds: 600 }, { limit: 2000, seconds: 86400 }],
  /** Asking for a payout. A handful a day is plenty, and each moves money. */
  payout: [{ limit: 5, seconds: 600 }, { limit: 20, seconds: 86400 }],

  /*
    THE WEBSITE BUILDER, per signed in person, one bucket per route. Every
    number below is set against the editor at its busiest in TWO tabs, and
    has to stay out of its way: a save refused here is work somebody thinks
    is saved.
  */
  /**
   * Settings, a page, and the header and footer sync. Autosave runs 1.5
   * seconds after the last change and sends those three in turn, so each
   * route sees at most one call per 1.5 seconds per tab: 40 a minute, 80 in
   * two tabs, 4,800 in an hour of two tabs saving back to back. Publishing
   * and adding a page send a few more.
   */
  siteSave: [{ limit: 150, seconds: 60 }, { limit: 6000, seconds: 3600 }],
  /** Reading a page into the editor: two reads a page switch (the page, and home's header and footer). */
  siteRead: [{ limit: 300, seconds: 60 }, { limit: 6000, seconds: 3600 }],
  /** A press each, never a stream: deleting a page, a backup, the preview link, a security check. */
  siteAction: [{ limit: 30, seconds: 60 }, { limit: 300, seconds: 3600 }],
  /** Publishing writes every page of the site, then clears its cache. */
  sitePublish: [{ limit: 20, seconds: 60 }, { limit: 200, seconds: 3600 }],
  /**
   * The cover starts a real browser on the server. The editor asks 12
   * seconds after the last save, so a tab asks at most five times a minute,
   * and the websites page asks once per stale website. A cover newer than
   * 20 seconds is handed back without a browser (lib/website-builder/cover-take.ts).
   */
  siteCover: [{ limit: 20, seconds: 60 }, { limit: 300, seconds: 3600 }],
  /**
   * Writing or repairing a section with the AI: one to three model calls
   * each, so the same budget as the page assistant (AGENT_LIMITS in
   * lib/sites/rate-limit.ts), counted per route.
   */
  siteAi: [{ limit: 6, seconds: 60 }, { limit: 40, seconds: 3600 }],
  /**
   * A lab test (Website settings › Performance) asks Google's PageSpeed
   * Insights to load a page, 10 to 40 seconds each, on a shared daily quota.
   * Two strategies of one page and a retry is four; thirty a day is plenty.
   */
  siteLabTest: [{ limit: 4, seconds: 600 }, { limit: 30, seconds: 86400 }],
  /**
   * Analytics events from one address (lib/analytics/collect): page views,
   * link clicks and the steps towards a sale together. A person reading a
   * site opens a page every few seconds at most; two a second for a minute,
   * or two thousand in an hour, is a script, or many people behind one
   * address, where losing the excess is the lesser harm.
   */
  track: [{ limit: 120, seconds: 60 }, { limit: 2000, seconds: 3600 }],
  /**
   * A visit from an AI assistant to one of Storelib's own pages
   * (/api/track/ai-visit), per address. A page sends it once per tab
   * session per landing, so a person sends a handful in a day; more than
   * twenty in ten minutes is a script adding to an assistant's count.
   */
  aiVisit: [{ limit: 20, seconds: 600 }, { limit: 100, seconds: 86400 }],
  /**
   * Storelib's own search over published products (/api/v2/search), per
   * address. A person types a few searches a minute; a script walking the
   * catalogue asks hundreds. Each one is a full text query.
   */
  publicSearch: [{ limit: 60, seconds: 60 }, { limit: 600, seconds: 3600 }],
  /**
   * A website visitor's saved cart priced again (/api/cart/prices), per
   * address: once per cart page or drawer open after a currency change.
   */
  cartPrices: [{ limit: 60, seconds: 60 }, { limit: 600, seconds: 3600 }],
} as const satisfies Record<string, readonly RateWindow[]>

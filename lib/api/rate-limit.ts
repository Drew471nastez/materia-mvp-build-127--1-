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
}

/** One in this many calls also clears out what nothing will read again. */
const SWEEP_ODDS = 50

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

  try {
    const admin = createAdminClient()

    for (const subject of subjects) {
      for (const window of options.windows) {
        const since = new Date(Date.now() - window.seconds * 1000).toISOString()
        const { count, error } = await admin
          .from("rate_limit_hits")
          .select("id", { count: "exact", head: true })
          .eq("bucket", options.bucket)
          .eq("subject", subject)
          .gte("created_at", since)

        /* Table missing, permissions wrong, database unreachable: allow. */
        if (error) {
          console.error(`[rate-limit] ${options.bucket}: counting failed, allowing (${error.message})`)
          return null
        }

        if ((count ?? 0) >= window.limit) {
          /*
            The refusal is NOT recorded. Counting a rejected request would
            extend the block every time somebody retried, so a person who hit
            the limit once could never get back under it.
          */
          return NextResponse.json(
            { error: options.message ?? "Too many requests just now. Try again shortly." },
            { status: 429, headers: { "Retry-After": String(window.seconds) } },
          )
        }
      }
    }

    /* Within every limit, so this one counts. */
    await admin.from("rate_limit_hits").insert(subjects.map((subject) => ({ bucket: options.bucket, subject })))

    /*
      And now and then, throw away what no window can still reach. Doing it
      here rather than on a schedule means it cannot be forgotten, and one
      delete in fifty requests is cheaper than the row it removes.
    */
    if (Math.random() * SWEEP_ODDS < 1) {
      const cutoff = new Date(Date.now() - Math.max(longest, 3600) * 1000).toISOString()
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
} as const satisfies Record<string, readonly RateWindow[]>

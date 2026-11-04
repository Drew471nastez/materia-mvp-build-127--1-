/**
 * ===========================================================================
 *  STRIPE BOUNDED IN TIME, AND STOPPED ASKING WHILE IT IS DOWN
 * ===========================================================================
 * Every Stripe call goes through the one client in lib/stripe.ts, and that
 * client is made with what is here:
 *
 *  - A TIMEOUT. The SDK's own default is 80 seconds per attempt, with two
 *    retries: a Stripe that hangs held a request for about four minutes, and
 *    every Settings open, checkout and webhook behind it waited too. Now an
 *    attempt gets STRIPE_TIMEOUT_MS. A call that already passes its own
 *    `timeout` (the billing reads' 5s, the webhook's 10s) keeps it.
 *
 *  - RETRIES WITH CAPPED BACKOFF AND JITTER. The SDK retries a connection
 *    error, a 409 and a 5xx at most STRIPE_MAX_NETWORK_RETRIES times, waiting
 *    0.5s doubling up to 5s, each wait randomised between half and all of
 *    it, and longer when Stripe sends Retry-After. A retried POST carries the
 *    same idempotency key, so a retry never makes a second object.
 *
 *  - A CIRCUIT BREAKER (StripeCircuitBreaker). After BREAKER_FAILURE_THRESHOLD
 *    calls in a row that Stripe did not answer (a timeout, a dropped
 *    connection, a 5xx or a 429), the next calls on this server instance
 *    fail at once for a cooldown instead of each waiting out its own timeout.
 *    Then one call is let through; Stripe answering closes the breaker, and
 *    another failure opens it again for twice as long, up to a minute. Any
 *    answer, a 4xx included, is Stripe being there.
 *
 *    A call refused by the breaker reads as a Stripe 503 that says not to
 *    retry: the same StripeAPIError every caller already handles as "Stripe
 *    could not be asked". Billing reads then show the stored plan
 *    (lib/billing/subscription-state.ts), the webhook answers 500 so Stripe
 *    sends the event again, and nothing reads it as "no subscription".
 *
 * Nothing here imports Stripe or the server, so the suite drives it with a
 * fake transport (tests/billing-resilience.test.ts).
 */
import { createHash } from "node:crypto"

/** One attempt's wait for Stripe, unless the call passes its own `timeout`. */
export const STRIPE_TIMEOUT_MS = 20_000
/** The SDK's retries after the first attempt (its default too; written down so it is a decision). */
export const STRIPE_MAX_NETWORK_RETRIES = 2
/** Calls in a row that Stripe did not answer before the breaker opens. */
export const BREAKER_FAILURE_THRESHOLD = 5
/** How long the breaker stays open the first time. Doubles on each failed probe, up to the cap. */
export const BREAKER_COOLDOWN_MS = 10_000
export const BREAKER_MAX_COOLDOWN_MS = 60_000

/** What the breaker answers with while open. The code is ours, so a log line says which it was. */
export const BREAKER_OPEN_CODE = "storelib_stripe_unavailable"

export type BreakerState = "closed" | "open" | "half_open"

export interface BreakerSnapshot {
  state: BreakerState
  consecutiveFailures: number
  openedAt: number | null
  cooldownMs: number
  /** Calls refused without asking Stripe, since this instance started. */
  refused: number
}

export class StripeCircuitBreaker {
  private state: BreakerState = "closed"
  private failures = 0
  private openedAt: number | null = null
  private cooldown: number
  private probing = false
  private refusedCount = 0
  private readonly threshold: number
  private readonly baseCooldown: number
  private readonly maxCooldown: number
  private readonly now: () => number
  private readonly onChange?: (from: BreakerState, to: BreakerState, snap: BreakerSnapshot) => void

  constructor(opts: {
    threshold?: number
    cooldownMs?: number
    maxCooldownMs?: number
    now?: () => number
    onChange?: (from: BreakerState, to: BreakerState, snap: BreakerSnapshot) => void
  } = {}) {
    this.threshold = opts.threshold ?? BREAKER_FAILURE_THRESHOLD
    this.baseCooldown = opts.cooldownMs ?? BREAKER_COOLDOWN_MS
    this.maxCooldown = opts.maxCooldownMs ?? BREAKER_MAX_COOLDOWN_MS
    this.cooldown = this.baseCooldown
    this.now = opts.now ?? (() => Date.now())
    this.onChange = opts.onChange
  }

  private move(to: BreakerState) {
    const from = this.state
    if (from === to) return
    this.state = to
    this.onChange?.(from, to, this.snapshot())
  }

  /**
   * Whether this call may go to Stripe. Open: no, until the cooldown is over,
   * then exactly one call (the probe) while the others keep being refused.
   */
  allow(): boolean {
    if (this.state === "closed") return true
    if (this.state === "open") {
      if (this.openedAt !== null && this.now() - this.openedAt >= this.cooldown) {
        this.move("half_open")
        this.probing = false
      } else {
        this.refusedCount++
        return false
      }
    }
    /* half open: one probe at a time */
    if (this.probing) {
      this.refusedCount++
      return false
    }
    this.probing = true
    return true
  }

  /** Stripe answered (any status below 500 other than 429). */
  success(): void {
    this.failures = 0
    this.probing = false
    this.cooldown = this.baseCooldown
    this.openedAt = null
    this.move("closed")
  }

  /** Stripe did not answer: a timeout, a dropped connection, a 5xx or a 429. */
  failure(): void {
    this.failures++
    if (this.state === "half_open") {
      this.probing = false
      this.cooldown = Math.min(this.cooldown * 2, this.maxCooldown)
      this.openedAt = this.now()
      this.move("open")
      return
    }
    if (this.state === "closed" && this.failures >= this.threshold) {
      this.openedAt = this.now()
      this.move("open")
    }
  }

  /** How long until the breaker lets a probe through (0 when closed or due). */
  retryInMs(): number {
    if (this.state !== "open" || this.openedAt === null) return 0
    return Math.max(0, this.cooldown - (this.now() - this.openedAt))
  }

  snapshot(): BreakerSnapshot {
    return { state: this.state, consecutiveFailures: this.failures, openedAt: this.openedAt, cooldownMs: this.cooldown, refused: this.refusedCount }
  }
}

/** A status that says Stripe is not answering, as opposed to answering no. */
export function isUnavailableStatus(status: number): boolean {
  return status >= 500 || status === 429
}

/* The two shapes the SDK's transport has (Stripe.HttpClient), kept structural so this file needs no Stripe import. */
export interface TransportResponse {
  getStatusCode(): number
  getHeaders(): { [key: string]: string }
  getRawResponse(): unknown
  toStream(streamCompleteCallback: () => void): unknown
  toJSON(): Promise<object>
}
export interface Transport<R extends TransportResponse = TransportResponse> {
  getClientName(): string
  makeRequest(
    host: string,
    port: string | number,
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    headers: object,
    requestData: string | null,
    protocol: "http" | "https",
    timeout: number,
  ): Promise<R>
}

/** The answer the breaker gives while open: a 503 Stripe would send, saying not to retry, so the SDK gives up at once. */
export class BreakerOpenResponse implements TransportResponse {
  private readonly body: object
  constructor(retryInMs: number) {
    this.body = {
      error: {
        type: "api_error",
        code: BREAKER_OPEN_CODE,
        message: `Stripe is not answering; calls are paused on this server for ${Math.ceil(retryInMs / 1000)}s.`,
      },
    }
  }
  getStatusCode() {
    return 503
  }
  getHeaders() {
    return { "stripe-should-retry": "false", "request-id": BREAKER_OPEN_CODE }
  }
  getRawResponse() {
    return {}
  }
  toStream(done: () => void) {
    done()
    return null
  }
  toJSON() {
    return Promise.resolve(this.body)
  }
}

/**
 * The SDK's own transport, with the breaker in front: a refused call never
 * leaves the server, and every real call's outcome is told to the breaker.
 */
export function breakerTransport<R extends TransportResponse>(inner: Transport<R>, breaker: StripeCircuitBreaker): Transport<R | BreakerOpenResponse> {
  return {
    getClientName: () => `${inner.getClientName()}+breaker`,
    async makeRequest(host, port, path, method, headers, requestData, protocol, timeout) {
      if (!breaker.allow()) return new BreakerOpenResponse(breaker.retryInMs())
      let res: R
      try {
        res = await inner.makeRequest(host, port, path, method, headers, requestData, protocol, timeout)
      } catch (error) {
        breaker.failure()
        throw error
      }
      if (isUnavailableStatus(res.getStatusCode())) breaker.failure()
      else breaker.success()
      return res
    },
  }
}

/** Whether an error is the breaker's own refusal (Stripe was not asked). */
export function isBreakerRefusal(error: unknown): boolean {
  const e = error as { code?: string; raw?: { code?: string } } | null
  return !!e && (e.code === BREAKER_OPEN_CODE || e.raw?.code === BREAKER_OPEN_CODE)
}

// ---------------------------------------------------------------------------
// Idempotency keys
// ---------------------------------------------------------------------------

/** JSON with object keys sorted, so the same params always hash the same. Undefined is left out, as Stripe leaves it out. */
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : stableJson(v))).join(",")}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`
}

/**
 * An idempotency key for a Stripe create made on a press: who and what
 * (`parts`), the exact params, and a time window. The same press sent twice
 * in the window (a double tap, a retry of a request whose answer was lost)
 * gets the object the first one made; different params are a different key,
 * so Stripe never refuses a key for a changed request; and after the window
 * the same params make a new object, so a second purchase later is its own.
 *
 * Under Stripe's 255 characters whatever the parts are.
 */
export function stripeIdempotencyKey(
  scope: string,
  parts: readonly (string | number | null | undefined)[],
  params: unknown,
  opts: { windowMs?: number; now?: number } = {},
): string {
  const windowMs = opts.windowMs ?? 60_000
  const now = opts.now ?? Date.now()
  const slot = Math.floor(now / windowMs)
  const who = parts.map((p) => (p === null || p === undefined ? "-" : String(p))).join(":")
  const hash = createHash("sha256").update(`${scope}|${who}|${stableJson(params)}`).digest("hex").slice(0, 32)
  const head = `storelib:${scope}:${who}`.slice(0, 180)
  return `${head}:${slot}:${hash}`
}

/**
 * An idempotency key made only from what the object is, with no time in it:
 * for a create whose own identity is known (a payout from a given balance, a
 * schedule on a given subscription). The same identity always makes the same
 * key, so a retry minutes later still gets the first object; a different
 * identity (a later cashout, another plan) is a different key, so nothing
 * real is blocked. Stripe forgets a key after 24 hours.
 */
export function stripeIdentityKey(scope: string, parts: readonly (string | number | null | undefined)[], params: unknown): string {
  const who = parts.map((p) => (p === null || p === undefined ? "-" : String(p))).join(":")
  const hash = createHash("sha256").update(`${scope}|${who}|${stableJson(params)}`).digest("hex").slice(0, 32)
  return `${`storelib:${scope}:${who}`.slice(0, 200)}:${hash}`
}

/**
 * The cashout payout's key. A payout is "this store's balance, after its last
 * recorded cashout": the connected account, the last cashout_initiated ledger
 * event (null before the first), the wallet amount moved to in transit and the
 * payout's exact params (amount, currency). A double press or a retry after a
 * lost answer is the same payout; once a cashout is recorded the anchor moves,
 * so the next genuine cashout of the same amount is a new key.
 */
export function cashoutIdempotencyKey(c: {
  creatorId: string
  accountId: string
  lastCashoutEventId: string | null
  walletMinor: number
  params: unknown
}): string {
  return stripeIdentityKey("cashout", [c.creatorId, c.accountId, c.lastCashoutEventId ?? "first", c.walletMinor], c.params)
}

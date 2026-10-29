/**
 * ===========================================================================
 *  A PROVIDER THAT IS DOWN IS ASKED ONCE, NOT BY EVERY REQUEST
 * ===========================================================================
 * Every call to Mailgun, a fulfilment provider or GitHub already has a
 * deadline. A deadline bounds one call; it does not stop the next hundred
 * requests from each waiting out the same deadline against a provider that
 * is plainly not answering. With Mailgun down, every order, every sign in
 * code and every contact form held its function for the whole timeout.
 *
 * A breaker per provider counts failures in a row. After `failures` of them
 * inside `windowMs` it opens: calls fail at once for `cooldownMs`, without
 * touching the network. Then one call is let through as a trial; an answer
 * closes the breaker, a failure opens it again.
 *
 * Only failures that say the provider is unwell count: a timeout, a dropped
 * connection, a 5xx or a 429. A provider refusing one request (a 4xx about
 * an address, a SKU, a key) is an answer, and the caller records it as a
 * success.
 *
 * In memory, per server instance, on purpose: no new service, nothing that
 * can itself be down. On Vercel's fluid compute one instance serves many
 * requests at once, which is exactly where the waiting piled up. A cold
 * instance starts closed and learns within `failures` calls.
 *
 * Browser safe, no imports beyond the log helper's shape.
 */

export type BreakerState = "closed" | "open" | "half-open"

export interface BreakerOptions {
  /** Failures in a row that open the breaker. */
  failures?: number
  /** The failures must fall within this long of each other; older ones are forgotten. */
  windowMs?: number
  /** How long an open breaker refuses before it lets one trial through. */
  cooldownMs?: number
  /** For tests. */
  now?: () => number
}

export const BREAKER_DEFAULTS = { failures: 5, windowMs: 60_000, cooldownMs: 30_000 } as const

/** Thrown, or handed back, when a call was refused without being made. */
export class CircuitOpen extends Error {
  readonly provider: string
  readonly retryInMs: number
  constructor(provider: string, retryInMs: number) {
    super(`${provider} is not answering; not asked again for ${Math.max(1, Math.round(retryInMs / 1000))}s`)
    this.name = "CircuitOpen"
    this.provider = provider
    this.retryInMs = retryInMs
  }
}

export function isCircuitOpen(e: unknown): e is CircuitOpen {
  return !!e && typeof e === "object" && (e as { name?: unknown }).name === "CircuitOpen"
}

export class CircuitBreaker {
  readonly name: string
  private readonly failuresToOpen: number
  private readonly windowMs: number
  private readonly cooldownMs: number
  private readonly now: () => number
  private failuresInRow = 0
  private firstFailureAt = 0
  private openedAt = 0
  private trialInFlight = false
  private _state: BreakerState = "closed"

  constructor(name: string, opts: BreakerOptions = {}) {
    this.name = name
    this.failuresToOpen = opts.failures ?? BREAKER_DEFAULTS.failures
    this.windowMs = opts.windowMs ?? BREAKER_DEFAULTS.windowMs
    this.cooldownMs = opts.cooldownMs ?? BREAKER_DEFAULTS.cooldownMs
    this.now = opts.now ?? Date.now
  }

  get state(): BreakerState {
    if (this._state === "open" && this.now() - this.openedAt >= this.cooldownMs) return "half-open"
    return this._state
  }

  /** How long until an open breaker lets a trial through; 0 when it would let a call through now. */
  retryInMs(): number {
    if (this._state !== "open") return 0
    return Math.max(0, this.cooldownMs - (this.now() - this.openedAt))
  }

  /**
   * May a call go out? Closed: yes. Open and cooling down: no. Cooled down:
   * yes for exactly one caller (the trial) until that trial reports back.
   */
  allow(): boolean {
    const state = this.state
    if (state === "closed") return true
    if (state === "open") return false
    if (this.trialInFlight) return false
    this.trialInFlight = true
    this._state = "half-open"
    return true
  }

  /** The provider answered (with anything that is not "I am unwell"). */
  success(): void {
    const wasOpen = this._state !== "closed"
    this.failuresInRow = 0
    this.trialInFlight = false
    this._state = "closed"
    if (wasOpen) note("circuit_closed", this.name)
  }

  /** A timeout, a dropped connection, a 5xx or a 429. */
  failure(): void {
    const t = this.now()
    if (this._state === "half-open") {
      this.trialInFlight = false
      this.open(t)
      return
    }
    if (this.failuresInRow === 0 || t - this.firstFailureAt > this.windowMs) {
      this.failuresInRow = 0
      this.firstFailureAt = t
    }
    this.failuresInRow++
    if (this._state === "closed" && this.failuresInRow >= this.failuresToOpen) this.open(t)
  }

  /**
   * `run` through the breaker. `unwell` decides which outcomes count against
   * the provider: by default any throw does, and any value does not.
   */
  async call<T>(run: () => Promise<T>, unwell: (outcome: { value?: T; error?: unknown }) => boolean = threw): Promise<T> {
    if (!this.allow()) throw new CircuitOpen(this.name, this.retryInMs())
    try {
      const value = await run()
      if (unwell({ value })) this.failure()
      else this.success()
      return value
    } catch (error) {
      if (unwell({ error })) this.failure()
      else this.success()
      throw error
    }
  }

  private open(t: number): void {
    this._state = "open"
    this.openedAt = t
    this.failuresInRow = 0
    note("circuit_open", this.name, this.cooldownMs)
  }
}

/** The default for call(): a throw counts against the provider, a value does not. */
function threw(outcome: { error?: unknown }): boolean {
  return Object.prototype.hasOwnProperty.call(outcome, "error")
}

function note(evt: string, provider: string, cooldownMs?: number): void {
  try {
    if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") return
    console.warn(JSON.stringify({ evt, provider, cooldownMs: cooldownMs ?? null }))
  } catch {
    /* Logging is never what fails a call. */
  }
}

const registry = new Map<string, CircuitBreaker>()

/** The one breaker for `name` in this instance, made on first use. */
export function breakerFor(name: string, opts?: BreakerOptions): CircuitBreaker {
  let b = registry.get(name)
  if (!b) {
    b = new CircuitBreaker(name, opts)
    registry.set(name, b)
  }
  return b
}

/** Tests only: every breaker closed and forgotten. */
export function resetBreakers(): void {
  registry.clear()
}

/** A status that says the provider, not the request, is the problem. */
export function unwellStatus(status: number): boolean {
  return status === 429 || status >= 500
}

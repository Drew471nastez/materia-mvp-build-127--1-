/**
 * ===========================================================================
 *  NOTHING THE EDITOR WAITS FOR CAN BE WAITED FOR FOREVER
 * ===========================================================================
 * "Sometimes the website builder editor doesn't load the theme at all": the
 * canvas sat on its grey outline of a page and never changed. Every way that
 * happened was a wait with no end to it: a request that never answered, a
 * request that failed and was remembered as an empty answer, a frame that
 * never said it had drawn. So every wait the editor's canvas and the Website
 * page's cover make goes through here, and each one ends, in an answer or in
 * an error the screen can say and offer to try again.
 *
 *   fetchWithin   a fetch that gives up after `ms`, as an error, never a hang
 *   retrying      the same, tried again after a short pause, a few times
 *   reportLoadProblem
 *                 says so to the server's error log (/api/client-errors), once
 *                 per problem per tab, with nothing about the person in it
 */
import { buildReport } from "@/lib/client-errors"
import { SEALED_NOTE } from "@/lib/storelib-theme/compat/seal"

/** The request took longer than it was given. */
export class LoadTimeout extends Error {
  constructor(what: string, ms: number) {
    super(`${what} took longer than ${Math.round(ms / 1000)}s`)
    this.name = "LoadTimeout"
  }
}

/**
 * A fetch that ends: answered, refused, or given up on after `ms` (a
 * LoadTimeout). An abort from the caller's own signal still aborts it.
 */
export async function fetchWithin(input: string, init: RequestInit = {}, ms = 20_000): Promise<Response> {
  const ctl = typeof AbortController === "function" ? new AbortController() : null
  const outer = init.signal
  const relay = () => ctl?.abort()
  if (outer) {
    if (outer.aborted) ctl?.abort()
    else outer.addEventListener("abort", relay, { once: true })
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      /* Said first, so the race is won by the timeout rather than by the abort it causes. */
      reject(new LoadTimeout(input.split("?")[0], ms))
      ctl?.abort()
    }, ms)
  })
  try {
    return await Promise.race([fetch(input, { ...init, signal: ctl?.signal ?? outer }), late])
  } finally {
    clearTimeout(timer)
    outer?.removeEventListener("abort", relay)
  }
}

/** Waits that grow: 0.6s, then 1.5s, then 3s. */
export const RETRY_WAITS_MS = [600, 1500, 3000]

/**
 * `run` until it resolves, at most `waits.length + 1` times, pausing
 * `waits[i]` between tries. The last error is thrown.
 */
export async function retrying<T>(run: (attempt: number) => Promise<T>, waits: readonly number[] = RETRY_WAITS_MS): Promise<T> {
  let last: unknown
  for (let attempt = 0; attempt <= waits.length; attempt++) {
    try {
      return await run(attempt)
    } catch (e) {
      last = e
      if (attempt === waits.length) break
      await new Promise((r) => setTimeout(r, waits[attempt]))
    }
  }
  throw last
}

/** `p`, or a LoadTimeout once `ms` have passed: for a wait that covers more than the headers (a body read, a parse). */
export function deadline<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new LoadTimeout(what, ms)), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

/** A promise that settles within `ms`: its own answer, or `fallback`. Never left waiting. */
export function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    p.catch(() => fallback),
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

const reported = new Set<string>()

/**
 * Said to the server's error log once per problem per tab: the problem's
 * words and the page's path, nothing else (see app/api/client-errors). A
 * report never throws and never holds anything up.
 */
export function reportLoadProblem(where: string, error: unknown): void {
  if (typeof window === "undefined") return
  const message = `[${where}] ${error instanceof Error ? error.message : String(error)}`.slice(0, 280)
  if (reported.has(message)) return
  reported.add(message)
  try {
    console.warn(message)
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...buildReport(new Error(message), window.location.href), stale: false }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* a report is never worth breaking the page over */
  }
}

/**
 * The sections of a drawn page that left an element open and were closed
 * where they end (lib/storelib-theme/compat/seal.ts), said once each: the
 * section's id and what it left open.
 */
export function reportSealed(where: string, errors: Record<string, string[]> | undefined): void {
  if (!errors) return
  for (const [id, list] of Object.entries(errors)) {
    const said = list.find((e) => e.startsWith(SEALED_NOTE))
    if (said) reportLoadProblem(where, `section ${id}: ${said}`)
  }
}

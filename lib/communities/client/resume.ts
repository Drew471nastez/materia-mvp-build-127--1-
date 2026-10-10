/**
 * ===========================================================================
 *  COMING BACK, AND CODE THAT FAILED TO LOAD, WITHOUT A WHITE PAGE (round 15)
 * ===========================================================================
 * The owner: "I leave the phone for a minute, tap Home, and it goes white and
 * nothing loads", and "fast taps crack the page into a white blank, then a
 * full refresh". The causes, found in Next 16's router and this app's code
 * (scripts/check-community-shell15.mjs reproduces each in a browser):
 *
 *   1. A ROUTER REQUEST THAT FAILS IS A WHOLE PAGE LOAD. Next's
 *      fetchServerResponse answers a failed fetch, a non-200 answer, or a
 *      build id from another deploy with "load this URL in the browser",
 *      and the router does location.assign/replace and suspends the whole
 *      app meanwhile: a white page. A phone that just woke has no
 *      connection for a moment, so the first router request after waking
 *      (a tab, a refresh) fails and goes white; if the load fails too, it
 *      stays white. The community's frame itself called router.refresh()
 *      on coming back after five minutes and on a cover saved elsewhere.
 *   2. Every move between places was a router request, so each tap could
 *      meet (1); fast taps raced several of them.
 *
 * What is here: a router refresh asked only once the network answers
 * (quietRouterRefresh), and the rule for code that failed to load
 * (chunkRecovery): try the import once more, then, only if it fails again,
 * a hard navigation to the same address. Places themselves no longer go
 * through the router at all (navigator.ts, place-cache.ts).
 */
import { isChunkLoadError } from "@/lib/client-errors"

/** How long the network gets to answer before a refresh is put off. */
export const NETWORK_ANSWER_MS = 3_000

/** Whether the network answers now: the browser says it is online and a tiny same-origin read comes back. */
export async function networkAnswers(timeoutMs: number = NETWORK_ANSWER_MS): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null
  const timer = setTimeout(() => ctrl?.abort(), timeoutMs)
  try {
    const res = await fetch("/api/version", { cache: "no-store", credentials: "omit", signal: ctrl?.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

let refreshing = false

/**
 * router.refresh(), but only once the network answers, never while one is already on its way, and when it does not answer,
 * once more when the browser says it is back online. Never a page load.
 */
export function quietRouterRefresh(router: { refresh: () => void }) {
  if (typeof window === "undefined" || refreshing) return
  refreshing = true
  void networkAnswers().then((ok) => {
    refreshing = false
    if (ok) return router.refresh()
    const back = () => {
      window.removeEventListener("online", back)
      quietRouterRefresh(router)
    }
    window.addEventListener("online", back)
  })
}

/** A dynamic import's failure that loading again can fix: the code, not the program. */
export function loadingFailure(error: unknown): boolean {
  if (isChunkLoadError(error)) return true
  const message = String((error as { message?: unknown })?.message ?? "")
  return /^(Load failed|Failed to fetch)$/i.test(message.trim())
}

/** What to do after a failed import on try `attempt` (0 is the first): try again, go to the same address in full, or let it throw. */
export function chunkRecovery(error: unknown, attempt: number): "retry" | "hard" | "throw" {
  if (!loadingFailure(error)) return "throw"
  return attempt === 0 ? "retry" : "hard"
}

const HARD_KEY = "storelib:community-hard-nav"
/** A hard navigation to the same address at most once in this long, so a broken deploy can never loop. */
export const HARD_AGAIN_MS = 60_000

/** Whether a hard navigation may run now (and notes that it does). */
export function hardNavigationAllowed(store: { getItem(k: string): string | null; setItem(k: string, v: string): void } | null, now: number = Date.now()): boolean {
  if (!store) return false
  try {
    const last = Number(store.getItem(HARD_KEY))
    if (Number.isFinite(last) && last > 0 && now - last < HARD_AGAIN_MS) return false
    store.setItem(HARD_KEY, String(now))
    return true
  } catch {
    return false
  }
}

/** An import with the recovery: once more after a moment, then a hard navigation to the same address. */
export function withChunkRecovery<T>(load: () => Promise<T>): () => Promise<T> {
  return async () => {
    try {
      return await load()
    } catch (first) {
      if (chunkRecovery(first, 0) !== "retry") throw first
      await new Promise((r) => setTimeout(r, 400))
      try {
        return await load()
      } catch (second) {
        if (chunkRecovery(second, 1) === "hard" && typeof window !== "undefined") {
          let store: Storage | null = null
          try {
            store = window.sessionStorage
          } catch {
            store = null
          }
          if (hardNavigationAllowed(store)) {
            window.location.assign(window.location.href)
            /* The page is on its way; nothing more is drawn here meanwhile. */
            return new Promise<T>(() => {})
          }
        }
        throw second
      }
    }
  }
}

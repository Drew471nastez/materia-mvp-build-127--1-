/**
 * ===========================================================================
 *  A RESTORE THE BUTTON ALWAYS HEARS BACK FROM
 * ===========================================================================
 * The question in Backups & Versions waits on one request. It used to wait
 * with no limit, so a request the server never answered (a function stopped
 * by the platform, a phone that lost its connection) left "Restoring" on the
 * button for good, with Cancel disabled. This settles every time:
 *
 *   • one restore at a time: a second press while one runs does nothing;
 *   • the editor saves what it has and stops autosaving first (`hold`), so
 *     the safety copy includes the last edit and no autosave lands on top of
 *     the restored draft afterwards;
 *   • the request has a deadline a little past the server's own;
 *   • every way out sets busy back to false and says what happened.
 *
 * Pure apart from `fetch`, which a test hands in.
 */

export const RESTORE_CLIENT_TIMEOUT_MS = 290_000

export interface SettleRestoreArgs {
  url: string
  fallback: string
  /** Read and written at once, so two presses in one frame cannot both post. */
  busy: { current: boolean }
  setBusy: (busy: boolean) => void
  setError: (error: string | null) => void
  /** The editor's own draft: true holds it (saved, autosave paused) and answers whether it could; false lets it go. */
  hold?: (hold: boolean) => Promise<boolean> | boolean
  fetchImpl?: typeof fetch
  timeoutMs?: number
  /** Words, so the client can pass them through its translator. */
  words?: Partial<Record<"timeout" | "offline" | "unsaved", string>>
}

const WORDS = {
  timeout: "This is taking too long, so Storelib stopped waiting. Your draft was backed up first. Reload the builder to see where it stands.",
  offline: "Storelib could not be reached. Nothing was restored. Check your connection and try again.",
  unsaved: "Your latest edits could not be saved yet, so nothing was restored. Try again in a moment.",
}

/** True when the restore went through; false when it did not, with the reason set. */
export async function settleRestore(a: SettleRestoreArgs): Promise<boolean> {
  if (a.busy.current) return false
  a.busy.current = true
  a.setBusy(true)
  a.setError(null)
  const words = { ...WORDS, ...(a.words ?? {}) }
  let held = false
  let ok = false
  try {
    if (a.hold) {
      held = true
      const saved = await a.hold(true)
      if (!saved) {
        a.setError(words.unsaved)
        return false
      }
    }
    /* A timer of its own rather than AbortSignal.timeout: older Safari has no such thing, and this one is the same everywhere. */
    const stop = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      stop.abort()
    }, a.timeoutMs ?? RESTORE_CLIENT_TIMEOUT_MS)
    let res: Response
    try {
      res = await (a.fetchImpl ?? fetch)(a.url, { method: "POST", signal: stop.signal })
    } catch {
      a.setError(timedOut ? words.timeout : words.offline)
      return false
    } finally {
      clearTimeout(timer)
    }
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) {
      a.setError(typeof json?.error === "string" && json.error ? json.error : a.fallback)
      return false
    }
    ok = true
    return true
  } catch {
    a.setError(a.fallback)
    return false
  } finally {
    /* After a restore the editor reloads; the hold is let go only when it will not. */
    if (held && !ok) {
      try {
        await a.hold?.(false)
      } catch {
        /* nothing to undo */
      }
    }
    a.busy.current = false
    a.setBusy(false)
  }
}

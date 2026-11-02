/**
 * ===========================================================================
 *  A POST'S AUTOSAVE: ONE REQUEST AT A TIME, EACH NAMING ITS VERSION
 * ===========================================================================
 * Every edit is counted (`touch`) and a save is asked for 1.5s after the last
 * one. Saves go one after the other on a single chain, never two at once, so
 * an older draft can never land after a newer one. Each carries the version
 * the editor last had from the server; the server bumps it on every save and
 * answers 409 with the post as it is now when the version is old (another
 * tab, a team member). A 409 stops autosave and asks: keep mine (saved over
 * theirs, from their version) or take theirs.
 *
 * Nothing answered, a 5xx, a sign in that lapsed or a rate limit are tried
 * again by themselves, waiting longer each time (1s, 2s ... 30s). Anything
 * else is said and left for the person: a refusal does not go away by being
 * repeated.
 *
 * No React here: the editor holds one of these, and tests/site-blog-ui.test.ts
 * drives it with its own clock.
 */
import type { AdminPost } from "@/lib/site-blog/types"
import type { SaveAnswer } from "./api"

export const AUTOSAVE_MS = 1500
const RETRY_CAP_MS = 30_000

export type SaveState =
  | { kind: "idle" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string; retrying: boolean; sql: boolean }
  | { kind: "conflict"; current: AdminPost | null }

export interface Timers {
  set: (fn: () => void, ms: number) => unknown
  clear: (handle: unknown) => void
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}

export interface SaveQueueOptions {
  /** The version the editor opened. */
  version: number
  /** Sends the draft as it is now, naming this version. */
  save: (version: number) => Promise<SaveAnswer>
  onState: (state: SaveState) => void
  /** A save landed: the post as the server has it now. */
  onSaved?: (post: AdminPost) => void
  delay?: number
  timers?: Timers
  now?: () => number
}

export interface SaveQueue {
  /** An edit: saved a moment after the last one. */
  touch: () => void
  /** Save now (Cmd+S, before Publish or Preview), after whatever is in flight. True when everything is saved. */
  flush: () => Promise<boolean>
  /** Edits not yet saved, or a save in flight. */
  pending: () => boolean
  /** The version the next save will name. */
  version: () => number
  /** The server answered with a newer post (Publish, a restore): its version is the one to name. */
  adopt: (post: AdminPost) => void
  /** After a 409: keep what is on screen (saved over theirs) or take theirs (the editor shows it). */
  resolve: (choice: "mine" | "theirs", current: AdminPost) => Promise<boolean>
  /** Autosave is stopped until resolve. */
  conflicted: () => boolean
  dispose: () => void
}

export function createSaveQueue(o: SaveQueueOptions): SaveQueue {
  const timers = o.timers ?? realTimers
  const now = o.now ?? Date.now
  const delay = o.delay ?? AUTOSAVE_MS
  let version = o.version
  let edits = 0
  let saved = 0
  let inFlight = false
  let conflict = false
  let disposed = false
  let retries = 0
  let timer: unknown = null
  let retryTimer: unknown = null
  let chain: Promise<unknown> = Promise.resolve()
  let last: SaveState = { kind: "idle" }

  const set = (s: SaveState) => {
    last = s
    if (!disposed) o.onState(s)
  }
  const clearTimer = () => {
    if (timer !== null) timers.clear(timer)
    timer = null
  }
  const clearRetry = () => {
    if (retryTimer !== null) timers.clear(retryTimer)
    retryTimer = null
  }

  async function run(): Promise<boolean> {
    if (conflict || disposed) return false
    if (edits === saved) {
      if (last.kind !== "saved" && last.kind !== "idle") set({ kind: "saved", at: now() })
      return true
    }
    clearRetry()
    const seq = edits
    inFlight = true
    set({ kind: "saving" })
    let answer: SaveAnswer
    try {
      answer = await o.save(version)
    } catch (e) {
      answer = { ok: false, error: e instanceof Error ? e.message : String(e), status: 0, sql: false, retry: true }
    }
    inFlight = false
    if (disposed) return false
    if (answer.ok === true) {
      const landed = (answer as Extract<SaveAnswer, { ok: true }>).post
      retries = 0
      version = landed.version
      saved = Math.max(saved, seq)
      o.onSaved?.(landed)
      if (edits === saved) {
        set({ kind: "saved", at: now() })
        return true
      }
      /* Typed while it was saving: its own timer is already running. */
      set({ kind: "dirty" })
      return false
    }
    if ("conflict" in answer) {
      conflict = true
      clearTimer()
      set({ kind: "conflict", current: (answer as Extract<SaveAnswer, { conflict: AdminPost | null }>).conflict })
      return false
    }
    const refused = answer as Extract<SaveAnswer, { error: string }>
    if (refused.retry) {
      retries = Math.min(retries + 1, 5)
      set({ kind: "error", message: refused.error, retrying: true, sql: false })
      retryTimer = timers.set(() => {
        retryTimer = null
        void flush()
      }, Math.min(RETRY_CAP_MS, 1000 * 2 ** (retries - 1)))
      return false
    }
    set({ kind: "error", message: refused.error, retrying: false, sql: refused.sql })
    return false
  }

  function flush(): Promise<boolean> {
    clearTimer()
    const p = chain.then(run)
    chain = p.catch(() => false)
    return p
  }

  return {
    touch() {
      if (disposed) return
      edits++
      if (conflict) return
      if (last.kind !== "saving") set({ kind: "dirty" })
      clearTimer()
      timer = timers.set(() => {
        timer = null
        void flush()
      }, delay)
    },
    flush,
    pending: () => inFlight || edits !== saved,
    version: () => version,
    adopt(post) {
      version = post.version
    },
    async resolve(choice, current) {
      version = current.version
      conflict = false
      if (choice === "theirs") {
        saved = edits
        set({ kind: "saved", at: now() })
        return true
      }
      edits++
      return flush()
    },
    conflicted: () => conflict,
    dispose() {
      disposed = true
      clearTimer()
      clearRetry()
    },
  }
}

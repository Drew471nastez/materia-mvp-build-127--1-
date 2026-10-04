"use client"

/**
 * ===========================================================================
 *  A LIKE OR A SAVE ANSWERS THE PRESS, HOWEVER FAST THE PRESSES COME
 * ===========================================================================
 * Round 8. A like, an unlike or a save is drawn on the next frame after the
 * press, and the button is never turned off while the server is asked. What
 * happens underneath, per post (or comment) and per kind:
 *
 *   ONE REQUEST AT A TIME   a press while one is on its way only changes
 *                           what the member wants; when the answer comes,
 *                           a second request goes only if that is now
 *                           different from what the server holds. Ten fast
 *                           presses are at most two requests, and the last
 *                           press always wins (the request says on or off,
 *                           never "toggle").
 *   COUNTS NEVER FLICKER    what is shown is the server's last count moved
 *                           by the one press it has not seen yet, so an
 *                           answer to an older press never shows through
 *                           while a newer one is waiting.
 *   PUT BACK ONLY AT THE END a refusal of the latest wish puts back the
 *                           server's last word and says why; a refusal of
 *                           a wish already taken back says nothing.
 *
 * The same post is drawn twice when it is opened over the feed (the card
 * under it and the opened post), so the state lives here, keyed by what it
 * is about, not in either component. While a press waits, every button
 * that shows it draws it from here (`useIntent`), even one handed an older
 * copy of the post read from the server meanwhile; the post itself (the
 * feed's lists, the opened post) is written once, with the server's answer,
 * so a press redraws a button and not the feed around it.
 */
import { useSyncExternalStore } from "react"
import type { ApiResult } from "./api"
import { toast } from "./toast"

export interface Toggle {
  on: boolean
  count: number
}

interface Plan {
  /** Ask the server for this state. */
  send: (on: boolean) => Promise<ApiResult<{ on: boolean; count?: number }>>
  /** Write the server's answer where the post (or comment) lives. */
  apply: (t: Toggle) => void
  /** The server agreed with the last press; `from` is what was shown before the first one. */
  done?: (t: Toggle, from: Toggle) => void
}

interface Entry {
  /** The server's last word (before any answer: what was shown at the first press). */
  base: Toggle
  from: Toggle
  want: boolean
  plan: Plan
}

const entries = new Map<string, Entry>()
const listeners = new Map<string, Set<() => void>>()

function shown(e: Entry): Toggle {
  return { on: e.want, count: Math.max(0, e.base.count + (e.want === e.base.on ? 0 : e.want ? 1 : -1)) }
}

/** Kept per key until the server agrees, so the same object is handed back while nothing changes. */
const snapshots = new Map<string, Toggle | null>()

function emit(key: string): void {
  const e = entries.get(key)
  snapshots.set(key, e ? shown(e) : null)
  for (const l of listeners.get(key) ?? []) l()
}

/** What a press on `key` is waiting to hear about, or null when nothing is. */
export function intentOf(key: string): Toggle | null {
  return snapshots.get(key) ?? null
}

/** The same, for a component: it draws again when a press starts or ends. */
export function useIntent(key: string): Toggle | null {
  return useSyncExternalStore(
    (cb) => {
      let set = listeners.get(key)
      if (!set) listeners.set(key, (set = new Set()))
      set.add(cb)
      return () => {
        set!.delete(cb)
        if (!set!.size) listeners.delete(key)
      }
    },
    () => intentOf(key),
    () => null,
  )
}

/**
 * A press. `current` is what the component shows now; the new state is
 * drawn before this returns, and the server is asked unless a request for
 * this key is already on its way.
 */
export function press(key: string, current: Toggle, plan: Plan): Toggle {
  let e = entries.get(key)
  const busy = !!e
  if (!e) {
    e = { base: current, from: current, want: current.on, plan }
    entries.set(key, e)
  }
  e.plan = plan
  e.want = !e.want
  const next = shown(e)
  /*
    Only the buttons that show this key draw again (useIntent); the post in
    the feed's lists is written once, when the server has answered, so a
    burst of presses never redraws the feed around it.
  */
  emit(key)
  if (!busy) void run(key, e)
  return next
}

async function run(key: string, e: Entry): Promise<void> {
  while (e.want !== e.base.on) {
    const asked = e.want
    const r = await e.plan.send(asked)
    if (r.ok === false) {
      if (e.want === asked) {
        /* The latest wish was refused: back to the server's last word. */
        entries.delete(key)
        e.plan.apply(e.base)
        emit(key)
        const said = (r as { error?: string }).error
        if (said) toast(said)
        return
      }
      /* Refused, but already taken back: the server still holds the base, which is what is wanted. */
      break
    }
    const got = (r as { data: { on: boolean; count?: number } }).data
    e.base = { on: got.on, count: typeof got.count === "number" ? got.count : e.base.count + (got.on === e.base.on ? 0 : got.on ? 1 : -1) }
  }
  entries.delete(key)
  const final = e.base
  e.plan.apply(final)
  emit(key)
  e.plan.done?.(final, e.from)
}

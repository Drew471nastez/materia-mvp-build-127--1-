"use client"

/**
 * The shell's copy of the profile photo, changed the moment Settings changes
 * it (lib/account/avatar has the rule it follows).
 *
 * Everything that draws the signed in person's photo in /app reads it here:
 * the header, the sidebar's account menu, the phone's account sheet and
 * Settings itself. A change reaches, at once and without a reload:
 *
 *   this tab       every reader above, through the store
 *   other tabs     the same, through a BroadcastChannel
 *   storelib.com   the public site's black header starts from a snapshot of
 *                  the last session kept in this browser (lib/auth/
 *                  auth-snapshot); it is corrected here, so the next page it
 *                  opens does not start on the old photo
 *   the server     Settings refreshes the route, so the header the server
 *                  draws on the next load is the same answer
 */
import { useSyncExternalStore } from "react"
import { profileAvatar } from "./avatar"
import { AUTH_SNAPSHOT_EVENT, readAuthSnapshot, writeAuthSnapshot } from "@/lib/auth/auth-snapshot"

/* ── the shell's copy, changed the moment Settings changes it ────────────── */

type Latest = { url: string | null; userId: string | null } | null
let latest: Latest = null
const listeners = new Set<() => void>()

const CHANNEL = "storelib:avatar"
let channel: BroadcastChannel | null | undefined
/** The channel to the other tabs of this browser, opened the first time anything here is used. */
function tabs(): BroadcastChannel | null {
  if (channel !== undefined) return channel
  channel = null
  if (typeof window !== "undefined") window.addEventListener(AUTH_SNAPSHOT_EVENT, () => {
    const current = readAuthSnapshot()
    if (latest && (!current?.signedIn || (latest.userId && latest.userId !== current.userId))) {
      latest = null
      for (const fn of listeners) fn()
    }
  })
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return channel
  try {
    const opened = new BroadcastChannel(CHANNEL)
    opened.onmessage = (e: MessageEvent) => {
      const data = e.data as { url?: unknown; userId?: unknown } | null
      if (!data || (data.url !== null && typeof data.url !== "string")) return
      const current = readAuthSnapshot()
      if (typeof data.userId === "string" && current?.userId !== data.userId) return
      apply(data.url as string | null)
      correctSnapshot(data.url as string | null)
    }
    channel = opened
  } catch {
    channel = null
  }
  return channel
}

const subscribe = (fn: () => void) => {
  tabs()
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const read = () => latest

/** A profile read may adopt its result only if no photo changed while it
 * was in flight. Used on editor entry and when returning to its tab. */
export const avatarReadToken = () => latest
export function acceptAvatarRead(url: string | null, started: ReturnType<typeof avatarReadToken>): boolean {
  if (latest !== started) return false
  const clean = profileAvatar(url)
  if (latest?.url !== clean) announceAvatar(clean)
  else correctSnapshot(clean)
  return true
}

function apply(url: string | null) {
  latest = { url: profileAvatar(url), userId: readAuthSnapshot()?.userId ?? null }
  for (const fn of listeners) fn()
}

/** The public site's header opens on the last session's photo: it is this one now. */
function correctSnapshot(url: string | null) {
  try {
    const snap = readAuthSnapshot()
    if (snap?.signedIn && snap.avatarUrl !== url) writeAuthSnapshot({ ...snap, avatarUrl: url })
    if (url) localStorage.setItem("_sl_avatar", url)
    else localStorage.removeItem("_sl_avatar")
  } catch {
    /* Storage refused: that header corrects itself once it has asked. */
  }
}

/** Settings saved a new photo (or removed it): every avatar in the shell, in every tab, shows it now. */
export function announceAvatar(url: string | null) {
  const clean = profileAvatar(url)
  apply(clean)
  correctSnapshot(clean)
  try {
    tabs()?.postMessage({ url: clean, userId: latest?.userId })
  } catch {
    /* A closed channel: the other tabs catch up on their next page. */
  }
}

/**
 * The photo to draw: the one just announced, else the one the server sent.
 * A committed announcement survives older in-flight reads and is cleared
 * on an account change, rather than by an unrelated subscriber's props.
 */
export function useShellAvatar(fromServer: string | null | undefined, ownerId?: string): string | null {
  const announced = useSyncExternalStore(subscribe, read, () => null)
  const server = profileAvatar(fromServer)
  /* An older server read may finish after an upload. It cannot acknowledge
     or clear a newer committed announcement for every other subscriber. */
  return announced && (!ownerId || !announced.userId || announced.userId === ownerId) ? announced.url : server
}

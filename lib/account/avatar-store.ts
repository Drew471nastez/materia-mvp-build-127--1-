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
import { useEffect, useRef, useSyncExternalStore } from "react"
import { profileAvatar } from "./avatar"
import { readAuthSnapshot, writeAuthSnapshot } from "@/lib/auth/auth-snapshot"

/* ── the shell's copy, changed the moment Settings changes it ────────────── */

type Latest = { url: string | null } | null
let latest: Latest = null
const listeners = new Set<() => void>()

const CHANNEL = "storelib:avatar"
let channel: BroadcastChannel | null | undefined
/** The channel to the other tabs of this browser, opened the first time anything here is used. */
function tabs(): BroadcastChannel | null {
  if (channel !== undefined) return channel
  channel = null
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return channel
  try {
    const opened = new BroadcastChannel(CHANNEL)
    opened.onmessage = (e: MessageEvent) => {
      const data = e.data as { url?: unknown } | null
      if (!data || (data.url !== null && typeof data.url !== "string")) return
      apply(data.url as string | null)
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

function apply(url: string | null) {
  latest = { url: profileAvatar(url) }
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
    tabs()?.postMessage({ url: clean })
  } catch {
    /* A closed channel: the other tabs catch up on their next page. */
  }
}

/**
 * The photo to draw: the one just announced, else the one the server sent.
 * When the server's own answer changes (the refresh after a save has landed)
 * it is the truth again and the announcement is let go.
 */
export function useShellAvatar(fromServer: string | null | undefined): string | null {
  const announced = useSyncExternalStore(subscribe, read, () => null)
  const server = profileAvatar(fromServer)
  const seen = useRef(server)
  useEffect(() => {
    if (seen.current === server) return
    seen.current = server
    if (!latest) return
    latest = null
    for (const fn of listeners) fn()
  }, [server])
  return announced ? announced.url : server
}

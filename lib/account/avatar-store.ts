"use client"

/**
 * The shell's copy of the profile photo, changed the moment Settings changes
 * it (lib/account/avatar has the rule it follows).
 */
import { useEffect, useRef, useSyncExternalStore } from "react"
import { profileAvatar } from "./avatar"

/* ── the shell's copy, changed the moment Settings changes it ────────────── */

type Latest = { url: string | null } | null
let latest: Latest = null
const listeners = new Set<() => void>()
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const read = () => latest

/** Settings saved a new photo (or removed it): every avatar in the shell shows it now. */
export function announceAvatar(url: string | null) {
  latest = { url: profileAvatar(url) }
  for (const fn of listeners) fn()
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

"use client"

/**
 * ===========================================================================
 *  THE BUILDER'S CLIPBOARD, KEPT FOR THE ACCOUNT
 * ===========================================================================
 * The last section, settings or block copied (lib/website-builder/
 * section-clipboard.ts), kept in this browser under the creator account it
 * was copied in, so it is still there after a page change, a reload, or on
 * another theme of the same account, and in another tab the moment it is
 * copied (the `storage` event). Also written to the system clipboard as
 * JSON, which is what Cmd/Ctrl+V reads.
 *
 * Storage can be missing or refuse (a private window, blocked site data):
 * then the copy lives for this page only, and nothing throws.
 */
import { useCallback, useSyncExternalStore } from "react"
import { decodeClip, encodeClip, type Clip } from "@/lib/website-builder/section-clipboard"

const keyFor = (owner: string | null) => `storelib:clipboard:${owner || "signed-out"}`

/** What this page holds when storage will not keep it. */
const held = new Map<string, Clip>()
const listeners = new Set<() => void>()
const notify = () => {
  for (const l of listeners) l()
}
/** Read once per change, so the snapshot is the same object until something changes. */
const cache = new Map<string, { text: string | null; clip: Clip | null }>()

export function readClip(owner: string | null): Clip | null {
  const key = keyFor(owner)
  let text: string | null = null
  try {
    text = window.localStorage.getItem(key)
  } catch {
    text = null
  }
  const hit = cache.get(key)
  if (hit && hit.text === text) return hit.clip ?? held.get(key) ?? null
  const clip = decodeClip(text)
  const mine = clip && (clip.owner === null || clip.owner === owner) ? clip : null
  cache.set(key, { text, clip: mine })
  return mine ?? held.get(key) ?? null
}

/** Keep a copy, and put it on the system clipboard. True when the system clipboard took it too. */
export async function writeClip(owner: string | null, clip: Clip): Promise<boolean> {
  const key = keyFor(owner)
  const text = encodeClip(clip)
  held.set(key, clip)
  try {
    window.localStorage.setItem(key, text)
  } catch {
    /* kept for this page only */
  }
  notify()
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* the system clipboard refused (no focus, no permission): the builder's own copy is enough to paste here */
  }
  return false
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key.startsWith("storelib:clipboard:")) cb()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener("storage", onStorage)
  }
}

/** The copy this account holds now, and how to replace it. */
export function useSectionClipboard(owner: string | null): { clip: Clip | null; write: (clip: Clip) => Promise<boolean> } {
  const clip = useSyncExternalStore(
    subscribe,
    () => readClip(owner),
    () => null,
  )
  const write = useCallback((next: Clip) => writeClip(owner, next), [owner])
  return { clip, write }
}

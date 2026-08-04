"use client"

/**
 * What you had half-written when you left.
 *
 * Every messaging app keeps this and it is always missed when it is absent: you
 * type three lines, tap the listing to check the price, come back, and the
 * field is empty. Nothing failed and nothing said anything — the text was in
 * component state and the component unmounted. On a phone, where checking
 * something else mid-message is the normal way to write one, that is a small
 * loss that happens constantly.
 *
 * Per conversation, so several half-written replies coexist, which is the whole
 * point on a marketplace where you are talking to four buyers at once.
 *
 * Deliberately localStorage rather than the server. A draft is not a message —
 * it has not been sent, it is nobody else's business, and syncing it would mean
 * uploading everything anybody ever typed and thought better of. Per-device is
 * the correct scope as well as the cheap one.
 *
 * Self-trimming, because an account that starts a lot of conversations would
 * otherwise accumulate one entry per thread forever. Oldest first, and the cap
 * is far above the number of conversations anybody has open at once.
 */

const KEY = "storelib_drafts_v1"
const CAP = 40
/** Past this a draft is not something you were writing, it is something you
 *  forgot about — and restoring it weeks later is more confusing than losing
 *  it. Two weeks is longer than any real gap and shorter than "forever". */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

type Entry = { text: string; at: number }
type Store = Record<string, Entry>

function read(): Store {
  if (typeof localStorage === "undefined") return {}
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!parsed || typeof parsed !== "object") return {}
    const cutoff = Date.now() - MAX_AGE_MS
    const out: Store = {}
    for (const [id, e] of Object.entries(parsed as Record<string, Entry>)) {
      if (e && typeof e.text === "string" && typeof e.at === "number" && e.at > cutoff) out[id] = e
    }
    return out
  } catch {
    return {}
  }
}

function write(store: Store): void {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    /* quota or private mode — a lost draft is the same as before this existed */
  }
}

export function readDraft(conversationId: string): string {
  if (!conversationId) return ""
  return read()[conversationId]?.text ?? ""
}

export function saveDraft(conversationId: string, text: string): void {
  if (!conversationId) return
  const store = read()
  if (!text.trim()) {
    // An emptied field is a deleted draft, not an empty one. Keeping the key
    // would mean the trim below evicts somebody else's real draft to make room
    // for a blank.
    if (!(conversationId in store)) return
    delete store[conversationId]
    write(store)
    return
  }
  store[conversationId] = { text, at: Date.now() }
  const entries = Object.entries(store)
  write(
    entries.length > CAP
      ? Object.fromEntries(entries.sort((a, b) => b[1].at - a[1].at).slice(0, CAP))
      : store,
  )
}

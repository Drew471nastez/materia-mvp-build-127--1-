"use client"

/**
 * Conversations this person has removed, remembered here when the database
 * cannot remember it for them.
 *
 * Deleting is supposed to be a per-party column on the conversation
 * (`buyer_deleted_at` / `seller_deleted_at`, added by 20260806). Where that
 * migration has not been run the update is refused, the row comes straight back
 * on the next load, and the delete looks like it silently failed — which, from
 * the outside, it did.
 *
 * So the id is also kept locally. It is honestly a lesser thing and the
 * limitation is worth stating rather than hiding: it is per device, so the same
 * conversation reappears on another phone, and clearing site data brings it
 * back. What it does buy is that pressing delete DELETES — on the device you
 * pressed it on, permanently, across reloads — instead of appearing to work and
 * then undoing itself.
 *
 * The list is keyed by user, because a shared device must not hide one person's
 * conversations from the next. It self-trims at 500 so it cannot grow without
 * bound on an account that clears its inbox often, and the server remains the
 * source of truth wherever it is able to be: an id the server has already
 * removed from the list costs nothing to also have in here.
 */

const KEY = "storelib_hidden_convos_v1"
const CAP = 500

/**
 * When each conversation was hidden, not merely that it was.
 *
 * The timestamp is what makes this correct rather than merely persistent, and
 * its absence was a real way to lose a message. A hidden id used to be hidden
 * forever: the row was filtered out of the inbox on this device with no rule
 * that could ever put it back, so when the other person wrote again their
 * reply arrived, sat in the database, counted towards the unread badge — and
 * was invisible. `unhideConversation` existed for exactly this and was never
 * called from anywhere.
 *
 * With a time on it, the rule is the same one the server's `buyer_deleted_at`
 * column follows: you removed the conversation AS IT WAS THEN. Anything said
 * afterwards is a new conversation with the same person, and it comes back.
 */
type Store = Record<string, Record<string, number>>

function read(): Store {
  if (typeof localStorage === "undefined") return {}
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!parsed || typeof parsed !== "object") return {}
    // Migrating the old shape, which was a bare array of ids with no times.
    // They are stamped as hidden NOW rather than at zero: zero would mean "any
    // message at all un-hides this", which would resurrect every conversation
    // anyone had ever deleted the moment this shipped.
    const out: Store = {}
    const now = Date.now()
    for (const [user, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        out[user] = Object.fromEntries(value.map((id) => [String(id), now]))
      } else if (value && typeof value === "object") {
        out[user] = value as Record<string, number>
      }
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
    /* quota, private mode — the server path still applies where it works */
  }
}

/** Conversation id → the moment it was removed, in epoch milliseconds. */
export function hiddenConversations(userId: string | null | undefined): Map<string, number> {
  if (!userId) return new Map()
  return new Map(Object.entries(read()[userId] ?? {}))
}

export function hideConversation(userId: string | null | undefined, conversationId: string): void {
  if (!userId) return
  const store = read()
  const list = store[userId] ?? {}
  // Re-stamped rather than skipped if it is already there: hiding a
  // conversation that came back is hiding it as it is NOW, and keeping the
  // original time would let the same old messages un-hide it again.
  list[conversationId] = Date.now()
  const entries = Object.entries(list)
  store[userId] =
    entries.length > CAP
      ? Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, CAP))
      : list
  write(store)
}

/** Someone wrote again, so the thread is back — the same rule the server column
 *  follows, where it exists. */
export function unhideConversation(userId: string | null | undefined, conversationId: string): void {
  if (!userId) return
  const store = read()
  const list = store[userId]
  if (!list || !(conversationId in list)) return
  delete list[conversationId]
  write(store)
}

export function clearHiddenConversations(userId: string | null | undefined): void {
  if (!userId) return
  const store = read()
  if (!store[userId]) return
  delete store[userId]
  write(store)
}

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

type Store = Record<string, string[]>

function read(): Store {
  if (typeof localStorage === "undefined") return {}
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === "object" ? (parsed as Store) : {}
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

export function hiddenConversations(userId: string | null | undefined): Set<string> {
  if (!userId) return new Set()
  return new Set(read()[userId] ?? [])
}

export function hideConversation(userId: string | null | undefined, conversationId: string): void {
  if (!userId) return
  const store = read()
  const list = store[userId] ?? []
  if (list.includes(conversationId)) return
  store[userId] = [conversationId, ...list].slice(0, CAP)
  write(store)
}

/** Someone wrote again, so the thread is back — the same rule the server column
 *  follows, where it exists. */
export function unhideConversation(userId: string | null | undefined, conversationId: string): void {
  if (!userId) return
  const store = read()
  const list = store[userId]
  if (!list?.length) return
  store[userId] = list.filter((id) => id !== conversationId)
  write(store)
}

export function clearHiddenConversations(userId: string | null | undefined): void {
  if (!userId) return
  const store = read()
  if (!store[userId]) return
  delete store[userId]
  write(store)
}

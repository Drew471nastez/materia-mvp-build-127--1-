/**
 * ===========================================================================
 *  WHAT IS UNREAD, SHARED BY THE BELL AND THE PANEL
 * ===========================================================================
 * The panel (components/app/notifications-modal.tsx) and the count on the
 * bell (both headers in components/app/sidebar.tsx) have to agree, and "Mark
 * all as read" has to take the count to nothing the moment it is pressed, not
 * on the next page. So what is unread lives in one small store here that both
 * read, instead of each working it out for itself.
 *
 * TWO KINDS OF NOTIFICATION.
 *   From the database (seller_notifications): a new review, and what the
 *     rules engine decides a creator should hear (lib/notifications/engine).
 *     Read or not is `read_at`, set on the server; the store keeps how many
 *     are unread, as the server last said, less what was read since. A row
 *     that resolved itself is not counted.
 *   Made in the browser: "set up payments", "publish your OnePage". They are
 *     to-dos worked out from the creator's state, with no row anywhere, so
 *     whether one has been read, or dismissed, is kept in this browser's
 *     localStorage, as dismissing them always was. One steps aside when the
 *     server says a row of its own covers it (`covered`).
 *
 * "SET UP PAYMENTS" CANNOT BE PUT AWAY. "If the user needs to connect Stripe
 * to get paid, it must appear in notifications." A tap on it used to dismiss
 * it for good in that browser, so a creator who opened Payments once and
 * left without finishing never saw it again. It is in STAYS_UNTIL_DONE now:
 * a tap marks it read, it stays in the list, and a dismissal an older build
 * wrote to localStorage is ignored. It goes when Stripe is connected
 * (setupNotificationIds stops naming it) or when a server row says the same
 * thing better (`covered`: payouts_not_connected, stripe_restricted,
 * stripe_requirements_due in lib/notifications/rules).
 *
 * Every localStorage read and write is in a try/catch: a private window, a
 * blocked site or a full quota gives an empty list, never a crash.
 *
 * Pure apart from the storage it is handed, so tests/notifications-panel.test.ts
 * can drive it without a browser.
 */

export const DISMISSED_KEY = "storelib_dismissed_notifications"
export const READ_KEY = "storelib_read_notifications"
export const UNREAD_ONLY_KEY = "storelib_notifications_unread_only"

export interface UnreadState {
  /** Unread rows in seller_notifications, as the server last counted them. */
  dbUnread: number
  /** Browser-made notifications dismissed in this browser. */
  dismissed: readonly string[]
  /** Browser-made notifications read in this browser. */
  read: readonly string[]
  /**
   * Browser-made notifications an open row from the server already says
   * better, so they step aside: "Set up payments" while a row says "Stripe
   * paused your payouts" (app/api/notifications, `covered`).
   */
  covered?: readonly string[]
}

export const EMPTY_STATE: UnreadState = Object.freeze({ dbUnread: 0, dismissed: Object.freeze([]), read: Object.freeze([]), covered: Object.freeze([]) })

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

export function readIds(key: string, store: Storage | null = storage()): string[] {
  try {
    const raw = store?.getItem(key)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

export function writeIds(key: string, ids: readonly string[], store: Storage | null = storage()): void {
  try {
    store?.setItem(key, JSON.stringify(ids))
  } catch {
    /* Not remembered; this visit still shows it. */
  }
}

/** "View unread only", remembered per viewer. Off when nothing was saved. */
export function readUnreadOnly(store: Storage | null = storage()): boolean {
  try {
    return store?.getItem(UNREAD_ONLY_KEY) === "1"
  } catch {
    return false
  }
}

export function writeUnreadOnly(on: boolean, store: Storage | null = storage()): void {
  try {
    store?.setItem(UNREAD_ONLY_KEY, on ? "1" : "0")
  } catch {
    /* Not remembered; this visit still filters. */
  }
}

/**
 * The browser-made notifications this creator has, before dismissing:
 * the same conditions the panel draws them from.
 */
export function setupNotificationIds(opts: { stripeConnected: boolean; stripeStatus: string; onePagePublished: boolean }): string[] {
  const ids: string[] = []
  if (!opts.onePagePublished) ids.push("onepage-setup")
  if (!opts.stripeConnected || (opts.stripeStatus !== "enabled" && opts.stripeStatus !== "connected")) ids.push("payment-setup")
  return ids
}

/** Browser-made to-dos that stay until they are done: a tap reads them, nothing dismisses them. */
export const STAYS_UNTIL_DONE: readonly string[] = ["payment-setup"]

export function staysUntilDone(id: string): boolean {
  return STAYS_UNTIL_DONE.includes(id)
}

/**
 * Whether a browser-made to-do the creator has (setupNotificationIds) is in
 * the list: not dismissed here, unless it is one that stays until done, and
 * not covered by a server row.
 */
export function setupShown(id: string, state: Pick<UnreadState, "dismissed" | "covered">): boolean {
  if ((state.covered ?? []).includes(id)) return false
  return staysUntilDone(id) || !state.dismissed.includes(id)
}

/** The number on the bell. */
export function unreadCount(state: UnreadState, setupIds: readonly string[]): number {
  const local = setupIds.filter((id) => setupShown(id, state) && !state.read.includes(id)).length
  return local + Math.max(0, state.dbUnread)
}

/* ─── Marking every notification read, with a way back ──────────────── */

export interface DbRow {
  id: string
  read_at: string | null
}

/**
 * What "Mark all as read" changes before the server has answered: every
 * unread row read at `at`, every browser-made one read, and the database
 * count at nothing. The `undo` puts back exactly what it changed, and only
 * that, so a notification read some other way meanwhile stays read.
 */
export function markAllRead<T extends DbRow>(
  rows: readonly T[],
  state: UnreadState,
  setupIds: readonly string[],
  at: string,
): { rows: T[]; state: UnreadState; undo: (rows: readonly T[], state: UnreadState) => { rows: T[]; state: UnreadState } } {
  const changed = new Set(rows.filter((r) => !r.read_at).map((r) => r.id))
  const newlyRead = setupIds.filter((id) => !state.read.includes(id))
  const next: UnreadState = { ...state, dbUnread: 0, read: [...state.read, ...newlyRead] }
  const priorDbUnread = state.dbUnread
  return {
    rows: rows.map((r) => (changed.has(r.id) ? { ...r, read_at: at } : r)),
    state: next,
    undo: (current, now) => ({
      rows: current.map((r) => (changed.has(r.id) && r.read_at === at ? { ...r, read_at: null } : r)),
      /* The database count as it was, unless the server has said something
         newer since. The browser-made ones stay read; that part could not
         fail. */
      state: { ...now, dbUnread: now.dbUnread === 0 ? priorDbUnread : now.dbUnread },
    }),
  }
}

/* ─── The store ─────────────────────────────────────────────────────── */

let state: UnreadState = EMPTY_STATE
let loaded = false
const listeners = new Set<() => void>()

function emit() {
  for (const fn of listeners) fn()
}

export function subscribeUnread(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getUnreadState(): UnreadState {
  return state
}

export function getServerUnreadState(): UnreadState {
  return EMPTY_STATE
}

/** Reads what this browser remembers, once. */
export function loadRemembered(): void {
  if (loaded || typeof window === "undefined") return
  loaded = true
  setUnreadState({ ...state, dismissed: readIds(DISMISSED_KEY), read: readIds(READ_KEY) })
}

export function setUnreadState(next: UnreadState): void {
  if (next === state) return
  const readChanged = next.read !== state.read && next.read.join() !== state.read.join()
  const dismissedChanged = next.dismissed !== state.dismissed && next.dismissed.join() !== state.dismissed.join()
  state = next
  if (readChanged) writeIds(READ_KEY, next.read)
  if (dismissedChanged) writeIds(DISMISSED_KEY, next.dismissed)
  emit()
}

export function setDbUnread(count: number): void {
  const n = Math.max(0, Math.floor(count) || 0)
  if (n !== state.dbUnread) setUnreadState({ ...state, dbUnread: n })
}

/** Which browser-made to-dos the server says are covered by one of its rows. */
export function setCovered(ids: unknown): void {
  const next = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string").slice(0, 10) : []
  if (next.join() !== (state.covered ?? []).join()) setUnreadState({ ...state, covered: next })
}

/** A browser-made notification read from its own row, kept in the list. */
export function markSetupNotificationRead(id: string): void {
  if (!state.read.includes(id)) setUnreadState({ ...state, read: [...state.read, id] })
}

/** Put away for good in this browser; one that stays until done is only read. */
export function dismissSetupNotification(id: string): void {
  if (staysUntilDone(id)) return markSetupNotificationRead(id)
  if (!state.dismissed.includes(id)) setUnreadState({ ...state, dismissed: [...state.dismissed, id] })
}

let counting: Promise<void> | null = null

/**
 * The server's unread count, asked once per page load however many bells
 * are drawn (a computer's header and a phone's), and again whenever the
 * panel opens, which reads it with the list.
 */
export function refreshDbUnread(): Promise<void> {
  if (counting) return counting
  counting = fetch("/api/notifications?summary=1", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data && typeof data.unreadCount === "number") setDbUnread(data.unreadCount)
      if (data && "covered" in data) setCovered(data.covered)
    })
    .catch(() => {
      /* The bell shows the setup to-dos only; the panel will ask again. */
    })
  return counting
}

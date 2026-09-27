/**
 * ===========================================================================
 *  THE ONEPAGE EDITOR'S RULES FOR HISTORY, SAVING AND EMPTY LINKS
 * ===========================================================================
 * The parts of lib/onepage/context.tsx that are decisions rather than React:
 * when a keystroke joins the undo step before it, when a finished save may
 * call the page clean, how saves requested on top of each other are lined
 * up, what a failed save says, which links count as having an address, and
 * what a social row should hold. They live here, free of React and the
 * browser, so tests/onepage-save.test.ts can run them in node instead of
 * describing them.
 *
 * Nothing in this file imports anything, not even ./types: the push suite
 * type-checks every file a test reaches, and a test of these rules should
 * not fail on an unrelated line of the block types. The social row's shape
 * is written out below instead; it is SocialRowBlockData["platforms"].
 */

/* ───────────────────────────── Undo history ───────────────────────────── */

/** How many undo steps are kept. The oldest falls off the bottom. */
export const HISTORY_LIMIT = 50

/**
 * HOW CLOSE TOGETHER TWO EDITS HAVE TO BE TO BE ONE UNDO STEP.
 *
 * Every keystroke in a title used to be its own step, so undoing a word took
 * one press per letter, and the history filled its fifty places with one
 * sentence. Edits to the same field of the same thing, each within this long
 * of the one before, are one step now. The window slides: a person typing
 * steadily stays in one step until they pause.
 */
export const HISTORY_MERGE_MS = 500

export interface HistoryStack<T> {
  entries: T[]
  index: number
  /**
   * The edit that made `entries[index]`, while more of the same edit can
   * still join it. Undo and redo close it, so the first edit after an undo
   * always starts a step of its own instead of rewriting the one undone to.
   */
  openKey: string | null
  openAt: number
}

export function startHistory<T>(state: T): HistoryStack<T> {
  return { entries: [state], index: 0, openKey: null, openAt: 0 }
}

/**
 * Records an edit. `key` names what was edited ("block:<id>:label"); null
 * means an edit that is always a step of its own, like adding or moving a
 * block.
 */
export function recordEdit<T>(stack: HistoryStack<T>, state: T, key: string | null, now: number): HistoryStack<T> {
  const joins =
    key !== null &&
    stack.openKey === key &&
    stack.index > 0 &&
    stack.index === stack.entries.length - 1 &&
    now - stack.openAt <= HISTORY_MERGE_MS
  if (joins) {
    const entries = stack.entries.slice()
    entries[stack.index] = state
    return { entries, index: stack.index, openKey: key, openAt: now }
  }
  const entries = stack.entries.slice(0, stack.index + 1)
  entries.push(state)
  while (entries.length > HISTORY_LIMIT) entries.shift()
  return { entries, index: entries.length - 1, openKey: key, openAt: now }
}

/**
 * Puts `state` where the current step is, without making a new one. For
 * changes nobody typed (a thumbnail that arrived, a social row brought in
 * line with the social links): undo should not stop on them, but the step
 * the person is standing on has to carry them, or the next undo and redo
 * would bring back a page without them.
 */
export function replaceCurrent<T>(stack: HistoryStack<T>, state: T): HistoryStack<T> {
  const entries = stack.entries.slice()
  entries[stack.index] = state
  return { ...stack, entries }
}

export function stepBack<T>(stack: HistoryStack<T>): HistoryStack<T> | null {
  if (stack.index <= 0) return null
  return { ...stack, index: stack.index - 1, openKey: null, openAt: 0 }
}

export function stepForward<T>(stack: HistoryStack<T>): HistoryStack<T> | null {
  if (stack.index >= stack.entries.length - 1) return null
  return { ...stack, index: stack.index + 1, openKey: null, openAt: 0 }
}

export function canStepBack(stack: HistoryStack<unknown> | null): boolean {
  return !!stack && stack.index > 0
}

export function canStepForward(stack: HistoryStack<unknown> | null): boolean {
  return !!stack && stack.index < stack.entries.length - 1
}

/**
 * The names of the fields `next` changes on `prev`, shallowly and sorted,
 * so the same edit always produces the same history key.
 */
export function changedFields(prev: Record<string, unknown> | null | undefined, next: Record<string, unknown>): string[] {
  const before = prev || {}
  return Object.keys(next)
    .filter((k) => !Object.is(before[k], next[k]))
    .sort()
}

export function editKey(scope: string, id: string | null, fields: string[]): string | null {
  if (fields.length === 0) return null
  return `${scope}:${id ?? ""}:${fields.join(",")}`
}

/* ─────────────────────────────── Saving ──────────────────────────────── */

export interface SaveResult {
  ok: boolean
  /** What the person is told when it failed, short enough for a toast. */
  error?: string
  /** The server's own words, when it gave any. */
  serverMessage?: string
  /** The HTTP status; null when the request never got an answer. */
  status?: number | null
}

/**
 * A SAVE MAY CALL THE PAGE CLEAN ONLY IF NOTHING CHANGED WHILE IT RAN.
 *
 * Every edit moves a counter on. A save notes the counter when it takes its
 * copy of the page, and when the server has answered it compares: the same
 * number means what was sent is what is on screen, so the page is clean. A
 * different number means somebody typed while the request was out, and those
 * letters were not in it; calling the page clean then is what made "Saved"
 * appear over text the server had never seen.
 */
export function cleanAfterSave(sentRevision: number, currentRevision: number): boolean {
  return sentRevision === currentRevision
}

/**
 * ONE SAVE AT A TIME, AND NONE DROPPED.
 *
 * A save asked for while another is out used to return at once, and whoever
 * asked went on to say "Changes saved" about a save that never ran. Now the
 * request waits for the one in flight and then runs once more, reading the
 * page as it is by then, so an edit made during the first request is sent by
 * the second. However many requests arrive meanwhile they share that one
 * follow-up. If by the time it could run nothing is left to send
 * (`stillNeeded` says no), it does not run and answers `nothingLeft()`.
 */
export function serializeSaves<R>(
  run: () => Promise<R>,
  stillNeeded: () => boolean,
  nothingLeft: () => R,
): () => Promise<R> {
  let inFlight: Promise<R> | null = null
  let queued: Promise<R> | null = null

  const start = (): Promise<R> => {
    const p = run()
    inFlight = p
    const clear = () => {
      if (inFlight === p) inFlight = null
    }
    p.then(clear, clear)
    return p
  }

  return () => {
    if (queued) return queued
    if (!inFlight) return start()
    const settled = inFlight.then(
      () => undefined,
      () => undefined,
    )
    queued = settled.then(() => {
      queued = null
      return stillNeeded() ? start() : nothingLeft()
    })
    return queued
  }
}

/**
 * What a failed save says. The server's message is kept on the result for
 * the console; this is the line a person reads in the toast, so it names
 * what happened in words they would use.
 */
export function describeSaveFailure(status: number | null, serverMessage: string | null | undefined): string {
  if (status === null) return "No connection. Nothing was saved"
  if (status === 401) return "You are signed out. Sign in to save"
  if (status === 400 && /slug/i.test(serverMessage || "")) return "That page address is taken"
  /* The editor's own route words a refusal as a sentence to show (app/api/onepage, lib/onepage/settings-rules). */
  if (status === 400 && serverMessage && serverMessage.length <= 120 && !/[{}<>]/.test(serverMessage)) return serverMessage
  return "Couldn't save. Try again"
}

/* ──────────────────────────────── Links ──────────────────────────────── */

/**
 * WHETHER A LINK HAS SOMEWHERE TO GO.
 *
 * A new page used to go live with two "My Link" buttons whose address was
 * "https://": the check was `!!url`, and "https://" is a truthy string. A
 * scheme with nothing after it ("https://", "http://", "mailto:") is no
 * address, and the published page leaves the button out until one is typed.
 */
export function hasRealUrl(url: unknown): boolean {
  if (typeof url !== "string") return false
  const trimmed = url.trim()
  if (!trimmed) return false
  const rest = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/{0,2}/i, "")
  return rest.length > 0
}

/* ───────────────────────────── Social row ────────────────────────────── */

/** One entry of SocialRowBlockData["platforms"] in ./types.ts. */
type SocialPlatformEntry = { platform: any; url: string }

/**
 * WHAT A SOCIAL ROW SHOULD HOLD FOR THESE SOCIAL LINKS, OR NULL WHEN IT
 * ALREADY DOES.
 *
 * The row keeps its own copy of each platform and address, in the order the
 * person dragged them into. The links themselves are the truth: a platform
 * whose link was removed leaves the row, a new one joins at the end, and an
 * address edited in the social links is the address the row carries. That
 * last part was missing, so an edited handle kept the old address on the
 * published page.
 *
 * Returning null when nothing differs is the point. The editor runs this on
 * every render of the Links tab, and a row that was rewritten with the same
 * contents on load marked the page unsaved before anybody touched it.
 */
export function syncedSocialPlatforms(
  current: SocialPlatformEntry[] | null | undefined,
  socialLinks: object | null | undefined,
): SocialPlatformEntry[] | null {
  const links = (socialLinks || {}) as Record<string, string | null | undefined>
  const existing = current || []
  const seen = new Set<string>()
  const next: SocialPlatformEntry[] = []
  for (const entry of existing) {
    const url = links[entry.platform as string]
    if (!url || seen.has(entry.platform as string)) continue
    seen.add(entry.platform as string)
    next.push(entry.url === url ? entry : { ...entry, url })
  }
  for (const [platform, url] of Object.entries(links)) {
    if (!url || seen.has(platform)) continue
    seen.add(platform)
    next.push({ platform, url })
  }
  const same =
    next.length === existing.length &&
    next.every((entry, i) => entry.platform === existing[i].platform && entry.url === existing[i].url)
  return same ? null : next
}

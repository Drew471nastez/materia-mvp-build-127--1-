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
  /* Round AU: the page was saved from another tab or device since this editor opened it (app/api/onepage PUT). */
  if (status === 409) return "This page was saved somewhere else. Save again to keep this version"
  if (status === 400 && /slug/i.test(serverMessage || "")) return "That page address is taken"
  /* The editor's own route words a refusal as a sentence to show (app/api/onepage, lib/onepage/settings-rules). */
  if (status === 400 && serverMessage && serverMessage.length <= 120 && !/[{}<>]/.test(serverMessage)) return serverMessage
  return "Couldn't save. Try again"
}

/**
 * WHETHER A FAILED SAVE IS TRIED AGAIN ON ITS OWN (round AU). No answer at
 * all (a dropped connection, a tunnel, the app in the background) and a
 * server that was busy or down are worth another go; a refusal (signed out,
 * a field the server will not take, a conflict, a paid setting) says the
 * same thing however often it is asked.
 */
export function retryableSave(status: number | null): boolean {
  return status === null || status === 408 || status === 429 || status >= 500
}

/** How long before the next try: 2s, 5s, 10s, 20s, 40s, then a minute. */
export function retryDelay(attempt: number): number {
  const steps = [2000, 5000, 10000, 20000, 40000]
  return attempt < steps.length ? steps[Math.max(0, attempt)] : 60000
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

/* ──────────────────────────── Page address ───────────────────────────── */

/**
 * THE ADDRESS THE EDITOR SHARES IS THE ONE THAT IS LIVE.
 *
 * A new address typed in Settings is put in the page when the tab is left or
 * Save is pressed, and it is live only once a save takes it. Copy link, Open
 * in a new tab and the share sheet read the page's own slug, so in between
 * (or after a save refused it as taken) they handed out an address that went
 * nowhere, or to somebody else's page. They read the address as last saved;
 * the page's own slug only when no save is known yet.
 */
export function liveSlug(savedSlug: unknown, draftSlug: unknown): string {
  if (typeof savedSlug === "string" && savedSlug.trim() !== "") return savedSlug
  return typeof draftSlug === "string" ? draftSlug : ""
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

/*
 * ===========================================================================
 *  WHAT A SAVE SENDS (the OnePage production audit, S1 and S2)
 * ===========================================================================
 * The blocks, the archive, the look and the bio are sent whole on every Save:
 * the route checks them against the copy this editor started from
 * (lib/onepage/edit-version) and refuses a save over a newer one.
 *
 * Everything else other screens write too (the name and the photo from the
 * profile, the social links from the creator page, settings and the share
 * picture from their own panels, the address) is sent ONLY when this editor
 * changed it since its last save, and settings and social links key by key.
 * They used to be sent whole every time, unchecked, so an editor left open
 * put yesterday's links, name or settings back over today's.
 *
 * `lastSaved` is the editor's record of the page as it was last saved, in
 * savedFields' order: [title, bio, avatar_video_url, slug, theme, settings,
 * social_links, draft_blocks, archived_blocks, share_image_mode]. Without
 * one, everything is sent, as before. Pure, for tests/onepage-production-audit.
 */
type SavePage = {
  id: string
  title?: unknown
  bio?: unknown
  avatar_video_url?: unknown
  slug?: unknown
  theme?: unknown
  settings?: object | null
  social_links?: object | null
  draft_blocks?: unknown
  share_image_mode?: unknown
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export function saveRequestBody(page: SavePage, archived: unknown, lastSaved: string | null, baseVersion: string | null): Record<string, unknown> {
  const body: Record<string, unknown> = {
    id: page.id,
    draft_blocks: page.draft_blocks,
    archived_blocks: archived,
    theme: page.theme,
    bio: page.bio,
    publish: true,
  }
  if (baseVersion) body.base_version = baseVersion
  let last: unknown[] | null = null
  try {
    const parsed = lastSaved ? JSON.parse(lastSaved) : null
    last = Array.isArray(parsed) ? parsed : null
  } catch {
    last = null
  }
  if (!last) {
    body.title = page.title
    body.avatar_video_url = page.avatar_video_url ?? null
    body.slug = page.slug
    body.settings = page.settings ?? {}
    body.social_links = page.social_links ?? {}
    if (page.share_image_mode !== undefined) body.share_image_mode = page.share_image_mode
    return body
  }
  const [title, , video, slug, , settings, social, , , share] = last
  if (!sameValue(page.title, title)) body.title = page.title
  if (!sameValue(page.avatar_video_url, video)) body.avatar_video_url = page.avatar_video_url ?? null
  if (!sameValue(page.slug, slug)) body.slug = page.slug
  if (!sameValue(page.share_image_mode, share)) body.share_image_mode = page.share_image_mode ?? null

  const nowSettings = (page.settings ?? {}) as Record<string, unknown>
  const thenSettings = (settings && typeof settings === "object" ? settings : {}) as Record<string, unknown>
  const settingsPatch: Record<string, unknown> = {}
  for (const key of new Set([...Object.keys(nowSettings), ...Object.keys(thenSettings)])) {
    if (!sameValue(nowSettings[key], thenSettings[key])) settingsPatch[key] = nowSettings[key] === undefined ? null : nowSettings[key]
  }
  if (Object.keys(settingsPatch).length > 0) body.settings = settingsPatch

  const nowLinks = (page.social_links ?? {}) as Record<string, unknown>
  const thenLinks = (social && typeof social === "object" ? social : {}) as Record<string, unknown>
  const linksPatch: Record<string, string> = {}
  for (const key of new Set([...Object.keys(nowLinks), ...Object.keys(thenLinks)])) {
    if (!sameValue(nowLinks[key], thenLinks[key])) linksPatch[key] = typeof nowLinks[key] === "string" ? (nowLinks[key] as string) : ""
  }
  if (Object.keys(linksPatch).length > 0) body.social_links_patch = linksPatch
  return body
}

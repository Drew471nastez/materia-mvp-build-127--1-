"use client"

import { fetchWithin } from "./load-guard"

/**
 * ===========================================================================
 *  ASK THE SERVER FOR A NEW COVER, ONCE, AFTER THE SAVING HAS STOPPED
 * ===========================================================================
 * The website page's cover is two screenshots of the saved home page, taken
 * by a real browser on the server (app/api/website-builder/themes/
 * [installId]/cover). This is the editor's half: after a save, ask for them.
 *
 * NOT AFTER EVERY SAVE. Autosave runs a second and a half after each change,
 * so a few minutes of editing is dozens of saves, and each cover is a browser
 * launch. So a save starts a quiet period, every further save restarts it,
 * and only when the saving has stopped for QUIET_MS is one cover asked for —
 * twenty saves, one screenshot.
 *
 * NOTHING HERE CAN FAIL A SAVE. The save has already succeeded by the time
 * this runs; a cover that cannot be taken leaves the last one where it is,
 * and the website page asks again the next time it sees the cover is older
 * than the site.
 *
 * This replaces an in-browser capture that photographed the editor's own
 * canvas with html-to-image. See lib/website-builder/cover-shot.ts for why a
 * real browser on the server is the only version of this that is right.
 *
 * ===========================================================================
 *  THE COVER WAS STALE AFTER EDITING ON A PHONE, AND THIS IS WHY
 * ===========================================================================
 * The app keeps a page it has shown for five minutes (`staleTimes` in
 * next.config). Edit on a phone, press Back, and the Website page came back
 * from that memory: the list of sites as it was BEFORE the edit, with the
 * old "last edited" time, so its cover looked current and nothing asked for
 * a new one. The editor's own request was still running on the server, and
 * its answer went nowhere, because the page that would have shown it had
 * been handed an old copy of itself.
 *
 * So this module remembers, for the life of the tab, two things the page
 * can check against whatever copy it was handed:
 *
 *   when each site was last saved here (`savedAt`), so a page older than
 *   that knows to ask the server again, and
 *
 *   the newest cover each site has had (`latestCover`), so a cover that
 *   arrived while the page was not looking is drawn at once, without being
 *   taken a second time.
 *
 * And one request per site at a time: the editor flushing on the way out
 * and the Website page arriving a moment later ask for the same cover, and
 * now share one browser launch instead of starting two. A cover's address
 * changes only when a new one is taken, so an unchanged cover is never
 * downloaded again: the browser already has it under that address.
 */

export const QUIET_MS = 12_000

/**
 * The longest a page waits on the cover route: its own 60 seconds and a
 * little. A request the network dropped without a word used to leave the
 * card "Preparing preview" for the rest of the visit.
 */
export const REQUEST_WAIT_MS = 70_000
/** One look at the cover as it is (GET, one storage listing). */
const LOOK_WAIT_MS = 10_000

export interface Cover {
  url: string
  mobile_url: string | null
  updated_at: string
}

let timer: ReturnType<typeof setTimeout> | null = null
let pendingInstall: string | null = null

const inflight = new Map<string, Promise<Cover | null>>()
const covers = new Map<string, Cover>()
const saves = new Map<string, number>()

/** When this tab last saved the site, or 0. */
export function savedAt(installId: string): number {
  return saves.get(installId) ?? 0
}

/** The newest cover this tab has seen for the site, if any. */
export function latestCover(installId: string): Cover | null {
  return covers.get(installId) ?? null
}

export function scheduleCoverRefresh(installId: string) {
  if (typeof window === "undefined") return
  saves.set(installId, Date.now())
  pendingInstall = installId
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    const id = pendingInstall
    pendingInstall = null
    if (id) void requestCover(id)
  }, QUIET_MS)
}

/**
 * The editor is closing. A save that has not had its cover yet asks for it
 * now rather than never: `keepalive` lets the request outlive the page, and
 * the route does the rest on the server.
 */
export function flushCoverRefresh() {
  if (timer) clearTimeout(timer)
  timer = null
  const id = pendingInstall
  pendingInstall = null
  if (id) void requestCover(id)
}

export function requestCover(installId: string): Promise<Cover | null> {
  const running = inflight.get(installId)
  if (running) return running
  const ask = (async () => {
    try {
      const res = await fetchWithin(`/api/website-builder/themes/${encodeURIComponent(installId)}/cover`, {
        method: "POST",
        keepalive: true,
      }, REQUEST_WAIT_MS)
      if (!res.ok) return null
      const cover = (await res.json()) as Cover
      remember(installId, cover)
      return cover
    } catch {
      return null
    } finally {
      inflight.delete(installId)
    }
  })()
  inflight.set(installId, ask)
  return ask
}

/** Kept for the tab when it is newer than what the tab has. */
function remember(installId: string, cover: Cover | null | undefined) {
  if (!cover?.url) return
  const known = covers.get(installId)
  if (!known || Date.parse(cover.updated_at) >= Date.parse(known.updated_at)) covers.set(installId, cover)
}

/**
 * A cover the answer that made the website brought with it (import, add,
 * duplicate): known to the tab at once, so the row shows it on its first
 * frame, and a copy of the page handed back from the router's memory later
 * shows it too.
 */
export function seedCover(installId: string, cover: Cover | null | undefined) {
  remember(installId, cover)
}

/**
 * ===========================================================================
 *  WAITING FOR A PHOTOGRAPH THAT IS ALREADY BEING TAKEN
 * ===========================================================================
 * A new website whose photograph did not fit in its answer is being taken
 * on the server after it (lib/website-builder/cover-take.ts coverWithin).
 * Asking the cover route to take another would launch a second browser for
 * the same picture, so the page only LOOKS: GET on the same route is one
 * storage listing. Every 2 seconds at first, then a little less often, for
 * about 30 seconds in all; the moment a picture is there it is returned.
 * Null when none came in that time, and the caller can ask for one then.
 */
export const WATCH_STEPS_MS = [2000, 2000, 2000, 3000, 3000, 4000, 4000, 5000, 5000]

const watching = new Map<string, Promise<Cover | null>>()

/** The look already underway for this site (started where it was made), or null. */
export function coverBeingWatched(installId: string): Promise<Cover | null> | null {
  return watching.get(installId) ?? null
}

export function watchCover(installId: string, steps: readonly number[] = WATCH_STEPS_MS): Promise<Cover | null> {
  const running = watching.get(installId)
  if (running) return running
  const look = (async () => {
    try {
      for (const wait of steps) {
        await new Promise((r) => setTimeout(r, wait))
        try {
          const res = await fetchWithin(`/api/website-builder/themes/${encodeURIComponent(installId)}/cover`, { cache: "no-store" }, LOOK_WAIT_MS)
          if (!res.ok) continue
          const cover = (await res.json()) as Cover | { url: null }
          if (cover?.url) {
            remember(installId, cover as Cover)
            return cover as Cover
          }
        } catch {
          /* a dropped look is followed by the next one */
        }
      }
      return null
    } finally {
      watching.delete(installId)
    }
  })()
  watching.set(installId, look)
  return look
}

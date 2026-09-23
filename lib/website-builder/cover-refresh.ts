"use client"

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
 */

export const QUIET_MS = 12_000

let timer: ReturnType<typeof setTimeout> | null = null
let pendingInstall: string | null = null

export function scheduleCoverRefresh(installId: string) {
  if (typeof window === "undefined") return
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

export async function requestCover(installId: string): Promise<{ url: string; mobile_url: string | null; updated_at: string } | null> {
  try {
    const res = await fetch(`/api/website-builder/themes/${encodeURIComponent(installId)}/cover`, {
      method: "POST",
      keepalive: true,
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
